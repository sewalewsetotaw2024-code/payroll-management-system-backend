import prisma from "../config/database";
import cloudinary from "../config/cloudinary";
import CustomError from "../utils/customError";
import httpStatus from "http-status";

/**
 * Service for managing payslip templates per company.
 * Templates define layout, language, and custom fields for payslip generation.
 */
export class PayslipTemplateService {
    /**
     * Returns all templates belonging to the specified company.
     * Ordered by isDefault (true first), then by name ascending.
     */
    async listTemplates(companyId: number) {
        return prisma.payslipTemplate.findMany({
            where: { companyId },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        });
    }

    /**
     * Returns a single template by ID scoped to the company.
     * Throws 404 if not found.
     */
    async getTemplate(companyId: number, templateId: string) {
        const template = await prisma.payslipTemplate.findFirst({
            where: { id: templateId, companyId },
        });

        if (!template) {
            throw new CustomError(
                httpStatus.NOT_FOUND,
                "Payslip template not found",
            );
        }

        return template;
    }

    /**
     * Creates a new payslip template for the company.
     * When `isDefault` is true, all other templates for the company are
     * unset as default within the same transaction to guarantee exactly
     * one default per company.
     *
     * Validates that no template with the same name already exists for
     * the company (case-sensitive) to prevent duplicates.
     */
    async createTemplate(
        companyId: number,
        data: {
            name: string;
            companyLogo?: string;
            language?: string;
            customFields?: any;
            isDefault?: boolean;
        },
    ) {
        // Reject duplicate names within the same company
        const existing = await prisma.payslipTemplate.findFirst({
            where: { companyId, name: data.name },
        });

        if (existing) {
            throw new CustomError(
                httpStatus.CONFLICT,
                "A template with this name already exists for this company",
            );
        }

        // If marking as default, clear other defaults in a transaction
        if (data.isDefault) {
            return prisma.$transaction(async (tx) => {
                await tx.payslipTemplate.updateMany({
                    where: { companyId, isDefault: true },
                    data: { isDefault: false },
                });

                return tx.payslipTemplate.create({
                    data: {
                        companyId,
                        name: data.name,
                        companyLogo: data.companyLogo ?? null,
                        language: data.language ?? "en",
                        customFields: data.customFields ?? undefined,
                        isDefault: data.isDefault ?? false,
                    },
                });
            });
        }

        return prisma.payslipTemplate.create({
            data: {
                companyId,
                name: data.name,
                companyLogo: data.companyLogo ?? null,
                language: data.language ?? "en",
                customFields: data.customFields ?? undefined,
                isDefault: data.isDefault ?? false,
            },
        });
    }

    /**
     * Uploads the raw HTML template content to Cloudinary as an object store
     * and saves the URL on the template record.
     *
     * @param companyId - The company scoping the template.
     * @param templateId - The template to attach the uploaded HTML to.
     * @param htmlContent - The raw Handlebars HTML template string.
     * @returns The updated template with templateUrl.
     */
    async uploadTemplateHtml(
      companyId: number,
      templateId: string,
      htmlContent: string,
    ) {
      const template = await prisma.payslipTemplate.findFirst({
        where: { id: templateId, companyId },
      });
      if (!template) {
        throw new CustomError(httpStatus.NOT_FOUND, "Payslip template not found");
      }

      const base64 = Buffer.from(htmlContent, "utf-8").toString("base64");
      const dataUri = `data:text/html;base64,${base64}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: `company_${companyId}/payslip-templates`,
        resource_type: "raw",
        public_id: `template-${templateId}-${Date.now()}`,
      });

      return prisma.payslipTemplate.update({
        where: { id: templateId },
        data: { templateUrl: result.secure_url },
      });
    }

    /**
     * Downloads the raw HTML content of a template from Cloudinary.
     * Returns null if no templateUrl is set.
     */
    async downloadTemplateHtml(companyId: number, templateId: string): Promise<string | null> {
      const template = await prisma.payslipTemplate.findFirst({
        where: { id: templateId, companyId },
      });
      if (!template?.templateUrl) return null;

      const response = await fetch(template.templateUrl);
      return response.text();
    }

    /**
     * Updates an existing payslip template scoped to the company.
     * When `isDefault` is set to true, clears all other defaults first.
     *
     * Validates that the new name (if changed) does not collide with
     * another template in the same company.
     *
     * Throws 404 if the template is not found.
     */
    async updateTemplate(
        companyId: number,
        templateId: string,
        data: {
            name?: string;
            companyLogo?: string | null;
            language?: string;
            customFields?: any;
            isDefault?: boolean;
        },
    ) {
        const template = await prisma.payslipTemplate.findFirst({
            where: { id: templateId, companyId },
        });

        if (!template) {
            throw new CustomError(
                httpStatus.NOT_FOUND,
                "Payslip template not found",
            );
        }

        // Check for name collision if name is being changed
        if (data.name && data.name !== template.name) {
            const duplicate = await prisma.payslipTemplate.findFirst({
                where: { companyId, name: data.name },
            });

            if (duplicate) {
                throw new CustomError(
                    httpStatus.CONFLICT,
                    "A template with this name already exists for this company",
                );
            }
        }

        // If promoting to default, clear other defaults in a transaction
        if (data.isDefault && !template.isDefault) {
            return prisma.$transaction(async (tx) => {
                await tx.payslipTemplate.updateMany({
                    where: { companyId, isDefault: true, id: { not: templateId } },
                    data: { isDefault: false },
                });

                return tx.payslipTemplate.update({
                    where: { id: templateId },
                    data,
                });
            });
        }

        return prisma.payslipTemplate.update({
            where: { id: templateId },
            data,
        });
    }

    /**
     * Hard-deletes a payslip template. If the template is currently the
     * default and is the only default, it will simply be removed (no
     * replacement default is auto-assigned — the caller decides).
     *
     * Throws 404 if the template is not found.
     */
    async deleteTemplate(companyId: number, templateId: string) {
        const template = await prisma.payslipTemplate.findFirst({
            where: { id: templateId, companyId },
        });

        if (!template) {
            throw new CustomError(
                httpStatus.NOT_FOUND,
                "Payslip template not found",
            );
        }

        await prisma.payslipTemplate.delete({
            where: { id: templateId },
        });

        return { deleted: true };
    }
}

export const payslipTemplateService = new PayslipTemplateService();
