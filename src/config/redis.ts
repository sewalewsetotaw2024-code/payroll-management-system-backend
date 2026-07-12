import Redis from "ioredis";
import config from "./env";
import logger from "../utils/logger";

/**
 * Redis client singleton with health monitoring and graceful reconnection.
 *
 * Design:
 * - Lazy connection: client connects on first operation, not at import time.
 * - Retry strategy: exponential backoff (100ms → 16s max), max 30 retries.
 * - Graceful degradation: if Redis is down, cache operations become no-ops
 *   rather than throwing. The app continues to work without caching.
 */
let client: Redis | null = null;
let isConnected = false;

function createClient(): Redis {
    const redisUrl = config.redis.url;

    const instance = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: null,
        retryStrategy(times) {
            if (times > 30) {
                logger.error("[Redis] Max retries reached — disabling cache");
                isConnected = false;
                return null; // stop retrying
            }
            const delay = Math.min(100 * 2 ** times, 16_000);
            logger.warn({ attempt: times, delay }, "[Redis] Reconnecting...");
            return delay;
        },
        reconnectOnError(err) {
            logger.error({ err }, "[Redis] Reconnect on error");
            return true;
        },
    });

    instance.on("connect", () => {
        isConnected = true;
        logger.info("[Redis] Connected");
    });

    instance.on("ready", () => {
        isConnected = true;
        logger.info("[Redis] Ready");
    });

    instance.on("close", () => {
        isConnected = false;
        logger.warn("[Redis] Connection closed");
    });

    instance.on("error", (err) => {
        isConnected = false;
        logger.error({ err: err.message }, "[Redis] Error");
    });

    return instance;
}

/**
 * Returns the singleton Redis client, creating it if necessary.
 * Callers should use { @link isReady } first to check connectivity.
 */
export function getClient(): Redis {
    if (!client) {
        client = createClient();
    }
    return client;
}

/**
 * Connects to Redis. Await this during server startup.
 * If Redis is unavailable, logs a warning but does NOT throw —
 * the server continues without caching.
 */
export async function connectRedis(): Promise<void> {
    try {
        const c = getClient();
        await c.connect();
        isConnected = true;
        logger.info("[Redis] Connection established");
    } catch (error) {
        isConnected = false;
        logger.warn({ err: error }, "[Redis] Connection failed — running without cache");
    }
}

/**
 * Gracefully disconnects Redis. Call during server shutdown.
 */
export async function disconnectRedis(): Promise<void> {
    if (!client) return;
    try {
        await client.quit();
        client = null;
        isConnected = false;
        logger.info("[Redis] Disconnected");
    } catch (error) {
        logger.warn({ err: error }, "[Redis] Error during disconnect");
    }
}

/**
 * Whether the Redis client is currently connected and ready.
 * Used by CacheService to decide whether to attempt caching.
 */
export function isRedisReady(): boolean {
    return isConnected && client !== null && client.status === "ready";
}
