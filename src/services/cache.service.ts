import { getClient, isRedisReady } from "../config/redis";
import config from "../config/env";
import logger from "../utils/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CacheTTL = number; // seconds

/** Pre-defined TTL tiers based on data volatility */
export const TTL = {
    /** Configuration master data (tax brackets, pension rules, etc.) */
    CONFIG_MASTER: 60 as CacheTTL,          // 1 minute
    /** Payroll periods */
    PAYROLL_PERIOD: 60 as CacheTTL,         // 1 minute
    /** Batch data */
    BATCH: 60 as CacheTTL,                  // 1 minute
    /** Employee lists — filtered/sorted */
    EMPLOYEE_LIST: 60 as CacheTTL,          // 1 minute
    /** Individual entity lookup */
    ENTITY: 60 as CacheTTL,                 // 1 minute
    /** Fiscal years */
    FISCAL_YEAR: 60 as CacheTTL,            // 1 minute
    /** Very short — for data that must be fresh */
    SHORT: 60 as CacheTTL,                  // 1 minute
} as const;

// ─── Cache Key Helpers ──────────────────────────────────────────────────────

const PREFIX = config.redis.keyPrefix;

/** Build a namespaced cache key */
function key(...parts: string[]): string {
    return `${PREFIX}${parts.join(":")}`;
}

/** Build a tag key (stores a SET of cache keys for bulk invalidation) */
function tagKey(tag: string): string {
    return `${PREFIX}tags:${tag}`;
}

// ─── Serialisation ──────────────────────────────────────────────────────────

/**
 * Custom JSON replacer that handles:
 * - BigInt → number (safe up to 2^53)
 * - Date → ISO string
 * - Prisma Decimal → number
 */
function serialize(value: unknown): string {
    return JSON.stringify(value, (_key, val) => {
        if (typeof val === "bigint") return Number(val);
        if (val instanceof Date) return val.toISOString();
        if (val?.constructor?.name === "Decimal") return Number(val);
        return val;
    });
}

// ─── Cache Service ──────────────────────────────────────────────────────────

/**
 * Senior-level cache service with:
 * - Cache-aside (lazy population)
 * - Tag-based bulk invalidation
 * - TTL tiers
 * - Graceful degradation when Redis is down
 * - Prometheus-compatible hit/miss counters (via logger)
 *
 * ## Tag Invalidation Design
 *
 * Each cache key can be associated with one or more tags.
 * Tags are stored as Redis SETs: `payroll:cache:tags:{tagName}` → {key1, key2, ...}
 * When invalidating a tag, we read the SET, DELETE all keys, then DELETE the SET.
 *
 * ## Usage
 *
 * ```ts
 * // Read-through cache
 * const periods = await cache.getOrSet(
 *   'payroll-periods:list',
 *   () => prisma.payrollPeriod.findMany(...),
 *   TTL.PAYROLL_PERIOD,
 *   ['payroll-periods']
 * );
 *
 * // Invalidate on mutation
 * await cache.invalidateTags(['payroll-periods']);
 * ```
 */
class CacheService {
    private hits = 0;
    private misses = 0;
    private logInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Log hit/miss ratio every 5 minutes in production
        if (config.nodeEnv === "production") {
            this.logInterval = setInterval(() => this.logStats(), 300_000);
        }
    }

    // ── Core: getOrSet (cache-aside) ────────────────────────────────────

    /**
     * Returns the cached value for `cacheKey`, or fetches it via `fetchFn`,
     * caches it with the given `ttl`, and associates it with `tags` for
     * bulk invalidation.
     *
     * If Redis is unavailable, always calls `fetchFn` (degraded mode).
     */
    async getOrSet<T>(
        cacheKey: string,
        fetchFn: () => Promise<T>,
        ttl: CacheTTL = TTL.ENTITY,
        tags: string[] = [],
    ): Promise<T> {
        if (!isRedisReady()) {
            this.misses++;
            return fetchFn();
        }

        const redisKey = key(cacheKey);

        try {
            const cached = await getClient().get(redisKey);
            if (cached !== null) {
                this.hits++;
                return JSON.parse(cached) as T;
            }
        } catch (err) {
            logger.warn({ err, cacheKey }, "[Cache] Read error — falling through to fetch");
            this.misses++;
            return fetchFn();
        }

        // Cache miss → fetch from source
        this.misses++;
        const value = await fetchFn();

        try {
            const pipeline = getClient().pipeline();
            pipeline.set(redisKey, serialize(value), "EX", ttl);

            // Associate tags: each tag stores a SET of cache keys
            for (const tag of tags) {
                pipeline.sadd(tagKey(tag), redisKey);
                // Tag keys persist; clean them when they have no members (handled in invalidation)
            }

            await pipeline.exec();
        } catch (err) {
            logger.warn({ err, cacheKey }, "[Cache] Write error — data served without cache");
        }

        return value;
    }

    /**
     * Retrieves a cached value without fallback.
     * Returns `null` if not found or if Redis is unavailable.
     * Useful for endpoints that can tolerate stale data.
     */
    async get<T>(cacheKey: string): Promise<T | null> {
        if (!isRedisReady()) return null;

        try {
            const cached = await getClient().get(key(cacheKey));
            if (cached !== null) {
                this.hits++;
                return JSON.parse(cached) as T;
            }
        } catch {
            // Silently fall through
        }

        this.misses++;
        return null;
    }

    /**
     * Manually set a cache value with TTL and tags.
     */
    async set<T>(
        cacheKey: string,
        value: T,
        ttl: CacheTTL = TTL.ENTITY,
        tags: string[] = [],
    ): Promise<void> {
        if (!isRedisReady()) return;

        const redisKey = key(cacheKey);

        try {
            const pipeline = getClient().pipeline();
            pipeline.set(redisKey, serialize(value), "EX", ttl);

            for (const tag of tags) {
                pipeline.sadd(tagKey(tag), redisKey);
            }

            await pipeline.exec();
        } catch (err) {
            logger.warn({ err, cacheKey }, "[Cache] Set error");
        }
    }

    // ── Invalidation ────────────────────────────────────────────────────

    /**
     * Invalidates all cache entries associated with the given tags.
     *
     * Example: after creating a new payroll period:
     * ```ts
     * await cache.invalidateTags(['payroll-periods']);
     * ```
     *
     * This finds all keys tagged with 'payroll-periods', deletes them,
     * then removes the tag SET itself.
     */
    async invalidateTags(tags: string[]): Promise<void> {
        if (!isRedisReady() || tags.length === 0) return;

        const tagKeysToDelete = tags.map((t) => tagKey(t));

        try {
            // Read all tag SETs in a single SMEMBERS call, or pipeline them
            const pipeline = getClient().pipeline();

            for (const tKey of tagKeysToDelete) {
                pipeline.smembers(tKey);
            }

            const results = await pipeline.exec();

            if (!results) return;

            const keysToDelete: string[] = [];

            for (const [err, members] of results) {
                if (err || !Array.isArray(members)) continue;
                for (const member of members as string[]) {
                    keysToDelete.push(member);
                }
            }

            // Delete all cached entries + the tag SETs
            if (keysToDelete.length > 0 || tagKeysToDelete.length > 0) {
                const delPipeline = getClient().pipeline();

                for (const k of keysToDelete) {
                    delPipeline.del(k);
                }
                for (const tKey of tagKeysToDelete) {
                    delPipeline.del(tKey);
                }

                await delPipeline.exec();
            }

            logger.debug({ tags, keysDeleted: keysToDelete.length }, "[Cache] Invalidated tags");
        } catch (err) {
            logger.warn({ err, tags }, "[Cache] Invalidation error");
        }
    }

    /**
     * Invalidates a single cache key by its logical name.
     */
    async invalidateKey(cacheKey: string): Promise<void> {
        if (!isRedisReady()) return;

        try {
            await getClient().del(key(cacheKey));
        } catch (err) {
            logger.warn({ err, cacheKey }, "[Cache] Key invalidation error");
        }
    }

    // ── Utilities ───────────────────────────────────────────────────────

    /** Flush all cached entries (use with caution!) */
    async flushAll(): Promise<void> {
        if (!isRedisReady()) return;

        try {
            const stream = getClient().scanStream({ match: `${PREFIX}*`, count: 100 });
            const pipeline = getClient().pipeline();

            stream.on("data", (keys: string[]) => {
                for (const k of keys) {
                    pipeline.del(k);
                }
            });

            await new Promise<void>((resolve, reject) => {
                stream.on("end", () => {
                    pipeline.exec().then(() => resolve()).catch(reject);
                });
                stream.on("error", reject);
            });

            logger.info("[Cache] Flushed all entries");
        } catch (err) {
            logger.warn({ err }, "[Cache] Flush error");
        }
    }

    /** Return hit/miss counters for monitoring */
    getStats() {
        return { hits: this.hits, misses: this.misses, ratio: this.getHitRate() };
    }

    /** Hit rate as a percentage string */
    getHitRate(): string {
        const total = this.hits + this.misses;
        if (total === 0) return "0.0%";
        return `${((this.hits / total) * 100).toFixed(1)}%`;
    }

    private logStats(): void {
        logger.info(
            { hits: this.hits, misses: this.misses, hitRate: this.getHitRate() },
            "[Cache] Hit/miss stats",
        );
    }
}

// Singleton export
const cacheService = new CacheService();
export default cacheService;
