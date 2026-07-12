/**
 * @file validation.ts
 * @description Middleware for validating request parts (body, query, params, headers)
 * using either:
 * 1) a schema map: { body?: zodSchema, query?: zodSchema, ... }
 * 2) a full wrapped request schema: z.object({ body: ..., query: ..., ... })
 */

import type { Request, Response, NextFunction } from "express";
import { z, type ZodError, type ZodSchema } from "zod";
import CustomError from "../utils/customError";

type RequestParts = "body" | "query" | "params" | "headers";
type RequestLike = Partial<Record<RequestParts, unknown>>;

type SchemaMap = Partial<Record<RequestParts, ZodSchema<any>>>;
type WrappedRequestSchema = ZodSchema<any>;

// Safely assigns a parsed value back to the request part, handling frozen objects gracefully
const setRequestPart = (req: Request, key: RequestParts, value: unknown): void => {
    try {
        (req as any)[key] = value;
        return;
    } catch {
        const current = (req as any)[key];
        if (
            current &&
            typeof current === "object" &&
            value &&
            typeof value === "object" &&
            !Array.isArray(current) &&
            !Array.isArray(value)
        ) {
            Object.keys(current).forEach((k) => delete (current as Record<string, unknown>)[k]);
            Object.assign(current as Record<string, unknown>, value as Record<string, unknown>);
        }
    }
};

// Type guard — checks if input is a schema map with request-part keys and Zod schema values
const isSchemaMap = (input: unknown): input is SchemaMap => {
    if (!input || typeof input !== "object") return false;

    const obj = input as Record<string, unknown>;
    const allowedKeys: RequestParts[] = ["body", "query", "params", "headers"];
    const keys = Object.keys(obj);

    if (keys.length === 0) return false;
    if (!keys.every((k) => allowedKeys.includes(k as RequestParts))) return false;

    return keys.every((k) => {
        const maybeSchema = obj[k] as unknown;
        return (
            !!maybeSchema &&
            typeof maybeSchema === "object" &&
            typeof (maybeSchema as any).safeParse === "function"
        );
    });
};

// Builds a request payload object containing only the parts specified in the schema map
const pickRequestParts = (req: Request, schemaMap: SchemaMap): RequestLike => {
    const keys = Object.keys(schemaMap) as RequestParts[];

    return keys.reduce<RequestLike>((acc, key) => {
        acc[key] = (req as any)[key];
        return acc;
    }, {});
};

// Wraps a schema map into a single Zod object schema for unified parsing
const wrapSchemaMap = (schemaMap: SchemaMap): ZodSchema<any> => {
    const keys = Object.keys(schemaMap) as RequestParts[];

    const shape = keys.reduce<Record<string, ZodSchema<any>>>((acc, key) => {
        acc[key] = schemaMap[key] as ZodSchema<any>;
        return acc;
    }, {});

    return z.object(shape);
};

// Middleware factory — validates request body/query/params/headers against a Zod schema and returns 400 on mismatch
export const validate =
    (schemaOrMap: SchemaMap | WrappedRequestSchema) =>
        (req: Request, _res: Response, next: NextFunction): void => {
            let schemaToUse: ZodSchema<any>;
            let payload: unknown;

            if (isSchemaMap(schemaOrMap)) {
                schemaToUse = wrapSchemaMap(schemaOrMap);
                payload = pickRequestParts(req, schemaOrMap);
            } else {
                // Assume full wrapped request schema (e.g. registerSchema with { body: ... })
                schemaToUse = schemaOrMap as ZodSchema<any>;
                payload = {
                    body: req.body,
                    query: req.query,
                    params: req.params,
                    headers: req.headers,
                };
            }

            const result = schemaToUse.safeParse(payload);

            if (!result.success) {
                const error = result.error as ZodError;
                const formattedErrors = error.issues.map((e) => 
                    `${e.path.join(".")}: ${e.message}`
                ).join("; ");
                console.error("[Validation Error] Details:", JSON.stringify(error.issues, null, 2));
                next(new CustomError(400, formattedErrors || "Validation failed"));
                return;
            }

            // Optional sanitization pass-through: replace request parts with parsed output
            // for map-based validation
            if (isSchemaMap(schemaOrMap)) {
                const parsed = result.data as RequestLike;
                const keys = Object.keys(schemaOrMap) as RequestParts[];
                for (const key of keys) {
                    setRequestPart(req, key, parsed[key]);
                }
                next();
                return;
            }

            // for wrapped schema validation
            const parsed = result.data as RequestLike;
            if ("body" in parsed) setRequestPart(req, "body", parsed.body);
            if ("query" in parsed) setRequestPart(req, "query", parsed.query);
            if ("params" in parsed) setRequestPart(req, "params", parsed.params);
            if ("headers" in parsed) setRequestPart(req, "headers", parsed.headers);

            next();
        };