import prisma from "../config/database";
import CustomError from "../utils/customError";
import httpStatus from "http-status";
import { $Enums } from "../generated/prisma";

type IntegrationSystem = $Enums.IntegrationSystem;

/**
 * Service for managing API credentials used to authenticate with external integration systems.
 * Provides CRUD operations, credential rotation, and deactivation.
 */
export class ApiCredentialService {
    /**
     * Finds the active API credential for a given integration system.
     *
     * @param system - The integration system to look up.
     * @returns The active credential record, or null if none exists.
     */
    async findBySystem(system: IntegrationSystem) {
        return prisma.apiCredential.findFirst({
            where: { system, isActive: true },
        });
    }

    /**
     * Lists all API credentials ordered by creation date (newest first).
     *
     * @returns An array of all credential records.
     */
    async list() {
        return prisma.apiCredential.findMany({ orderBy: { createdAt: "desc" } });
    }

    /**
     * Creates a new API credential for an integration system.
     * Throws if an active credential already exists for the same system.
     *
     * @param data - Object containing the system, authType, baseUrl, and credential value.
     * @returns The newly created credential record.
     * @throws {CustomError} If an active credential already exists for the specified system.
     */
    async create(data: {
        system: IntegrationSystem;
        authType: string;
        baseUrl: string;
        credential: string;
    }) {
        const existing = await prisma.apiCredential.findFirst({
            where: { system: data.system, isActive: true },
        });

        if (existing) {
            throw new CustomError(
                httpStatus.CONFLICT,
                `Active credential already exists for system ${data.system}`,
            );
        }

        return prisma.apiCredential.create({ data });
    }

    /**
     * Updates an existing API credential by ID.
     *
     * @param id - The unique ID of the credential to update.
     * @param data - Partial object containing the fields to update.
     * @returns The updated credential record.
     * @throws {CustomError} If no credential is found with the given ID.
     */
    async update(id: string, data: Partial<{
        authType: string;
        baseUrl: string;
        credential: string;
        isActive: boolean;
    }>) {
        const credential = await prisma.apiCredential.findUnique({ where: { id } });
        if (!credential) {
            throw new CustomError(httpStatus.NOT_FOUND, "API credential not found");
        }

        return prisma.apiCredential.update({ where: { id }, data });
    }

    /**
     * Rotates the credential value for an existing API credential.
     * Convenience wrapper around update that only changes the credential string.
     *
     * @param id - The unique ID of the credential to rotate.
     * @param newCredential - The new credential value to set.
     * @returns The updated credential record.
     */
    async rotate(id: string, newCredential: string) {
        return this.update(id, { credential: newCredential });
    }

    /**
     * Deactivates an API credential by ID (soft delete via isActive flag).
     *
     * @param id - The unique ID of the credential to deactivate.
     * @returns The updated credential record with isActive set to false.
     */
    async deactivate(id: string) {
        return this.update(id, { isActive: false });
    }
}

export const apiCredentialService = new ApiCredentialService();
