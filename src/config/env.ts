import dotenv from "dotenv";
import { z } from "zod";
import type { AppConfig } from "../types/index";

dotenv.config();

const trueFalse = z
    .enum(["true", "false", "1", "0"] as const)
    .default("false")
    .transform((v) => v === "true" || v === "1");

const splitCsv = (val: string) =>
    val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),
    EMPLOYEE_MODULE_DATABASE_URL: z.string().url().optional(),
    EXTERNAL_API_URL: z.string().url().optional().or(z.literal("http://localhost:5000/api/v1")),
    EXTERNAL_API_TOKEN: z.string().optional(),
    SKIP_DB: trueFalse,
    JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters"),
    CORS_ORIGIN: z.string().default("*"),
    CORS_METHODS: z.string().default("GET,POST,PUT,PATCH,DELETE,OPTIONS").transform(splitCsv),
    CORS_ALLOWED_HEADERS: z.string().default("Content-Type,Authorization").transform(splitCsv),
    CORS_EXPOSED_HEADERS: z.string().default("").transform(splitCsv),
    CORS_CREDENTIALS: trueFalse,
    CORS_MAX_AGE: z.coerce.number().int().min(0).default(86400),
    CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
    CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
    CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    REDIS_KEY_PREFIX: z.string().default("payroll:cache:"),
    PUPPETEER_EXECUTABLE_PATH: z.string().default("/usr/bin/google-chrome"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default("noreply@adiu.com"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error(
        JSON.stringify({ issues: parsedEnv.error.issues }, null, 2),
        "Invalid environment variables",
    );
    process.exit(1);
}

const env = parsedEnv.data;

const config: AppConfig = {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    employeeModuleDatabaseUrl: env.EMPLOYEE_MODULE_DATABASE_URL,
    externalApiUrl: env.EXTERNAL_API_URL,
    externalApiToken: env.EXTERNAL_API_TOKEN,
    flags: {
        skipDb: env.SKIP_DB,
    },
    jwt: {
        secret: env.JWT_SECRET,
    },
    cors: {
        origin: env.CORS_ORIGIN,
        methods: env.CORS_METHODS,
        allowedHeaders: env.CORS_ALLOWED_HEADERS,
        exposedHeaders: env.CORS_EXPOSED_HEADERS,
        credentials: env.CORS_CREDENTIALS,
        maxAge: env.CORS_MAX_AGE,
    },
    cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
    },
    puppeteer: {
        executablePath: env.PUPPETEER_EXECUTABLE_PATH,
    },
    redis: {
        url: env.REDIS_URL,
        keyPrefix: env.REDIS_KEY_PREFIX,
    },
};

export default config;
export type EnvVars = z.infer<typeof envSchema>;
