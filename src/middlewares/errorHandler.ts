import { Prisma } from "../generated/prisma";
import type { NextFunction, Request, Response } from "express";
import config from "../config/env";
import logger from "../utils/logger";
import httpStatus from "http-status";
import CustomError from "../utils/customError";
import { monitoring } from "../utils/monitoring";

// Converts non-CustomError errors (Prisma, Zod, etc.) into CustomError format
export const errorConverter = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    let error = err;

    if (!(error instanceof CustomError)) {
        let statusCode: number;
        let message: string;

        if (config.nodeEnv === "development") {
            logger.error({ err }, "Prisma error in development");
        }

        if (err instanceof Prisma.PrismaClientKnownRequestError) {
            switch (err.code) {
                case "P2002":
                    statusCode = httpStatus.CONFLICT;
                    message = `Duplicate field value: ${getPrismaConstraintName(err.meta?.target)}`;
                    break;
                case "P2003":
                    statusCode = httpStatus.BAD_REQUEST;
                    message = "Invalid foreign key reference";
                    break;
                case "P2025":
                    statusCode = httpStatus.NOT_FOUND;
                    message = "Record not found";
                    break;
                case "P2014":
                    statusCode = httpStatus.BAD_REQUEST;
                    message = "Missing required field";
                    break;
                default:
                    statusCode = httpStatus.BAD_REQUEST;
                    const meta = err.meta ? ` | Meta: ${JSON.stringify(err.meta)}` : "";
                    message = `[Prisma error code: ${err.code}] ` + (err.message || "Database operation failed") + meta;
            }
        } else if (err.name === "ZodError") {
            statusCode = httpStatus.BAD_REQUEST;
            message = "Validation Error";
        } else if (err instanceof Prisma.PrismaClientValidationError) {
            statusCode = httpStatus.BAD_REQUEST;
            message = "Invalid input data";
        } else if (err instanceof Prisma.PrismaClientInitializationError) {
            statusCode = httpStatus.INTERNAL_SERVER_ERROR;
            message = "Database connection failed";
        } else {
            statusCode =
                (error as any).statusCode &&
                    typeof (error as any).statusCode === "number"
                    ? (error as any).statusCode
                    : httpStatus.INTERNAL_SERVER_ERROR;
            message =
                (error as any).message ||
                (httpStatus[statusCode as unknown as keyof typeof httpStatus] as unknown as string);
        }

        error = new CustomError(statusCode, message, false, (err as any).stack);
    }
    next(error);
};

function getPrismaConstraintName(target: any): string {
    if (Array.isArray(target)) return target.join(", ");
    return target || "unknown";
}

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    let { statusCode, message } = err as any;
    const isOperational = (err as any).isOperational;

    if (config.nodeEnv === "production" && !isOperational) {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        message = (httpStatus as any)[httpStatus.INTERNAL_SERVER_ERROR] as string;
    }

    const response = {
        error: true,
        code: statusCode,
        message,
        ...(config.nodeEnv === "development" && { stack: err.stack }),
    };

    res.locals.errorMessage = message;
    if (config.nodeEnv === "development") logger.error(err);
    monitoring.recordHttpRequest(req.method, req.path, statusCode);
    res.status(statusCode).send(response);
};
