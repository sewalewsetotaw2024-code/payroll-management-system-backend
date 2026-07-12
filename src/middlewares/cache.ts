import { Request, Response, NextFunction } from "express";
import cacheService, { CacheTTL, TTL } from "../services/cache.service";

/**
 * Express middleware for caching GET responses.
 *
 * ## Usage
 *
 * ```ts
 * router.get(
 *   '/payroll-periods',
 *   cacheMiddleware({ ttl: TTL.PAYROLL_PERIOD, tags: ['payroll-periods'] }),
 *   controller.getAllPayrollPeriods
 * );
 * ```
 *
 * ## How It Works
 *
 * 1. Caches `res.json(data)` on the first request, keyed by the full URL (including query params).
 * 2. On subsequent requests, returns the cached JSON directly if available.
 * 3. Tags are associated for bulk invalidation.
 * 4. Responses with errors or non-2xx status are NOT cached.
 *
 * ## Cache Key
 *
 * `{prefix}express:{method}:{originalUrl}` — unique per method + path + query string.
 * This means `/payroll-periods?page=1&limit=10` is cached separately from `/payroll-periods?page=2`.
 */
export function cacheMiddleware(options: {
    ttl?: CacheTTL;
    tags?: string[];
    /** Only cache responses below this size in bytes (default: 1MB) */
    maxBodySize?: number;
} = {}) {
    const {
        ttl = TTL.ENTITY,
        tags = [],
        maxBodySize = 1_048_576, // 1 MB
    } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        // Only cache GET requests
        if (req.method !== "GET") {
            next();
            return;
        }

        const cacheKey = `express:${req.method}:${req.originalUrl}`;

        // Attempt to serve from cache
        cacheService
            .get<{ statusCode: number; body: unknown }>(cacheKey)
            .then((cached) => {
                if (cached) {
                    res.status(cached.statusCode).json(cached.body);
                    return;
                }

                // Monkey-patch res.json to intercept the response
                const originalJson = res.json.bind(res);
                res.json = function (body: unknown) {
                    const statusCode = res.statusCode;

                    // Only cache successful responses
                    if (statusCode >= 200 && statusCode < 300) {
                        const serialised = JSON.stringify(body);
                        if (serialised.length <= maxBodySize) {
                            cacheService
                                .set(
                                    cacheKey,
                                    { statusCode, body },
                                    ttl,
                                    tags,
                                )
                                .catch(() => {
                                    /* swallow — cache is best-effort */
                                });
                        }
                    }

                    return originalJson(body);
                };

                next();
            })
            .catch(next);
    };
}

/**
 * Express middleware for invalidating cache tags AFTER a mutation succeeds.
 *
 * Usage:
 * ```ts
 * router.post(
 *   "/payroll-period",
 *   protect,
 *   validate(createPayrollPeriodSchema),
 *   PayrollConfiguration.createPayrollPeriodConfiguration,
 *   invalidateCache({ tags: ["payroll-periods"] }),
 * );
 * ```
 *
 * This runs after the controller sends the response.
 * It reads `res.statusCode` to only invalidate on success (2xx).
 */
export function invalidateCache(options: {
    tags: string[];
    /** Only invalidate if status code is in this range (default: 2xx) */
    onStatus?: (code: number) => boolean;
}) {
    const { tags, onStatus = (code: number) => code >= 200 && code < 300 } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        // Wrap res.json to intercept AFTER response is sent
        const originalJson = res.json.bind(res);
        res.json = function (body: unknown) {
            if (onStatus(res.statusCode)) {
                cacheService.invalidateTags(tags).catch(() => {
                    /* swallow — best-effort */
                });
            }
            return originalJson(body);
        };
        next();
    };
}

export default cacheMiddleware;
