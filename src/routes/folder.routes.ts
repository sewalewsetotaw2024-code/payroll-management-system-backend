import { Router } from "express";
import { FolderController } from "../controllers/folder.controllers";
import { authenticate } from "../middlewares/auth";
import { validate } from "../middlewares/validation";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";
import {
    createFolderSchema,
    updateFolderSchema,
    folderParamsSchema,
    moveFileSchema,
} from "../validations/folder.validations";

const router = Router();

router.use(authenticate);

/**
 * GET / — Lists all folders for the authenticated user.
 */
router.get("/", cacheMiddleware({ ttl: TTL.PAYROLL_PERIOD, tags: ["folders"] }), FolderController.list);

/**
 * GET /:id — Retrieves a single folder by ID. Validates the folder ID parameter.
 */
router.get(
    "/:id",
    validate(folderParamsSchema),
    cacheMiddleware({ ttl: TTL.PAYROLL_PERIOD, tags: ["folders"] }),
    FolderController.getById,
);

/**
 * POST / — Creates a new folder. Validates the request body using createFolderSchema.
 */
router.post(
    "/",
    validate(createFolderSchema),
    FolderController.create,
    invalidateCache({ tags: ["folders"] }),
);

/**
 * PUT /:id — Updates an existing folder by ID. Validates both the body and params.
 */
router.put(
    "/:id",
    validate(updateFolderSchema),
    validate(folderParamsSchema),
    FolderController.update,
    invalidateCache({ tags: ["folders"] }),
);

/**
 * DELETE /:id — Deletes a folder by ID. Validates the folder ID parameter.
 */
router.delete(
    "/:id",
    validate(folderParamsSchema),
    FolderController.remove,
    invalidateCache({ tags: ["folders"] }),
);

/**
 * GET /:id/export — Exports a folder's contents. Validates the folder ID parameter.
 */
router.get(
    "/:id/export",
    validate(folderParamsSchema),
    cacheMiddleware({ ttl: TTL.PAYROLL_PERIOD, tags: ["folders"] }),
    FolderController.exportFolder,
);

/**
 * PATCH /move-file — Moves a file between folders. Validates the request body using moveFileSchema.
 */
router.patch(
    "/move-file",
    validate(moveFileSchema),
    FolderController.moveFile,
    invalidateCache({ tags: ["folders"] }),
);

export default router;
