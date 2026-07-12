import app from "./app";
import http from "http";
import type { Application } from "express";
import config from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import logger from "./utils/logger";

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
        return;
    }

    await connectDatabase();
}

// Creates and starts the HTTP server on the configured port
function startHttpServer(appInstance: Application): http.Server {
    const port = getPort();
    const httpServer = http.createServer(appInstance);

    httpServer.listen(port, () => {
        logger.info({ port }, "Server is running");
    });

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
    // Connect Redis (non-blocking — if it fails, app runs without cache)
    connectRedis().catch((err) =>
        logger.warn({ err }, "[Redis] Background connect failed — running without cache"),
    );
    server = startHttpServer(app as Application);
    registerProcessHandlers();
}

bootstrap().catch(async (error) => {
    logger.error({ err: error }, "Failed to bootstrap server");
    await shutdown(1);
});
