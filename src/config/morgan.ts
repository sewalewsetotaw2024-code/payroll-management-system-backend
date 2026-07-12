import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import morgan from "morgan";
import config from "./env";
import logger from "../utils/logger";

// Custom Morgan token that reads the error message from response locals
morgan.token(
  "message",
  (_req: Request, res: Response) => res.locals.errorMessage || "",
);

// Returns the remote-addr format in production for IP logging, empty string otherwise
const getIpFormat = (): string =>
  config.nodeEnv === "production" ? ":remote-addr" : "";

const logDir = path.join(process.cwd(), "logs");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(path.join(logDir, "access.log"), {
  flags: "a",
});

const successHandlerFormat = `${getIpFormat()} :method :url :status :response-time ms :user-agent :date[web]`;
const errorHandlerFormat = `${getIpFormat()} :method :url :status :response-time ms :user-agent :date[web] - error-message: :message`;

// File-based logging for successful requests (status < 400)
export const successHandler = morgan(successHandlerFormat, {
  stream: accessLogStream,
  skip: (_req: Request, res: Response) => res.statusCode >= 400,
});

// File-based logging for error responses (status >= 400)
export const errorHandler = morgan(errorHandlerFormat, {
  stream: accessLogStream,
  skip: (_req: Request, res: Response) => res.statusCode < 400,
});

// Console-based logging (via pino)
const consoleFormat = `${getIpFormat()}:method :url :status :response-time ms`;

const consoleStream = {
    write: (message: string) => {
        logger.info(message.trim());
    },
};

const consoleErrorStream = {
    write: (message: string) => {
        logger.warn(message.trim());
    },
};

// Console-based logging for successful requests (via pino)
export const consoleSuccessHandler = morgan(consoleFormat, {
    stream: consoleStream,
    skip: (_req: Request, res: Response) => res.statusCode >= 400,
});

// Console-based logging for error responses (via pino)
export const consoleErrorHandler = morgan(consoleFormat, {
    stream: consoleErrorStream,
    skip: (_req: Request, res: Response) => res.statusCode < 400,
});
