import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { FolderService } from "../services/folder.service";
import { resolveCompanyId } from "../utils/roleGuard";
import { writeAudit } from "../utils/audit";

export const FolderController = {
    /**
     * Retrieves the full folder tree structure for the company.
     *
     * @param req - Express request object used to resolve company ID.
     * @param res - Express response object used to return folder tree.
     * @returns JSON response with success status and folder tree data.
     */
    list: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const tree = await FolderService.list(companyId);
            res.status(httpStatus.OK).json({
                success: true,
                message: "Folders fetched successfully",
                data: tree,
            });
        },
    ),

    /**
     * Retrieves a single folder by its ID.
     *
     * @param req - Express request object with folder ID in params.
     * @param res - Express response object used to return folder.
     * @returns JSON response with success status and folder data.
     */
    getById: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const folder = await FolderService.getById(companyId, id);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Folder fetched successfully",
                data: folder,
            });
        },
    ),

    /**
     * Creates a new folder with an optional parent folder.
     *
     * @param req - Express request object containing folder name and optional parentId in body.
     * @param res - Express response object used to return created folder.
     * @returns JSON response with success status and created folder data.
     */
    create: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { name, parentId } = req.body;

            const folder = await FolderService.create(companyId, name, parentId);

            await writeAudit(req, {
                action: "CREATE",
                resource: "ImportFolder",
                resourceId: folder.id,
                newValue: { name, parentId },
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Folder created successfully",
                data: folder,
            });
        },
    ),

    /**
     * Updates a folder's name or parent folder.
     *
     * @param req - Express request object with folder ID in params and name/parentId in body.
     * @param res - Express response object used to return updated folder.
     * @returns JSON response with success status and updated folder data.
     */
    update: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const { name, parentId } = req.body;

            const folder = await FolderService.update(companyId, id, name, parentId ?? undefined);

            await writeAudit(req, {
                action: "UPDATE",
                resource: "ImportFolder",
                resourceId: folder.id,
                oldValue: { name: folder.name },
                newValue: { name },
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Folder updated successfully",
                data: folder,
            });
        },
    ),

    /**
     * Deletes a folder by its ID.
     *
     * @param req - Express request object with folder ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted folder data.
     */
    remove: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const result = await FolderService.remove(companyId, id);

            await writeAudit(req, {
                action: "DELETE",
                resource: "ImportFolder",
                resourceId: id,
                newValue: result,
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Folder deleted successfully",
                data: result,
            });
        },
    ),

    /**
     * Moves an attachment to a different folder.
     *
     * @param req - Express request object containing attachmentId and folderId in body.
     * @param res - Express response object used to confirm move.
     * @returns JSON response with success status and result data.
     */
    moveFile: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { attachmentId, folderId } = req.body;

            const result = await FolderService.moveFile(
                attachmentId,
                folderId || null,
                companyId,
            );

            await writeAudit(req, {
                action: "UPDATE",
                resource: "Attachment",
                resourceId: attachmentId,
                newValue: { folderId: folderId || null },
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "File moved successfully",
                data: result,
            });
        },
    ),

    /**
     * Retrieves export data for all files within a folder.
     *
     * @param req - Express request object with folder ID in params.
     * @param res - Express response object used to return export data.
     * @returns JSON response with success status and folder export data.
     */
    exportFolder: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const result = await FolderService.exportFolder(companyId, id);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Folder export data fetched successfully",
                data: result,
            });
        },
    ),
};
