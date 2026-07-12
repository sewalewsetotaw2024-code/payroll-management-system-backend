import { z } from "zod";

/**
 * POST /attendance/import
 * - sheetName: optional 8-character period code (e.g., "20260604"), defaults to filename-derived
 * - File is handled by multer middleware, not validated here
 */
export const importAttendanceSchema = z.object({
    body: z.object({
        sheetName: z
            .string()
            .length(8, "Sheet name must be exactly 8 characters (YYYYMMDD format)")
            .optional(),
    }),
});

/**
 * POST /attendance/:importId/calculate-ot
 */
export const calculateOvertimeSchema = z.object({
    params: z.object({
        importId: z.string().uuid("Import ID must be a valid UUID"),
    }),
});

/**
 * GET /attendance/imports
 */
export const listImportsSchema = z.object({
    query: z.object({
        periodLabel: z.string().optional(),
        source: z.string().optional(),
        status: z.string().optional(),
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().max(1000).optional().default(50),
    }),
});

/**
 * GET /attendance/imports/:importId
 */
export const getImportByIdSchema = z.object({
    params: z.object({
        importId: z.string().uuid("Import ID must be a valid UUID"),
    }),
});

/**
 * DELETE /attendance/imports/:importId
 */
export const deleteImportSchema = z.object({
    params: z.object({
        importId: z.string().uuid("Import ID must be a valid UUID"),
    }),
});

/**
 * POST /attendance/imports/:importId/calculate-summary
 */
export const calculateSummarySchema = z.object({
    params: z.object({
        importId: z.string().uuid("Import ID must be a valid UUID"),
    }),
    body: z.object({}).optional(),
});
