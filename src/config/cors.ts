import cors from "cors";
import config from "./env";

// CORS middleware configured from environment variables, with wildcard origin support
const corsMiddleware = cors({
    origin: config.cors.origin === "*"
        ? true  // Reflect the request origin dynamically (supports credentials)
        : config.cors.origin.split(",").map((s) => s.trim()),
    methods: config.cors.methods,
    allowedHeaders: config.cors.allowedHeaders,
    exposedHeaders: config.cors.exposedHeaders.length > 0 ? config.cors.exposedHeaders : undefined,
    credentials: config.cors.credentials,
    maxAge: config.cors.maxAge,
});

export default corsMiddleware;
