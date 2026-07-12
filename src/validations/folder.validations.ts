import { z } from "zod";

export const createFolderSchema = {
    body: z.object({
        name: z.string().min(1, "Folder name is required").max(100),
        parentId: z.string().uuid().optional(),
    }),
};

export const updateFolderSchema = {
    body: z.object({
        name: z.string().min(1, "Folder name is required").max(100),
        parentId: z.string().uuid().nullable().optional(),
    }),
};

export const folderParamsSchema = {
    params: z.object({
        id: z.string().uuid("Invalid folder ID"),
    }),
};

export const moveFileSchema = {
    body: z.object({
        attachmentId: z.string().uuid("Invalid attachment ID"),
        folderId: z.string().uuid("Invalid folder ID").nullable().optional(),
    }),
};
