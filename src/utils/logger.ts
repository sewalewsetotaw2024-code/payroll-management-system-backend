import pino, { type LoggerOptions } from "pino";
import config from "../config/env";

const isProduction = config.nodeEnv === "production";

const options: LoggerOptions = {
	level: isProduction ? "info" : "debug",
	formatters: {
		level: (label) => ({ level: label.toUpperCase() }),
	},
	timestamp: pino.stdTimeFunctions.isoTime,
};

const logger = pino(options);

export default logger;
