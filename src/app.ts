import express, { json, urlencoded } from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import hpp from "hpp";
import rateLimit from "express-rate-limit";
import { errorConverter, errorHandler } from "./middlewares/errorHandler";
import CustomError from "./utils/customError";
import httpStatus from "http-status";
import * as morgan from "./config/morgan";
import corsMiddleware from "./config/cors";
import routes from "./routes";
import { monitoring } from "./utils/monitoring";
// ── Prisma Decimal serialisation ─────────────────────────────────────────────
// Prisma 7's Decimal.toJSON() returns a string (e.g. "8.50"), which causes
// JavaScript string concatenation when added in the frontend.  Override
// to return a plain number so all API responses use numeric Decimals.
// @ts-ignore
import("@prisma/client/runtime/library.js").then(({ Decimal }) => {
    // @ts-ignore – override Decimal.toJSON() to return number instead of string
    Decimal.prototype.toJSON = function toJSON() { return Number(this); };
}).catch(() => {
    // Runtime not available — the override is a safety net, not critical.
});

// Express application instance — all middleware and routes are registered on this
const app = express();

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        },
    },
}));

// HTTP parameter pollution protection
app.use(hpp({ whitelist: ["status", "cycle", "system"] }));

// Rate limiter — restricts requests to 1000 per 15-minute window per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, code: 429, message: "Too many requests, please try again later" },
});
app.use("/api/v1", limiter);

// CORS middleware handles preflight requests automatically.
app.use(corsMiddleware);

app.use(json({ limit: "1mb" }));
app.use(urlencoded({ extended: true, limit: "1mb" }));

app.use(morgan.successHandler);
app.use(morgan.errorHandler);
app.use(morgan.consoleSuccessHandler);
app.use(morgan.consoleErrorHandler);

// Health check endpoint returning a simple status response
app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.get("/health/ready", (_req: Request, res: Response) => {
    const snapshot = monitoring.getSnapshot();
    const isReady = snapshot.dependencies.postgresql.status === "ok" && snapshot.dependencies.cloudinary.status === "ok";
    res.status(isReady ? 200 : 503).json({
        status: isReady ? "ready" : "not-ready",
        snapshot,
    });
});

app.get("/health/metrics", (_req: Request, res: Response) => {
    res.json(monitoring.getSnapshot());
});

app.use((req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
        monitoring.recordHttpRequest(req.method, req.path, res.statusCode || 500);
    });
    next();
});

// Mount versioned API routes before 404 handler
app.use("/api/v1", routes);

// Catch-all 404 handler for unmatched routes
app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new CustomError(httpStatus.NOT_FOUND, "Not Found"));
});

app.use(errorConverter);
app.use(errorHandler);

export default app;
