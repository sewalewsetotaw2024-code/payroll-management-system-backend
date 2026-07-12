import { PrismaClient } from "../generated/prisma";
import logger from "../utils/logger";
import config from "./env";

const isDev = config.nodeEnv === "development";
const isTest = config.nodeEnv === "test";

const logLevels: ("query" | "info" | "warn" | "error")[] = isDev
	? ["query", "info", "warn", "error"]
	: isTest
		? []
		: ["warn", "error"];

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma: PrismaClient =
	globalForPrisma.prisma ||
	new PrismaClient({
		log: logLevels,
	});

if (isDev || isTest) {
	globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
	try {
		logger.info("Connecting to PostgreSQL via Prisma...");
		await prisma.$connect();
		await prisma.$queryRaw`SELECT 1`;
		logger.info("Database connection established and responsive.");
	} catch (error) {
		logger.error(
			{ err: error },
			"CRITICAL: Failed to connect to the database. Exiting.",
		);
		process.exit(1);
	}
}

export async function disconnectDatabase(): Promise<void> {
	try {
		logger.info("Closing database connection pool...");
		await prisma.$disconnect();
		logger.info("Database connection pool closed.");
	} catch (error) {
		logger.warn({ err: error }, "Error while disconnecting from the database.");
	}
}

export default prisma;
