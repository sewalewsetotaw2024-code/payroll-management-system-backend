import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { payrollConfigurationService } from "../services/payrollConfiguration.service";
import { writeAudit } from "../utils/audit";
import { resolveCompanyId } from "../utils/roleGuard";
import {
    getPaginationParams,
    formatPaginatedResponse,
} from "../utils/pagination";
import { $Enums } from "../generated/prisma";
import prisma from "../config/database";

export const PayrollConfiguration = {
    // =========================================================================
    // FISCAL YEAR
    // =========================================================================

    /**
     * Creates a new fiscal year with start/end dates.
     * Validates input and ensures no overlapping fiscal years exist.
     *
     * @param req - Express request object containing fiscal year data in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created fiscal year data.
     * @throws {CustomError} If validation fails or a fiscal year overlaps.
     */
    createFiscalYearConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { name, startDate, endDate, status } = req.body;

            const fiscalYear =
                await payrollConfigurationService.createFiscalYearConfiguration(
                    companyId,
                    name,
                    startDate,
                    endDate,
                    status,
                );

            await writeAudit(req, {
                action: "CREATE",
                resource: "FiscalYear",
                resourceId: fiscalYear.id,
                newValue: fiscalYear
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Fiscal year created successfully",
                data: fiscalYear,
            });
        },
    ),
    /**
     * Updates an existing fiscal year's details such as name, dates, or status.
     *
     * @param req - Express request object with fiscal year ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated fiscal year data.
     * @throws {CustomError} If fiscal year not found or update violates business rules.
     */
    updateFiscalYearConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { name, startDate, endDate, status } = req.body;
            const { id } = req.params;

            const fiscalYear =
                await payrollConfigurationService.updateFiscalYearConfiguration(
                    companyId,
                    id,
                    name,
                    startDate,
                    endDate,
                    status,
                );

            await writeAudit(req, {
                action: "UPDATE",
                resource: "FiscalYear",
                resourceId: id,
                newValue: fiscalYear
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Fiscal year updated successfully",
                data: fiscalYear,
            });
        },
    ),
    /**
     * Deletes (soft-deletes) a fiscal year by its ID.
     *
     * @param req - Express request object with fiscal year ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted fiscal year data.
     * @throws {CustomError} If fiscal year not found.
     */
    deleteFiscalYearConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const fiscalYear =
                await payrollConfigurationService.deleteFiscalYearConfiguration(
                    companyId,
                    id,
                );

            await writeAudit(req, {
                action: "DELETE",
                resource: "FiscalYear",
                resourceId: id,
                newValue: { isDeleted: true }
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Fiscal year deleted successfully",
                data: fiscalYear,
            });
        },
    ),
    /**
     * Retrieves a single fiscal year by its ID.
     *
     * @param req - Express request object with fiscal year ID in params.
     * @param res - Express response object used to return fiscal year.
     * @returns JSON response with success status and fiscal year data.
     */
    getFiscalYearConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const fiscalYear =
                await payrollConfigurationService.getFiscalYearConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Fiscal year fetched successfully",
                data: fiscalYear,
            });
        },
    ),
    /**
     * Retrieves a paginated list of all fiscal years for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated fiscal years data.
     */
    getAllFiscalYearsConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const { page, limit, skip, take } = getPaginationParams(req);

            const { fiscalYears, totalItems } =
                await payrollConfigurationService.getAllFiscalYearsConfiguration(
                    companyId,
                    skip,
                    take,
                );

            const response = formatPaginatedResponse(
                fiscalYears,
                totalItems,
                page,
                limit,
                "Fiscal years fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Batch-saves an array of fiscal year configurations.
     *
     * @param req - Express request object containing fiscal years array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If fiscal years input is not an array.
     */
    saveFiscalYearConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const fiscalYears = Array.isArray(req.body) ? req.body : req.body.fiscalYears;
        if (!Array.isArray(fiscalYears)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Fiscal years must be an array");
        }
        const result = await payrollConfigurationService.saveFiscalYearBatch(companyId, fiscalYears);
        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "FiscalYear",
            resourceId: companyId.toString(),
            newValue: result
        });
        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    /**
     * Activates a fiscal year, making it the active configuration.
     *
     * @param req - Express request object with fiscal year ID in params.
     * @param res - Express response object used to return activated entity.
     * @returns JSON response with success status and activated fiscal year data.
     * @throws {CustomError} If fiscal year not found.
     */
    activateFiscalYear: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const fiscalYear = await payrollConfigurationService.activateFiscalYear(companyId, id);

            await writeAudit(req, {
                action: "ACTIVATE",
                resource: "FiscalYear",
                resourceId: id,
                newValue: fiscalYear
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Fiscal year activated successfully",
                data: fiscalYear,
            });
        },
    ),

    /**
     * Closes a fiscal year, ending its active period.
     *
     * @param req - Express request object with fiscal year ID in params.
     * @param res - Express response object used to return closed entity.
     * @returns JSON response with success status and closed fiscal year data.
     * @throws {CustomError} If fiscal year not found.
     */
    closeFiscalYear: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const fiscalYear = await payrollConfigurationService.closeFiscalYear(companyId, id);

            await writeAudit(req, {
                action: "CLOSE",
                resource: "FiscalYear",
                resourceId: id,
                newValue: fiscalYear
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Fiscal year closed successfully",
                data: fiscalYear,
            });
        },
    ),

    // =========================================================================
    // TAX CONFIGURATION
    // =========================================================================

    /**
     * Creates a new tax bracket with rate and income boundaries.
     *
     * @param req - Express request object containing lowerBound, upperBound, rate, deductionAmount, effectiveDate, and expiryDate in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created tax bracket data.
     * @throws {CustomError} If validation fails.
     */
    createTaxBracketConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const {
                lowerBound,
                upperBound,
                rate,
                deductionAmount,
                effectiveDate,
                expiryDate,
            } = req.body;

            const taxBracket =
                await payrollConfigurationService.createTaxBracketConfiguration(
                    companyId,
                    lowerBound,
                    upperBound,
                    rate,
                    deductionAmount,
                    effectiveDate,
                    expiryDate,
                );

            await writeAudit(req, {
                action: "CREATE",
                resource: "TaxBracket",
                resourceId: taxBracket.id,
                newValue: taxBracket
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Tax bracket created successfully",
                data: taxBracket,
            });
        },
    ),
    /**
     * Updates an existing tax bracket's rate and boundaries.
     *
     * @param req - Express request object with tax bracket ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated tax bracket data.
     * @throws {CustomError} If tax bracket not found.
     */
    updateTaxBracketConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const {
                lowerBound,
                upperBound,
                rate,
                deductionAmount,
                effectiveDate,
                expiryDate,
            } = req.body;

            const taxBracket =
                await payrollConfigurationService.updateTaxBracketConfiguration(
                    companyId,
                    id,
                    lowerBound,
                    upperBound,
                    rate,
                    deductionAmount,
                    effectiveDate,
                    expiryDate,
                );

            await writeAudit(req, {
                action: "UPDATE",
                resource: "TaxBracket",
                resourceId: id,
                newValue: taxBracket
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Tax bracket updated successfully",
                data: taxBracket,
            });
        },
    ),
    /**
     * Deletes a tax bracket by its ID.
     *
     * @param req - Express request object with tax bracket ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted tax bracket data.
     * @throws {CustomError} If tax bracket not found.
     */
    deleteTaxBracketConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const taxBracket =
                await payrollConfigurationService.deleteTaxBracketConfiguration(
                    companyId,
                    id,
                );

            await writeAudit(req, {
                action: "DELETE",
                resource: "TaxBracket",
                resourceId: id,
                newValue: { isDeleted: true }
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Tax bracket deleted successfully",
                data: taxBracket,
            });
        },
    ),
    /**
     * Retrieves a single tax bracket by its ID.
     *
     * @param req - Express request object with tax bracket ID in params.
     * @param res - Express response object used to return tax bracket.
     * @returns JSON response with success status and tax bracket data.
     */
    getTaxBracketConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const taxBracket =
                await payrollConfigurationService.getTaxBracketConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Tax bracket fetched successfully",
                data: taxBracket,
            });
        },
    ),
    /**
     * Retrieves a paginated list of all tax brackets for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated tax brackets data.
     */
    getAllTaxBracketsConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { page, limit, skip, take } = getPaginationParams(req);
            const { taxBrackets, totalItems } =
                await payrollConfigurationService.getAllTaxBracketsConfiguration(
                    companyId,
                    skip,
                    take,
                );
            const response = formatPaginatedResponse(
                taxBrackets,
                totalItems,
                page,
                limit,
                "Tax brackets fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Batch-saves an array of tax bracket configurations.
     *
     * @param req - Express request object containing tax brackets array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If tax brackets input is not an array.
     */
    saveTaxBracketConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const taxBrackets = Array.isArray(req.body) ? req.body : req.body.taxBrackets;
        if (!Array.isArray(taxBrackets)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Tax brackets must be an array");
        }
        const result = await payrollConfigurationService.saveTaxBracketBatch(companyId, taxBrackets);
        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "TaxBracket",
            resourceId: companyId.toString(),
            newValue: result
        });
        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // PENSION CONFIGURATION
    // =========================================================================

    /**
     * Creates a new pension rule with employer/employee rates and effective date.
     *
     * @param req - Express request object containing employeeRate, employerRate, basis, mandatoryForForeigners, remittanceDeadlineDays, and effectiveDate in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created pension rule data.
     * @throws {CustomError} If validation fails.
     */
    createPensionRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const {
                employeeRate,
                employerRate,
                basis,
                mandatoryForForeigners,
                remittanceDeadlineDays,
                effectiveDate,
            } = req.body;

                const pensionRule =
                await payrollConfigurationService.createPensionRuleConfiguration(
                    companyId,
                    employeeRate,
                    employerRate,
                    basis,
                    mandatoryForForeigners,
                    remittanceDeadlineDays,
                    new Date(effectiveDate),
                );

            await writeAudit(req, {
                action: "CREATE",
                resource: "PensionRule",
                resourceId: pensionRule.id,
                newValue: pensionRule
            });

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Pension rule created successfully",
                data: pensionRule,
            });
        },
    ),
    /**
     * Updates an existing pension rule's rates and effective date.
     *
     * @param req - Express request object with pension rule ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated pension rule data.
     * @throws {CustomError} If pension rule not found.
     */
    updatePensionRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const {
                employeeRate,
                employerRate,
                basis,
                mandatoryForForeigners,
                remittanceDeadlineDays,
                effectiveDate,
            } = req.body;

            const pensionRule =
                await payrollConfigurationService.updatePensionRuleConfiguration(
                    companyId,
                    id,
                    employeeRate,
                    employerRate,
                    basis,
                    mandatoryForForeigners,
                    remittanceDeadlineDays,
                    new Date(effectiveDate),
                );

            await writeAudit(req, {
                action: "UPDATE",
                resource: "PensionRule",
                resourceId: id,
                newValue: pensionRule
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Pension rule updated successfully",
                data: pensionRule,
            });
        },
    ),
    /**
     * Deactivates a pension rule by its ID.
     *
     * @param req - Express request object with pension rule ID in params.
     * @param res - Express response object used to confirm deactivation.
     * @returns JSON response with success status and deactivated pension rule data.
     * @throws {CustomError} If pension rule not found.
     */
    deletePensionRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const pensionRule =
                await payrollConfigurationService.deletePensionRuleConfiguration(
                    companyId,
                    id,
                );

            await writeAudit(req, {
                action: "DELETE",
                resource: "PensionRule",
                resourceId: id,
                newValue: { isActive: false }
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Pension rule deleted successfully",
                data: pensionRule,
            });
        },
    ),
    /**
     * Retrieves a single pension rule by its ID.
     *
     * @param req - Express request object with pension rule ID in params.
     * @param res - Express response object used to return pension rule.
     * @returns JSON response with success status and pension rule data.
     */
    getPensionRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const pensionRule =
                await payrollConfigurationService.getPensionRuleConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Pension rule fetched successfully",
                data: pensionRule,
            });
        },
    ),
    /**
     * Retrieves a paginated list of all pension rules for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated pension rules data.
     */
    getAllPensionRulesConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { page, limit, skip, take } = getPaginationParams(req);
            const { pensionRules, totalItems } =
                await payrollConfigurationService.getAllPensionRulesConfiguration(
                    companyId,
                    skip,
                    take,
                );
            const response = formatPaginatedResponse(
                pensionRules,
                totalItems,
                page,
                limit,
                "Pension rules fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Batch-saves an array of pension rule configurations.
     *
     * @param req - Express request object containing pension rules array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If pension rules input is not an array.
     */
    savePensionRuleConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const pensionRules = Array.isArray(req.body) ? req.body : req.body.pensionRules;
        if (!Array.isArray(pensionRules)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Pension rules must be an array");
        }
        const result = await payrollConfigurationService.savePensionRuleBatch(companyId, pensionRules);
        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "PensionRule",
            resourceId: companyId.toString(),
            newValue: result
        });
        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // OVERTIME CONFIGURATION
    // =========================================================================

    /**
     * Creates a new overtime rule with category, rate, and weekly cap.
     *
     * @param req - Express request object containing category, rate, weeklyCapHours, and effectiveDate in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created overtime rule data.
     */
    createOvertimeRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { category, rate, weeklyCapHours, effectiveDate, calculationBase, isTaxable, monthlyCapHours } = req.body;
            const overtimeRule =
                await payrollConfigurationService.createOvertimeRuleConfiguration(
                    companyId,
                    category,
                    rate,
                    weeklyCapHours,
                    new Date(effectiveDate),
                    calculationBase,
                    isTaxable,
                    monthlyCapHours,
                );
            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Overtime rule created successfully",
                data: overtimeRule,
            });
        },
    ),
    /**
     * Updates an existing overtime rule's category, rate, and weekly cap.
     *
     * @param req - Express request object with overtime rule ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated overtime rule data.
     */
    updateOvertimeRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const { category, rate, weeklyCapHours, effectiveDate, calculationBase, isTaxable, monthlyCapHours } = req.body;
            const overtimeRule =
                await payrollConfigurationService.updateOvertimeRuleConfiguration(
                    companyId,
                    id,
                    category,
                    rate,
                    weeklyCapHours,
                    new Date(effectiveDate),
                    calculationBase,
                    isTaxable,
                    monthlyCapHours,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Overtime rule updated successfully",
                data: overtimeRule,
            });
        },
    ),
    /**
     * Deletes an overtime rule by its ID.
     *
     * @param req - Express request object with overtime rule ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted overtime rule data.
     */
    deleteOvertimeRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const overtimeRule =
                await payrollConfigurationService.deleteOvertimeRuleConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Overtime rule deleted successfully",
                data: overtimeRule,
            });
        },
    ),
    /**
     * Retrieves a single overtime rule by its ID.
     *
     * @param req - Express request object with overtime rule ID in params.
     * @param res - Express response object used to return overtime rule.
     * @returns JSON response with success status and overtime rule data.
     */
    getOvertimeRuleConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const overtimeRule =
                await payrollConfigurationService.getOvertimeRuleConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Overtime rule fetched successfully",
                data: overtimeRule,
            });
        },
    ),
    /**
     * Retrieves a paginated list of all overtime rules for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated overtime rules data.
     */
    getAllOvertimeRulesConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { page, limit, skip, take } = getPaginationParams(req);
            const { overtimeRules, totalItems } =
                await payrollConfigurationService.getAllOvertimeRulesConfiguration(
                    companyId,
                    skip,
                    take,
                );
            const response = formatPaginatedResponse(
                overtimeRules,
                totalItems,
                page,
                limit,
                "Overtime rules fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Batch-saves an array of overtime rule configurations.
     *
     * @param req - Express request object containing overtime rules array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If overtime rules input is not an array.
     */
    saveOvertimeConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const overtimeRules = Array.isArray(req.body) ? req.body : req.body.overtimeRules;

        if (!Array.isArray(overtimeRules)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Overtime rules must be an array");
        }

        const result = await payrollConfigurationService.saveOvertimeConfigurations(companyId, overtimeRules);

        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "OvertimeRule",
            resourceId: companyId.toString(),
            newValue: result
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // ALLOWANCE CONFIGURATION
    // =========================================================================

    /**
     * Creates a new allowance configuration with earning type, label, and taxability.
     *
     * @param req - Express request object containing earningType, label, and isTaxable in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created allowance data.
     */
    createAllowanceConfiguration: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { earningType, label, isTaxable, isExempt, exemptPercent } = req.body;

        const allowance = await payrollConfigurationService.createAllowanceConfiguration(
            companyId,
            earningType,
            label,
            isTaxable,
            isExempt,
            exemptPercent
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "AllowanceConfig",
            resourceId: allowance.id,
            newValue: allowance
        });

        res.status(httpStatus.CREATED).json({ success: true, data: allowance });
    }),

    /**
     * Updates an existing allowance configuration's label, taxability, or active status.
     *
     * @param req - Express request object with allowance ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated allowance data.
     */
    updateAllowanceConfiguration: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const { label, isTaxable, isActive, isExempt, exemptPercent } = req.body;

        const allowance = await payrollConfigurationService.updateAllowanceConfiguration(
            companyId,
            id,
            label,
            isTaxable,
            isActive,
            isExempt,
            exemptPercent
        );

        await writeAudit(req, {
            action: "UPDATE",
            resource: "AllowanceConfig",
            resourceId: id,
            newValue: allowance
        });

        res.status(httpStatus.OK).json({ success: true, data: allowance });
    }),

    /**
     * Deletes an allowance configuration by its ID.
     *
     * @param req - Express request object with allowance ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted allowance data.
     */
    deleteAllowanceConfiguration: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const result = await payrollConfigurationService.deleteAllowanceConfiguration(companyId, id);

        await writeAudit(req, {
            action: "DELETE",
            resource: "AllowanceConfig",
            resourceId: id
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    /**
     * Retrieves a single allowance configuration by its ID.
     *
     * @param req - Express request object with allowance ID in params.
     * @param res - Express response object used to return allowance.
     * @returns JSON response with success status and allowance data.
     */
    getAllowanceConfiguration: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const allowance = await payrollConfigurationService.getAllowanceConfiguration(companyId, id);
        res.status(httpStatus.OK).json({ success: true, data: allowance });
    }),

    /**
     * Retrieves a paginated list of all allowance configurations for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated allowance configurations data.
     */
    getAllAllowanceConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { page, limit, skip, take } = getPaginationParams(req);
        const result = await payrollConfigurationService.getAllAllowanceConfigurations(companyId, skip, take);
        res.status(httpStatus.OK).json({
            ...formatPaginatedResponse(result.allowances, result.totalItems, page, limit)
        });
    }),

    /**
     * Batch-saves an array of allowance configurations.
     *
     * @param req - Express request object containing allowances array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If allowances input is not an array.
     */
    saveAllowanceConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const allowances = Array.isArray(req.body) ? req.body : req.body.allowances; // Expects array of { earningType, label, isTaxable }

        if (!Array.isArray(allowances)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Allowances must be an array");
        }

        const result = await payrollConfigurationService.saveAllowanceConfigurations(companyId, allowances);

        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "AllowanceConfig",
            resourceId: companyId.toString(),
            newValue: result
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // SALARY STRUCTURE
    // =========================================================================

    /**
     * Creates a new salary structure with name and optional description.
     *
     * @param req - Express request object containing name and optional description in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created salary structure data.
     * @throws {CustomError} If name is missing or empty.
     */
    createSalaryStructure: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { name, description } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            throw new CustomError(httpStatus.BAD_REQUEST, "name is required");
        }

        const salaryStructure = await payrollConfigurationService.createSalaryStructure(
            companyId,
            name.trim(),
            description,
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "SalaryStructure",
            resourceId: salaryStructure.id,
            newValue: salaryStructure
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: "Salary structure created successfully",
            data: salaryStructure,
        });
    }),

    /**
     * Updates an existing salary structure's name or description.
     *
     * @param req - Express request object with salary structure ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated salary structure data.
     * @throws {CustomError} If name is provided but empty.
     */
    updateSalaryStructure: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const { name, description } = req.body;

        if (name !== undefined && (typeof name !== "string" || !name.trim())) {
            throw new CustomError(httpStatus.BAD_REQUEST, "name must be a non-empty string");
        }

        const salaryStructure = await payrollConfigurationService.updateSalaryStructure(
            companyId,
            id,
            name?.trim(),
            description,
        );

        await writeAudit(req, {
            action: "UPDATE",
            resource: "SalaryStructure",
            resourceId: id,
            newValue: salaryStructure
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Salary structure updated successfully",
            data: salaryStructure,
        });
    }),

    /**
     * Deletes (soft-deletes) a salary structure by its ID.
     *
     * @param req - Express request object with salary structure ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted salary structure data.
     * @throws {CustomError} If salary structure not found.
     */
    deleteSalaryStructure: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const salaryStructure = await payrollConfigurationService.deleteSalaryStructure(
            companyId,
            id,
        );

        await writeAudit(req, {
            action: "DELETE",
            resource: "SalaryStructure",
            resourceId: id,
            newValue: { isActive: false }
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Salary structure deleted successfully",
            data: salaryStructure,
        });
    }),

    /**
     * Retrieves a single salary structure by its ID.
     *
     * @param req - Express request object with salary structure ID in params.
     * @param res - Express response object used to return salary structure.
     * @returns JSON response with success status and salary structure data.
     */
    getSalaryStructure: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const salaryStructure = await payrollConfigurationService.getSalaryStructure(
            companyId,
            id,
        );

        res.status(httpStatus.OK).json({
            success: true,
            message: "Salary structure fetched successfully",
            data: salaryStructure,
        });
    }),

    /**
     * Retrieves a paginated list of all salary structures for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated salary structures data.
     */
    getAllSalaryStructures: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { page, limit, skip, take } = getPaginationParams(req);

        const { salaryStructures, totalItems } =
            await payrollConfigurationService.getAllSalaryStructures(
                companyId,
                skip,
                take,
            );

        const response = formatPaginatedResponse(
            salaryStructures,
            totalItems,
            page,
            limit,
            "Salary structures fetched successfully",
        );
        res.status(httpStatus.OK).json(response);
    }),

    /**
     * Batch-saves an array of salary structure configurations.
     *
     * @param req - Express request object containing salary structures array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     * @throws {CustomError} If salary structures input is not an array.
     */
    saveSalaryStructureConfigurations: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const structures = Array.isArray(req.body) ? req.body : req.body.salaryStructures;

        if (!Array.isArray(structures)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Salary structures must be an array");
        }

        const result = await payrollConfigurationService.saveSalaryStructureBatch(companyId, structures);

        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "SalaryStructure",
            resourceId: companyId.toString(),
            newValue: result
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // DEDUCTION CONFIGURATION
    // =========================================================================

    /**
     * Creates a new deduction item within a salary structure.
     * Validates required fields such as salaryStructureId, deductionType, and label.
     *
     * @param req - Express request object with salaryStructureId in params and deduction details in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created deduction item data.
     * @throws {CustomError} If required fields are missing.
     */
    createDeductionConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const salaryStructureId = req.params.salaryStructureId;
            const {
                deductionType,
                label,
                isMandatory,
                isStatutory,
                calculationType,
                calculationBasis,
                amount,
                percent,
            } = req.body;

            if (!salaryStructureId || !deductionType || !label) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "salaryStructureId, deductionType, and label are required",
                );
            }

            const deductionItem =
                await payrollConfigurationService.createDeductionConfiguration(
                    salaryStructureId,
                    companyId,
                    deductionType,
                    label,
                    isMandatory,
                    isStatutory,
                    calculationType,
                    calculationBasis,
                    amount,
                    percent,
                );
            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Deduction item created successfully",
                data: deductionItem,
            });
        },
    ),
    /**
     * Creates a deduction item without requiring a salary structure association.
     *
     * @param req - Express request object containing deductionType, label, and optional calculation details in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created deduction item data.
     * @throws {CustomError} If deductionType or label is missing.
     */
    createDeductionConfigurationSimple: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const {
                deductionType,
                label,
                isMandatory,
                isStatutory,
                calculationType,
                calculationBasis,
                amount,
                percent,
            } = req.body;

            if (!deductionType || !label) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "deductionType and label are required",
                );
            }

            const deductionItem =
                await payrollConfigurationService.createDeductionConfigurationSimple(
                    companyId,
                    deductionType,
                    label,
                    isMandatory,
                    isStatutory,
                    calculationType,
                    calculationBasis,
                    amount,
                    percent,
                );
            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Deduction item created successfully",
                data: deductionItem,
            });
        },
    ),
    /**
     * Updates an existing deduction item's details.
     *
     * @param req - Express request object with deduction item ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated deduction item data.
     */
    updateDeductionConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const {
                deductionType,
                label,
                isMandatory,
                isStatutory,
                calculationType,
                calculationBasis,
                amount,
                percent,
            } = req.body;

            const deductionItem =
                await payrollConfigurationService.updateDeductionConfiguration(
                    companyId,
                    id,
                    deductionType,
                    label,
                    isMandatory,
                    isStatutory,
                    calculationType,
                    calculationBasis,
                    amount,
                    percent,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Deduction item updated successfully",
                data: deductionItem,
            });
        },
    ),
    /**
     * Deletes a deduction item by ID.
     *
     * @param req - Express request object with deduction item ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted deduction item data.
     */
    deleteDeductionConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const deductionItem =
                await payrollConfigurationService.deleteDeductionConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Deduction item deleted successfully",
                data: deductionItem,
            });
        },
    ),
    /**
     * Retrieves a single deduction item by its ID.
     *
     * @param req - Express request object with deduction item ID in params.
     * @param res - Express response object used to return deduction item.
     * @returns JSON response with success status and deduction item data.
     */
    getDeductionConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const deductionItem =
                await payrollConfigurationService.getDeductionConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Deduction item fetched successfully",
                data: deductionItem,
            });
        },
    ),
    /**
     * Retrieves a paginated list of deduction configurations, optionally filtered by salary structure.
     *
     * @param req - Express request object with optional salaryStructureId query parameter and pagination params.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated deduction items data.
     */
    getAllDeductionConfigurations: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const { salaryStructureId } = req.query;
            const { page, limit, skip, take } = getPaginationParams(req);

            const { deductionItems, totalItems } =
                await payrollConfigurationService.getAllDeductionConfigurations(
                    companyId,
                    skip,
                    take,
                    salaryStructureId as string,
                );
            const response = formatPaginatedResponse(
                deductionItems,
                totalItems,
                page,
                limit,
                "Deduction items fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Batch-saves deduction items for a specific salary structure.
     * Validates that each item has deductionType and label, and rejects items with existing IDs.
     *
     * @param req - Express request object with salaryStructureId in params and deductions array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved count.
     * @throws {CustomError} If salaryStructureId is missing, deductions array is empty, or items contain IDs.
     */
    saveDeductionConfigurations: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const salaryStructureId = req.params.salaryStructureId;
            if (!salaryStructureId) {
                throw new CustomError(httpStatus.BAD_REQUEST, "salaryStructureId is required in URL params");
            }

            const deductions = Array.isArray(req.body) ? req.body : req.body.deductions;
            if (!Array.isArray(deductions) || deductions.length === 0) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "deductions array is required",
                );
            }

            for (const d of deductions) {
                if (d.id) {
                    throw new CustomError(
                        httpStatus.BAD_REQUEST,
                        "id field is not allowed in batch save. Use the update endpoint instead.",
                    );
                }
                if (!d.deductionType || !d.label) {
                    throw new CustomError(
                        httpStatus.BAD_REQUEST,
                        "Each deduction item must have deductionType and label",
                    );
                }
            }

            const result =
                await payrollConfigurationService.saveDeductionConfigurations(
                    companyId,
                    salaryStructureId,
                    deductions,
                );

            res.status(httpStatus.OK).json({
                success: true,
                message: `${result.count} deduction items saved successfully`,
                data: result,
            });
        },
    ),

    /**
     * Batch-saves deduction items without requiring a salary structure.
     * Validates that each item has deductionType and label.
     *
     * @param req - Express request object containing deductions array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved count.
     * @throws {CustomError} If deductions array is empty or items are missing required fields.
     */
    saveDeductionConfigurationsSimple: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const deductions = Array.isArray(req.body) ? req.body : req.body.deductions;

            if (!Array.isArray(deductions) || deductions.length === 0) {
                throw new CustomError(
                    httpStatus.BAD_REQUEST,
                    "deductions array is required",
                );
            }

            for (const d of deductions) {
                if (!d.deductionType || !d.label) {
                    throw new CustomError(
                        httpStatus.BAD_REQUEST,
                        "Each deduction item must have deductionType and label",
                    );
                }
            }

            const result = await payrollConfigurationService.saveDeductionConfigurationsSimple(
                companyId,
                deductions,
            );

            res.status(httpStatus.OK).json({
                success: true,
                message: `${result.count} deduction items saved successfully`,
                data: result,
            });
        },
    ),

    // =========================================================================
    // PAYROLL PERIOD CONFIGURATION
    // =========================================================================

    /**
     * Previews payroll period fields (duration, work hours) based on start/end dates.
     * Useful for frontend real-time updates as user selects dates.
     */
    previewPayrollPeriodFields: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { startDate, endDate } = req.body;

            if (!startDate || !endDate) {
                throw new CustomError(httpStatus.BAD_REQUEST, "startDate and endDate are required for preview");
            }

            const result = await payrollConfigurationService.computePeriodFields(companyId, startDate, endDate);

            res.status(httpStatus.OK).json({
                success: true,
                data: result,
            });
        },
    ),

    /**
     * Creates a new payroll period with cycle, dates, and optional fiscal year association.
     *
     * @param req - Express request object containing name, cycle, startDate, endDate, dateOfPayment, and fiscalYearId in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created payroll period data.
     */
    createPayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { name, cycle, startDate, endDate, dateOfPayment, fiscalYearId } = req.body;

            const payrollPeriod =
                await payrollConfigurationService.createPayrollPeriodConfiguration(
                    companyId,
                    name || null,
                    cycle,
                    new Date(startDate),
                    new Date(endDate),
                    dateOfPayment ? new Date(dateOfPayment) : null,
                    fiscalYearId,
                );

            res.status(httpStatus.CREATED).json({
                success: true,
                message: "Payroll period created successfully",
                data: payrollPeriod,
            });
        },
    ),
    /**
     * Updates an existing payroll period's name, cycle, or date of payment.
     *
     * @param req - Express request object with payroll period ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated payroll period data.
     */
    updatePayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const { name, cycle, startDate, endDate, dateOfPayment } = req.body;
            const payrollPeriod =
                await payrollConfigurationService.updatePayrollPeriodConfiguration(
                    companyId,
                    id,
                    name,
                    cycle,
                    startDate ? new Date(startDate) : undefined,
                    endDate ? new Date(endDate) : undefined,
                    dateOfPayment ? new Date(dateOfPayment) : null
                );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period updated successfully",
                data: payrollPeriod,
            });
        },
    ),
    /**
     * Deletes a payroll period by its ID.
     *
     * @param req - Express request object with payroll period ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted payroll period data.
     */
    deletePayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const payrollPeriod =
                await payrollConfigurationService.deletePayrollPeriodConfiguration(
                    companyId,
                    id,
                );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period deleted successfully",
                data: payrollPeriod,
            });
        },
    ),
    /**
     * Retrieves a single payroll period by its ID.
     *
     * @param req - Express request object with payroll period ID in params.
     * @param res - Express response object used to return payroll period.
     * @returns JSON response with success status and payroll period data.
     */
    getPayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;
            const payrollPeriod =
                await payrollConfigurationService.getPayrollPeriodConfiguration(
                    companyId,
                    id,
                );
            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period fetched successfully",
                data: payrollPeriod,
            });
        },
    ),
    /**
     * Retrieves a paginated list of payroll periods, optionally filtered by status or cycle.
     *
     * @param req - Express request object with optional status and cycle query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated payroll periods data.
     */
    getAllPayrollPeriodsConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { status, cycle } = req.query;
            const { page, limit, skip, take } = getPaginationParams(req);
            const { payrollPeriods, totalItems } =
                await payrollConfigurationService.getAllPayrollPeriodsConfiguration(
                    companyId,
                    skip,
                    take,
                    status as any,
                    cycle as any
                );
            const response = formatPaginatedResponse(
                payrollPeriods,
                totalItems,
                page,
                limit,
                "Payroll periods fetched successfully",
            );
            res.status(httpStatus.OK).json(response);
        },
    ),
    /**
     * Creates or updates a payroll period configuration with validation of required fields.
     *
     * @param req - Express request object containing cycle, startDate, endDate, and optional fields in body.
     * @param res - Express response object used to return saved entity.
     * @returns JSON response with success status and saved payroll period data.
     * @throws {CustomError} If required fields (cycle, startDate, endDate) are missing.
     */
    savePayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const { name, cycle, startDate, endDate, dateOfPayment, fiscalYearId } = req.body;

            if (!cycle || !startDate || !endDate) {
                throw new CustomError(httpStatus.BAD_REQUEST, "Missing required fields (cycle, startDate, endDate)");
            }

            const payrollPeriod =
                await payrollConfigurationService.savePayrollPeriodConfiguration(
                    companyId,
                    name || null,
                    cycle,
                    new Date(startDate),
                    new Date(endDate),
                    dateOfPayment ? new Date(dateOfPayment) : null,
                    fiscalYearId,
                );

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period configuration saved",
                data: payrollPeriod,
            });
        },
    ),
    /**
     * Retrieves the currently active payroll period for the company.
     *
     * @param req - Express request object used to resolve company ID.
     * @param res - Express response object used to return current period.
     * @returns JSON response with success status and current payroll period data.
     */
    getCurrentPayrollPeriodConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);

            const payrollPeriod = await payrollConfigurationService.getCurrentPayrollPeriodConfiguration(companyId);

            res.status(httpStatus.OK).json({
                success: true,
                message: "Current payroll period fetched successfully",
                data: payrollPeriod,
            });
        },
    ),

    /**
     * Opens a payroll period, changing its status to active.
     *
     * @param req - Express request object with payroll period ID in params.
     * @param res - Express response object used to return updated period.
     * @returns JSON response with success status and opened payroll period data.
     * @throws {CustomError} If payroll period not found or cannot be opened.
     */
    openPayrollPeriod: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const period = await payrollConfigurationService.openPayrollPeriod(companyId, id);

            await writeAudit(req, {
                action: "OPEN",
                resource: "PayrollPeriod",
                resourceId: id,
                newValue: period
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period opened successfully",
                data: period,
            });
        },
    ),

    /**
     * Closes a payroll period, preventing further modifications.
     *
     * @param req - Express request object with payroll period ID in params.
     * @param res - Express response object used to return updated period.
     * @returns JSON response with success status and closed payroll period data.
     * @throws {CustomError} If payroll period not found or cannot be closed.
     */
    closePayrollPeriod: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const { id } = req.params;

            const period = await payrollConfigurationService.closePayrollPeriod(companyId, id);

            await writeAudit(req, {
                action: "CLOSE",
                resource: "PayrollPeriod",
                resourceId: id,
                newValue: period
            });

            res.status(httpStatus.OK).json({
                success: true,
                message: "Payroll period closed successfully",
                data: period,
            });
        },
    ),

    // =========================================================================
    // WORKDAYS CONFIGURATION
    // =========================================================================

    /**
     * Retrieves the company's workdays configuration including monthly workdays, weekly working days, and daily hours.
     *
     * @param req - Express request object used to resolve company ID.
     * @param res - Express response object used to return configuration.
     * @returns JSON response with success status and workdays configuration data.
     */
    getWorkdaysConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const result = await payrollConfigurationService.getWorkdaysConfiguration(companyId);
            res.status(httpStatus.OK).json({ success: true, data: result });
        }
    ),

    /**
     * Updates the company's workdays configuration by replacing all values.
     *
     * @param req - Express request object containing defaultMonthlyWorkdays, weeklyWorkingDays, and dailyWorkingHours in body.
     * @param res - Express response object used to return updated configuration.
     * @returns JSON response with success status and updated workdays configuration data.
     * @throws {CustomError} If any of the required fields are missing.
     */
    updateWorkdaysConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id;

            const { defaultMonthlyWorkdays, weeklyWorkingDays, dailyWorkingHours } = req.body;
            if (defaultMonthlyWorkdays == null || weeklyWorkingDays == null || dailyWorkingHours == null) {
                throw new CustomError(httpStatus.BAD_REQUEST, "defaultMonthlyWorkdays, weeklyWorkingDays, dailyWorkingHours are all required");
            }

            const result = await payrollConfigurationService.saveWorkdaysConfiguration(
                companyId,
                Number(defaultMonthlyWorkdays),
                Number(weeklyWorkingDays),
                Number(dailyWorkingHours),
                String(userId)
            );

            res.status(httpStatus.OK).json({ success: true, data: result });
        }
    ),

    /**
     * Partially updates the company's workdays configuration, only modifying provided fields.
     *
     * @param req - Express request object containing any subset of defaultMonthlyWorkdays, weeklyWorkingDays, or dailyWorkingHours in body.
     * @param res - Express response object used to return updated configuration.
     * @returns JSON response with success status and updated workdays configuration data.
     */
    patchWorkdaysConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id;

            const { defaultMonthlyWorkdays, weeklyWorkingDays, dailyWorkingHours } = req.body;
            const updates = {
                ...(defaultMonthlyWorkdays != null && { defaultMonthlyWorkdays: Number(defaultMonthlyWorkdays) }),
                ...(weeklyWorkingDays != null && { weeklyWorkingDays: Number(weeklyWorkingDays) }),
                ...(dailyWorkingHours != null && { dailyWorkingHours: Number(dailyWorkingHours) })
            };

            const result = await payrollConfigurationService.patchWorkdaysConfiguration(companyId, updates, String(userId));
            res.status(httpStatus.OK).json({ success: true, data: result });
        }
    ),

    /**
     * Saves (creates or replaces) the company's workdays configuration.
     * All three fields are required: defaultMonthlyWorkdays, weeklyWorkingDays, and dailyWorkingHours.
     *
     * @param req - Express request object containing all three workdays fields in body.
     * @param res - Express response object used to return saved configuration.
     * @returns JSON response with success status and saved workdays configuration data.
     * @throws {CustomError} If any of the required fields are missing.
     */
    saveWorkdaysConfiguration: asyncHandler(
        async (req: Request, res: Response) => {
            const companyId = resolveCompanyId(req as any);
            const userId = req.user?.id;

            const { defaultMonthlyWorkdays, weeklyWorkingDays, dailyWorkingHours } = req.body;
            if (defaultMonthlyWorkdays == null || weeklyWorkingDays == null || dailyWorkingHours == null) {
                throw new CustomError(httpStatus.BAD_REQUEST, "All three fields are required");
            }

            const result = await payrollConfigurationService.saveWorkdaysConfiguration(
                companyId,
                Number(defaultMonthlyWorkdays),
                Number(weeklyWorkingDays),
                Number(dailyWorkingHours),
                String(userId)
            );

            await writeAudit(req, {
                action: "SAVE",
                resource: "WorkdaysConfiguration",
                resourceId: companyId.toString(),
                newValue: result
            });

            res.status(httpStatus.OK).json({ success: true, data: result });
        }
    ),

    // =========================================================================
    // ENUM LOOKUP ENDPOINTS
    // =========================================================================

    /**
     * Retrieves all available deduction types as labeled enum values.
     *
     * @param _req - Express request object (unused).
     * @param res - Express response object used to return deduction types.
     * @returns JSON response with success status and array of deduction type labels.
     */
    getDeductionTypes: asyncHandler(
        async (_req: Request, res: Response) => {
            const values = Object.values($Enums.DeductionType);
            const types = values.map((value) => ({
                value,
                label: value
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            }));
            res.status(httpStatus.OK).json({ success: true, data: types });
        }
    ),

    /**
     * Retrieves all available earning types as labeled enum values.
     *
     * @param _req - Express request object (unused).
     * @param res - Express response object used to return earning types.
     * @returns JSON response with success status and array of earning type labels.
     */
    getEarningTypes: asyncHandler(
        async (_req: Request, res: Response) => {
            const values = Object.values($Enums.EarningType);
            const types = values.map((value) => ({
                value,
                label: value
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            }));
            res.status(httpStatus.OK).json({ success: true, data: types });
        }
    ),

    // =========================================================================
    // PAYROLL BATCH (Auto-generation)
    // =========================================================================

    /**
     * Auto-generates employee batches for a given payroll period.
     *
     * @param req - Express request object with payrollPeriodId and optional batchSize in body.
     * @param res - Express response object used to return generated batches.
     * @returns JSON response with success status and generated batch data.
     */
    generateBatches: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { payrollPeriodId, batchSize } = req.body;

        const result = await payrollConfigurationService.generateBatches(
            companyId, payrollPeriodId, batchSize ?? 50
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "PayrollBatch",
            resourceId: `${payrollPeriodId}~generate`,
            newValue: { batchCount: result.batchCount, totalEmployees: result.totalEmployees }
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: `Generated ${result.batchCount} batches for ${result.totalEmployees} employees`,
            data: result,
        });
    }),

    /**
     * Lists all batches for a payroll period with pagination.
     *
     * @param req - Express request object with payrollPeriodId, page, and limit in query.
     * @param res - Express response object used to return paginated batch list.
     * @returns JSON response with paginated batch data.
     */
    listBatchesByPeriod: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { payrollPeriodId, page, limit } = req.query as any;

        const result = await payrollConfigurationService.listBatchesByPeriod(
            companyId, payrollPeriodId, Number(page) || 1, Number(limit) || 50
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: result,
        });
    }),

    /**
     * Lists all employees in a batch with pagination and optional search.
     *
     * @param req - Express request object with batchId, page, limit, and search in query.
     * @param res - Express response object used to return paginated employee list.
     * @returns JSON response with paginated employee data.
     */
    listBatchEmployees: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { batchId, page, limit, search } = req.query as any;

        const result = await payrollConfigurationService.listBatchEmployees(
            companyId, batchId, Number(page) || 1, Number(limit) || 20, search
        );

        res.status(httpStatus.OK).json({
            success: true,
            data: result,
        });
    }),

    removeBatchEmployee: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        await payrollConfigurationService.removeBatchEmployee(companyId, id);

        await writeAudit(req, {
            action: "DELETE",
            resource: "PayrollBatchEmployee",
            resourceId: id,
            newValue: null,
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Employee removed from batch successfully",
        });
    }),

    moveBatchEmployee: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const { targetBatchId } = req.body;

        if (!targetBatchId || typeof targetBatchId !== "string") {
            throw new CustomError(httpStatus.BAD_REQUEST, "targetBatchId is required");
        }

        const updated = await payrollConfigurationService.moveBatchEmployee(companyId, id, targetBatchId);

        await writeAudit(req, {
            action: "UPDATE",
            resource: "PayrollBatchEmployee",
            resourceId: id,
            newValue: updated,
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Employee moved to target batch successfully",
            data: updated,
        });
    }),

    // =========================================================================
    // PAYROLL BATCH - Name Update
    // =========================================================================

    updateBatchName: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const { name } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            throw new CustomError(httpStatus.BAD_REQUEST, "name is required");
        }

        const batch = await payrollConfigurationService.updateBatchName(companyId, id, name.trim());

        await writeAudit(req, {
            action: "UPDATE",
            resource: "PayrollBatch",
            resourceId: id,
            newValue: batch
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Batch name updated successfully",
            data: batch,
        });
    }),

    // =========================================================================
    // PAYROLL BATCH - Status Transitions
    // =========================================================================

    activateBatch: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const batch = await payrollConfigurationService.activateBatch(companyId, id);

        await writeAudit(req, {
            action: "ACTIVATE",
            resource: "PayrollBatch",
            resourceId: id,
            newValue: batch
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Batch activated successfully",
            data: batch,
        });
    }),

    closeBatch: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const batch = await payrollConfigurationService.closeBatch(companyId, id);

        await writeAudit(req, {
            action: "CLOSE",
            resource: "PayrollBatch",
            resourceId: id,
            newValue: batch
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Batch closed successfully",
            data: batch,
        });
    }),

    archiveBatch: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const batch = await payrollConfigurationService.archiveBatch(companyId, id);

        await writeAudit(req, {
            action: "ARCHIVE",
            resource: "PayrollBatch",
            resourceId: id,
            newValue: batch
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Batch archived successfully",
            data: batch,
        });
    }),

    // =========================================================================
    // PAYSLIP NOTIFICATION SETTINGS
    // =========================================================================

    /**
     * Retrieves the payslip notification settings for the company (singleton).
     *
     * @param req - Express request object.
     * @param res - Express response object used to return settings data.
     * @returns JSON response with success status and payslip notification settings data.
     */
    getPayslipNotificationSettings: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);

        const settings = await payrollConfigurationService.getPayslipNotificationSettings(companyId);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payslip notification settings fetched successfully",
            data: settings,
        });
    }),

    /**
     * Saves (upserts) the payslip notification settings for the company.
     *
     * @param req - Express request object containing notification settings in body.
     * @param res - Express response object used to return saved settings.
     * @returns JSON response with success status and saved settings data.
     */
    savePayslipNotificationSettings: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { emailNotifications, smsNotifications, digestFrequency } = req.body;

        const settings = await payrollConfigurationService.savePayslipNotificationSettings(
            companyId, { emailNotifications, smsNotifications, digestFrequency }
        );

        await writeAudit(req, {
            action: "SAVE",
            resource: "PayslipNotificationSettings",
            resourceId: companyId.toString(),
            newValue: settings
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Payslip notification settings saved successfully",
            data: settings,
        });
    }),

    // =========================================================================
    // SYSTEM CURRENCY
    // =========================================================================

    /**
     * Retrieves all system currencies for the company.
     *
     * @param req - Express request object.
     * @param res - Express response object used to return currencies list.
     * @returns JSON response with currencies array.
     */
    getAllCurrencies: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const currencies = await payrollConfigurationService.getAllCurrencies(companyId);
        res.status(httpStatus.OK).json({
            success: true,
            message: "Currencies fetched successfully",
            data: currencies,
        });
    }),

    /**
     * Retrieves a single system currency by ID.
     *
     * @param req - Express request object with currency ID in params.
     * @param res - Express response object used to return currency data.
     * @returns JSON response with currency data.
     */
    getCurrency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const currency = await payrollConfigurationService.getCurrency(companyId, id);
        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency fetched successfully",
            data: currency,
        });
    }),

    /**
     * Creates a new system currency.
     *
     * @param req - Express request object containing currency data in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with created currency data.
     */
    createCurrency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const currency = await payrollConfigurationService.createCurrency(companyId, req.body);

        await writeAudit(req, {
            action: "CREATE",
            resource: "SystemCurrency",
            resourceId: currency.id,
            newValue: currency,
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: "Currency created successfully",
            data: currency,
        });
    }),

    /**
     * Updates an existing system currency.
     *
     * @param req - Express request object with currency ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with updated currency data.
     */
    updateCurrency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const currency = await payrollConfigurationService.updateCurrency(companyId, id, req.body);

        await writeAudit(req, {
            action: "UPDATE",
            resource: "SystemCurrency",
            resourceId: id,
            newValue: currency,
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency updated successfully",
            data: currency,
        });
    }),

    /**
     * Deletes a system currency by ID.
     *
     * @param req - Express request object with currency ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with deleted currency data.
     */
    deleteCurrency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const currency = await payrollConfigurationService.deleteCurrency(companyId, id);

        await writeAudit(req, {
            action: "DELETE",
            resource: "SystemCurrency",
            resourceId: id,
            newValue: { isDeleted: true },
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency deleted successfully",
            data: currency,
        });
    }),

    /**
     * Sets a system currency as the base currency for the company.
     *
     * @param req - Express request object with currency ID in params.
     * @param res - Express response object used to return updated currency.
     * @returns JSON response with updated base currency data.
     */
    setBaseCurrency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;
        const currency = await payrollConfigurationService.setBaseCurrency(companyId, id);

        await writeAudit(req, {
            action: "UPDATE",
            resource: "SystemCurrency",
            resourceId: id,
            newValue: { isBase: true },
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Base currency set successfully",
            data: currency,
        });
    }),

    // =========================================================================
    // CURRENCY RATE
    // =========================================================================

    /**
     * Creates a new currency exchange rate.
     *
     * @param req - Express request object containing currency rate data in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created currency rate data.
     */
    createCurrencyRate: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);

        const currencyRate = await payrollConfigurationService.createCurrencyRate(
            companyId, req.body
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "CurrencyRate",
            resourceId: currencyRate.id,
            newValue: currencyRate
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: "Currency rate created successfully",
            data: currencyRate,
        });
    }),

    /**
     * Updates an existing currency exchange rate.
     *
     * @param req - Express request object with currency rate ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated currency rate data.
     */
    updateCurrencyRate: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const currencyRate = await payrollConfigurationService.updateCurrencyRate(
            companyId, id, req.body
        );

        await writeAudit(req, {
            action: "UPDATE",
            resource: "CurrencyRate",
            resourceId: id,
            newValue: currencyRate
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency rate updated successfully",
            data: currencyRate,
        });
    }),

    /**
     * Deletes a currency exchange rate by ID.
     *
     * @param req - Express request object with currency rate ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted payload.
     */
    deleteCurrencyRate: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const currencyRate = await payrollConfigurationService.deleteCurrencyRate(companyId, id);

        await writeAudit(req, {
            action: "DELETE",
            resource: "CurrencyRate",
            resourceId: id,
            newValue: { isDeleted: true }
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency rate deleted successfully",
            data: currencyRate,
        });
    }),

    /**
     * Retrieves a single currency exchange rate by ID.
     *
     * @param req - Express request object with currency rate ID in params.
     * @param res - Express response object used to return rate data.
     * @returns JSON response with success status and currency rate data.
     */
    getCurrencyRate: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const rate = await payrollConfigurationService.getCurrencyRate(companyId, id);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Currency rate fetched successfully",
            data: rate,
        });
    }),

    /**
     * Retrieves a paginated list of all currency rates.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated currency rates data.
     */
    getAllCurrencyRates: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { page, limit, skip, take } = getPaginationParams(req);

        const { rates, totalItems } = await payrollConfigurationService.getAllCurrencyRates(companyId, skip, take);

        res.status(httpStatus.OK).json({
            ...formatPaginatedResponse(rates, totalItems, page, limit)
        });
    }),

    /**
     * Batch-saves an array of currency rate configurations.
     *
     * @param req - Express request object containing currencyRates array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     */
    saveCurrencyRates: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const rates = req.body.currencyRates ?? req.body;

        if (!Array.isArray(rates)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "currencyRates must be an array");
        }

        const result = await payrollConfigurationService.saveCurrencyRates(companyId, rates);

        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "CurrencyRate",
            resourceId: companyId.toString(),
            newValue: result
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // PAY FREQUENCY
    // =========================================================================

    /**
     * Creates a new pay frequency configuration.
     *
     * @param req - Express request object containing pay frequency data in body.
     * @param res - Express response object used to return created entity.
     * @returns JSON response with success status and created pay frequency data.
     */
    createPayFrequency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);

        const payFreq = await payrollConfigurationService.createPayFrequency(
            companyId, req.body
        );

        await writeAudit(req, {
            action: "CREATE",
            resource: "PayFrequency",
            resourceId: payFreq.id,
            newValue: payFreq
        });

        res.status(httpStatus.CREATED).json({
            success: true,
            message: "Pay frequency created successfully",
            data: payFreq,
        });
    }),

    /**
     * Updates an existing pay frequency configuration.
     *
     * @param req - Express request object with pay frequency ID in params and updated fields in body.
     * @param res - Express response object used to return updated entity.
     * @returns JSON response with success status and updated pay frequency data.
     */
    updatePayFrequency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const payFreq = await payrollConfigurationService.updatePayFrequency(
            companyId, id, req.body
        );

        await writeAudit(req, {
            action: "UPDATE",
            resource: "PayFrequency",
            resourceId: id,
            newValue: payFreq
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Pay frequency updated successfully",
            data: payFreq,
        });
    }),

    /**
     * Deletes a pay frequency configuration by ID.
     *
     * @param req - Express request object with pay frequency ID in params.
     * @param res - Express response object used to confirm deletion.
     * @returns JSON response with success status and deleted payload.
     */
    deletePayFrequency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const payFreq = await payrollConfigurationService.deletePayFrequency(companyId, id);

        await writeAudit(req, {
            action: "DELETE",
            resource: "PayFrequency",
            resourceId: id,
            newValue: { isDeleted: true }
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Pay frequency deleted successfully",
            data: payFreq,
        });
    }),

    /**
     * Retrieves a single pay frequency configuration by ID.
     *
     * @param req - Express request object with pay frequency ID in params.
     * @param res - Express response object used to return entity data.
     * @returns JSON response with success status and pay frequency data.
     */
    getPayFrequency: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { id } = req.params;

        const freq = await payrollConfigurationService.getPayFrequency(companyId, id);

        res.status(httpStatus.OK).json({
            success: true,
            message: "Pay frequency fetched successfully",
            data: freq,
        });
    }),

    /**
     * Retrieves a paginated list of all pay frequencies for the company.
     *
     * @param req - Express request object with pagination query parameters.
     * @param res - Express response object used to return paginated list.
     * @returns JSON response with paginated pay frequencies data.
     */
    getAllPayFrequencies: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { page, limit, skip, take } = getPaginationParams(req);

        const { frequencies, totalItems } = await payrollConfigurationService.getAllPayFrequencies(companyId, skip, take);

        res.status(httpStatus.OK).json({
            ...formatPaginatedResponse(frequencies, totalItems, page, limit)
        });
    }),

    /**
     * Batch-saves an array of pay frequency configurations.
     *
     * @param req - Express request object containing payFrequencies array in body.
     * @param res - Express response object used to return save result.
     * @returns JSON response with success status and saved data.
     */
    savePayFrequencies: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const frequencies = req.body.payFrequencies ?? req.body;

        if (!Array.isArray(frequencies)) {
            throw new CustomError(httpStatus.BAD_REQUEST, "payFrequencies must be an array");
        }

        const result = await payrollConfigurationService.savePayFrequencies(companyId, frequencies);

        await writeAudit(req, {
            action: "SAVE_BATCH",
            resource: "PayFrequency",
            resourceId: companyId.toString(),
            newValue: result
        });

        res.status(httpStatus.OK).json({ success: true, data: result });
    }),

    // =========================================================================
    // DEDUCTION CAP
    // =========================================================================

    /**
     * GET /configuration/deduction-cap — Retrieves the company-wide deduction cap percentage.
     */
    getDeductionCap: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const config = await prisma.configuration.findUnique({
            where: { companyId_key: { companyId, key: 'DEDUCTION_CAP_PERCENTAGE' } },
        });
        const capPercentage = config ? parseFloat(config.value) : 33.33;
        res.status(httpStatus.OK).json({ success: true, data: { capPercentage } });
    }),

    /**
     * PUT /configuration/deduction-cap — Updates the company-wide deduction cap percentage.
     */
    updateDeductionCap: asyncHandler(async (req: Request, res: Response) => {
        const companyId = resolveCompanyId(req as any);
        const { value } = req.body;

        if (value == null || typeof value !== 'number' || value < 0 || value > 100) {
            throw new CustomError(httpStatus.BAD_REQUEST, "value must be a number between 0 and 100");
        }

        await prisma.configuration.upsert({
            where: { companyId_key: { companyId, key: 'DEDUCTION_CAP_PERCENTAGE' } },
            update: { value: value.toString() },
            create: { companyId, key: 'DEDUCTION_CAP_PERCENTAGE', value: value.toString() },
        });

        await writeAudit(req, {
            action: "UPDATE",
            resource: "Configuration",
            resourceId: `DEDUCTION_CAP_PERCENTAGE`,
            newValue: { value },
        });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Deduction cap updated successfully",
            data: { capPercentage: value },
        });
    }),

    // =========================================================================
    // END OF CONFIGURATION
    // =========================================================================
};
