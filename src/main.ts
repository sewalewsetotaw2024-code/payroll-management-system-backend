import app from "./app";
import http from "http";
import type { Application } from "express";
import config from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import { initializeWebSocket, shutdownWebSocket } from "./services/websocket.service";
import { payslipRenderService } from "./services/payslipRender.service";
import { startWorker as startReportWorker, shutdownQueue } from "./services/reportQueue.service";
import { startEmailWorker, stopEmailWorker } from "./workers/email.processor";
import logger from "./utils/logger";
import { logApprovalRoleHealth } from "./utils/approvalRoleValidator";
import { monitoring } from "./utils/monitoring";

let server: http.Server | null = null;
let shuttingDown = false;

const isSkipDbEnabled = config.flags.skipDb;

// Returns the configured server port number
function getPort(): number {
    return Number(config.port);
}

async function connectDB(): Promise<void> {
    if (isSkipDbEnabled) {
        logger.warn("SKIP_DB is set - skipping database connection (useful for local docs/testing)");
        monitoring.setDependencyStatus("postgresql", "degraded", "Skipped by configuration");
        return;
    }

    try {
        await connectDatabase();
        monitoring.setDependencyStatus("postgresql", "ok", "Connected");
    } catch (error) {
        monitoring.setDependencyStatus("postgresql", "failed", error instanceof Error ? error.message : "Unknown error");
        throw error;
    }
}

// Creates and starts the HTTP server on the configured port
function startHttpServer(appInstance: Application): http.Server {
    const port = getPort();
    const httpServer = http.createServer(appInstance);

    httpServer.listen(port, () => {
        logger.info({ port }, "Server is running");
    });

    // Attach the WebSocket server to the same HTTP server (path: /ws)
    initializeWebSocket(httpServer);

    return httpServer;
}

// Gracefully stops the HTTP server if it is currently listening
function closeHttpServer(httpServer: http.Server | null): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!httpServer || !httpServer.listening) return resolve();

        httpServer.close((err?: Error) => {
            if (err) return reject(err);
            return resolve();
        });
    });
}

// Disconnects the shared Prisma client from the database
async function disconnectPrisma(): Promise<void> {
    await disconnectDatabase();
}

// Graceful shutdown — closes the HTTP server and disconnects the database, then exits
async function shutdown(exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("Shutting down gracefully");

    try {
        await closeHttpServer(server);
        logger.info("HTTP server closed");
    } catch (error) {
        logger.error({ err: error }, "Error while closing HTTP server");
        exitCode = 1;
    }

    await disconnectPrisma();
    await disconnectRedis();
    await shutdownWebSocket();
    await shutdownQueue();
    await stopEmailWorker();
    await payslipRenderService.shutdown();
    process.exit(exitCode);
}

// Registers signal handlers for graceful shutdown on SIGTERM, SIGINT, uncaught exceptions, and unhandled rejections
function registerProcessHandlers(): void {
    process.on("SIGTERM", async () => {
        logger.info("SIGTERM received");
        await shutdown(0);
    });

    process.on("SIGINT", async () => {
        logger.info("SIGINT received");
        await shutdown(0);
    });

    process.on("uncaughtException", async (error: Error) => {
        logger.error({ err: error }, "Uncaught Exception");
        await shutdown(1);
    });

    process.on("unhandledRejection", async (reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        logger.error({ err: error }, "Unhandled Rejection");
        await shutdown(1);
    });
}

// Initializes the application — connects to the database, starts the HTTP server, and registers process handlers
async function bootstrap(): Promise<void> {
    await connectDB();
    // Validate approval role configuration on boot (non-blocking — logs errors
    // but does not prevent startup so existing healthy companies keep running).
    logApprovalRoleHealth().catch((err) =>
        logger.warn({ err }, "[Bootstrap] Approval role health check failed"),
    );
    // Connect Redis (non-blocking — if it fails, app runs without cache)
    connectRedis()
        .then(() => {
            monitoring.setDependencyStatus("redis", "ok", "Connected");
            // Start BullMQ worker for background report generation
            startReportWorker();
            // Start email worker for async email sending via Resend
            startEmailWorker();
        })
        .catch((err) => {
            monitoring.setDependencyStatus("redis", "degraded", err instanceof Error ? err.message : "Unknown error");
            logger.warn({ err }, "[Redis] Background connect failed — running without cache");
        });

    // Validate external integrations at startup for observability
    void Promise.resolve()
        .then(() => {
            const cloudinaryConfigured = Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
            monitoring.setDependencyStatus("cloudinary", cloudinaryConfigured ? "ok" : "failed", cloudinaryConfigured ? "Configured" : "Missing credentials");
        })
        .catch((err) => {
            monitoring.setDependencyStatus("cloudinary", "failed", err instanceof Error ? err.message : "Unknown error");
        });

    try {
        const executablePath = config.puppeteer.executablePath;
        if (executablePath) {
            monitoring.setDependencyStatus("puppeteer", "ok", `Configured at ${executablePath}`);
        } else {
            monitoring.setDependencyStatus("puppeteer", "failed", "Puppeteer executable path missing");
        }
    } catch (error) {
        monitoring.setDependencyStatus("puppeteer", "failed", error instanceof Error ? error.message : "Unknown error");
    }

    server = startHttpServer(app as Application);
    registerProcessHandlers();
}

bootstrap().catch(async (error) => {
    logger.error({ err: error }, "Failed to bootstrap server");
    await shutdown(1);
});
