import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import cloudinary from "../config/cloudinary";
import type { Stream } from "stream";

export interface FolderTreeNode {
    id: string;
    name: string;
    parentId: string | null;
    fileCount: number;
    children: FolderTreeNode[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Builds a hierarchical folder tree structure for a given company.
 * Fetches all folders and their attachment counts, then nests children under their parents.
 *
 * @param companyId - The numeric ID of the company to build the tree for.
 * @returns An array of root-level FolderTreeNode objects with nested children.
 */
async function buildFolderTree(companyId: number): Promise<FolderTreeNode[]> {
    const folders = await prisma.importFolder.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
    });

    const fileCounts = await prisma.attachment.groupBy({
        by: ["folderId"],
        where: {
            folderId: { not: null },
            referenceType: "DATA_IMPORT",
        },
        _count: { id: true },
    });

    const countMap = new Map(fileCounts.map((f) => [f.folderId, f._count.id]));

    const folderMap = new Map<string, FolderTreeNode>();
    const roots: FolderTreeNode[] = [];

    for (const f of folders) {
        folderMap.set(f.id, {
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            fileCount: countMap.get(f.id) ?? 0,
            children: [],
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
        });
    }

    for (const node of folderMap.values()) {
        if (node.parentId && folderMap.has(node.parentId)) {
            folderMap.get(node.parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

export const FolderService = {
    /**
     * Lists all import folders for a company as a hierarchical tree structure.
     *
     * @param companyId - The numeric ID of the company.
     * @returns An array of root-level folder tree nodes.
     */
    async list(companyId: number): Promise<FolderTreeNode[]> {
        return buildFolderTree(companyId);
    },

    /**
     * Retrieves a single folder by ID with its attachment count, scoped to a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique string ID of the folder.
     * @returns The folder record with an _count of attachments.
     * @throws {CustomError} If the folder is not found.
     */
    async getById(companyId: number, id: string) {
        const folder = await prisma.importFolder.findFirst({
            where: { id, companyId },
            include: { _count: { select: { attachments: true } } },
        });
        if (!folder) {
            throw new CustomError(httpStatus.NOT_FOUND, "Folder not found");
        }
        return folder;
    },

    /**
     * Creates a new import folder for a company, optionally under a parent folder.
     * Validates the parent folder exists and that no duplicate name exists at the same level.
     *
     * @param companyId - The numeric ID of the company.
     * @param name - The display name for the new folder.
     * @param parentId - An optional parent folder ID for nesting.
     * @returns The newly created folder record.
     * @throws {CustomError} If the parent folder is not found or a duplicate name exists.
     */
    async create(companyId: number, name: string, parentId?: string) {
        if (parentId) {
            const parent = await prisma.importFolder.findFirst({
                where: { id: parentId, companyId },
            });
            if (!parent) {
                throw new CustomError(httpStatus.NOT_FOUND, "Parent folder not found");
            }
        }

        const existing = await prisma.importFolder.findFirst({
            where: { companyId, name, parentId: parentId ?? null },
        });
        if (existing) {
            throw new CustomError(httpStatus.CONFLICT, "A folder with this name already exists in this location");
        }

        return prisma.importFolder.create({
            data: { name, companyId, parentId },
        });
    },

    /**
     * Updates an existing folder's name and optionally its parent.
     * Validates the target parent folder exists and belongs to the same company.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the folder to update.
     * @param name - The new name for the folder.
     * @param parentId - An optional new parent folder ID, or null to remove nesting.
     * @returns The updated folder record.
     * @throws {CustomError} If the folder or target parent is not found.
     */
    async update(companyId: number, id: string, name: string, parentId?: string) {
        const folder = await prisma.importFolder.findFirst({
            where: { id, companyId },
        });
        if (!folder) {
            throw new CustomError(httpStatus.NOT_FOUND, "Folder not found");
        }

        const data: Record<string, unknown> = { name };
        if (parentId !== undefined) {
            // Validate target parent exists and belongs to same company
            if (parentId !== null) {
                const parent = await prisma.importFolder.findFirst({
                    where: { id: parentId, companyId },
                });
                if (!parent) {
                    throw new CustomError(httpStatus.NOT_FOUND, "Parent folder not found");
                }
            }
            data.parentId = parentId;
        }

        return prisma.importFolder.update({
            where: { id },
            data: data as any,
        });
    },

    /**
     * Removes a folder and all its descendant folders. Unlinks all attachments
     * from the deleted folders before removal.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the folder to remove.
     * @returns An object indicating success and the count of unlinked files.
     * @throws {CustomError} If the folder is not found.
     */
    async remove(companyId: number, id: string) {
        const folder = await prisma.importFolder.findFirst({
            where: { id, companyId },
            include: { _count: { select: { attachments: true } } },
        });
        if (!folder) {
            throw new CustomError(httpStatus.NOT_FOUND, "Folder not found");
        }

        // Unlink all attachments from this folder
        await prisma.attachment.updateMany({
            where: { folderId: id },
            data: { folderId: null },
        });

        // Delete sub-folders recursively (find all descendent folders)
        const descendents = await this.getDescendentIds(companyId, id);
        await prisma.importFolder.deleteMany({
            where: { id: { in: [id, ...descendents] } },
        });

        return { deleted: true, unlinkedFiles: folder._count.attachments };
    },

    /**
     * Recursively collects all descendant folder IDs for a given parent folder.
     *
     * @param companyId - The numeric ID of the company.
     * @param parentId - The ID of the parent folder to find descendants for.
     * @returns An array of descendant folder IDs.
     */
    async getDescendentIds(companyId: number, parentId: string): Promise<string[]> {
        const children = await prisma.importFolder.findMany({
            where: { parentId, companyId },
            select: { id: true },
        });
        const ids: string[] = [];
        for (const child of children) {
            ids.push(child.id);
            const grandChildren = await this.getDescendentIds(companyId, child.id);
            ids.push(...grandChildren);
        }
        return ids;
    },

    /**
     * Moves an attachment (import record) into a different folder, or removes it from any folder.
     *
     * @param attachmentId - The ID of the attachment to move.
     * @param folderId - The target folder ID, or null to unlink from any folder.
     * @param companyId - The numeric ID of the company for folder validation.
     * @returns The updated attachment record with id, folderId, and fileName.
     * @throws {CustomError} If the attachment or destination folder is not found.
     */
    async moveFile(attachmentId: string, folderId: string | null, companyId: number) {
        const attachment = await prisma.attachment.findFirst({
            where: { id: attachmentId, referenceType: "DATA_IMPORT" },
        });
        if (!attachment) {
            throw new CustomError(httpStatus.NOT_FOUND, "Import record not found");
        }

        if (folderId) {
            const folder = await prisma.importFolder.findFirst({
                where: { id: folderId, companyId },
            });
            if (!folder) {
                throw new CustomError(httpStatus.NOT_FOUND, "Destination folder not found");
            }
        }

        return prisma.attachment.update({
            where: { id: attachmentId },
            data: { folderId },
            select: { id: true, folderId: true, fileName: true },
        });
    },

    /**
     * Exports all attachments within a folder and its sub-folders, providing download URLs.
     * Transforms Cloudinary URLs to force attachment-style downloads.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the folder to export.
     * @returns An object containing the folder name and an array of attachment details with download URLs.
     * @throws {CustomError} If the folder is not found.
     */
    async exportFolder(companyId: number, id: string): Promise<{
        attachments: { fileName: string; downloadUrl: string }[];
        folderName: string;
    }> {
        const folder = await prisma.importFolder.findFirst({
            where: { id, companyId },
        });
        if (!folder) {
            throw new CustomError(httpStatus.NOT_FOUND, "Folder not found");
        }

        // Get all attachments in this folder and sub-folders
        const descendents = await this.getDescendentIds(companyId, id);
        const allFolderIds = [id, ...descendents];

        const attachments = await prisma.attachment.findMany({
            where: { folderId: { in: allFolderIds }, referenceType: "DATA_IMPORT" },
            orderBy: { uploadedAt: "desc" },
        });

        return {
            folderName: folder.name,
            attachments: attachments.map((a) => ({
                fileName: a.fileName,
                downloadUrl: a.filePath.replace("/upload/", "/upload/fl_attachment/"),
            })),
        };
    },
};
