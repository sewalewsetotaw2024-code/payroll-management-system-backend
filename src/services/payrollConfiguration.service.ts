import prisma from "../config/database";
import CustomError from "../utils/customError"
import httpStatus from "http-status"
import { Prisma } from "../generated/prisma"
import { $Enums } from "../generated/prisma"

type PensionBasis = $Enums.PensionBasis
type PayrollCycle = $Enums.PayrollCycle
type OvertimeCategory = $Enums.OvertimeCategory
const PayrollStatusConst = $Enums.PayrollStatus
const FiscalStatusConst = $Enums.FiscalStatus
const PayrollPeriodStatusConst = $Enums.PayrollPeriodStatus

type PayrollStatus = $Enums.PayrollStatus
type FiscalStatus = $Enums.FiscalStatus
type PayrollPeriodStatus = $Enums.PayrollPeriodStatus

type Decimal = Prisma.Decimal;

/**
 * Service for managing payroll configuration entities including fiscal years, tax brackets,
 * pension rules, overtime rules, allowances, salary structures, payroll periods, workday settings,
 * and deduction configurations. Provides full CRUD, batch operations, and state transition validation.
 */
export class PayrollConfigurationService {

    /**
     * Converts a value to a Date object, returning null for null/undefined inputs.
     *
     * @param value - A string, Date, null, or undefined value to convert.
     * @returns A Date object, or null if the input was null or undefined.
     */
    private toDate(value: string | Date | null | undefined): Date | null {
        if (value == null || value === '') return null;
        const d = typeof value === 'string' ? new Date(value) : value;
        if (isNaN(d.getTime())) return null;
        return d;
    }

    // =========================================================================
    // STATE GUARDS
    // =========================================================================

    /**
     * Validates whether a fiscal year can transition to the given status.
     * Only DRAFT fiscal years can be activated. Only ACTIVE or DRAFT fiscal years can be closed.
     *
     * @param transition - The target transition: "activate" or "close".
     * @param currentStatus - The current status of the fiscal year.
     * @param companyId - The numeric ID of the company (used for context in error messages).
     * @throws {CustomError} If the transition is not allowed based on the current status.
     */
    private assertFiscalYearTransition(transition: 'activate' | 'close', currentStatus: FiscalStatus, companyId: number) {
        if (transition === 'activate') {
            if (currentStatus !== FiscalStatusConst.DRAFT) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot activate a fiscal year with status "${currentStatus}". Only DRAFT can be activated.`
                );
            }
        }
        if (transition === 'close') {
            if (currentStatus !== FiscalStatusConst.ACTIVE && currentStatus !== FiscalStatusConst.DRAFT) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot close a fiscal year with status "${currentStatus}". Only ACTIVE or DRAFT can be closed.`
                );
            }
        }
    }

    private assertPayrollPeriodTransition(transition: 'open' | 'close', currentStatus: PayrollPeriodStatus) {
        if (transition === 'open') {
            if (currentStatus !== PayrollPeriodStatusConst.DRAFT) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot open a payroll period with status "${currentStatus}". Only DRAFT can be opened.`
                );
            }
        }
        if (transition === 'close') {
            if (currentStatus !== PayrollPeriodStatusConst.ACTIVE) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot close a payroll period with status "${currentStatus}". Only OPEN can be closed.`
                );
            }
        }
    }

    private assertBatchTransition(transition: 'activate' | 'close' | 'archive', currentStatus: string) {
        const validTransitions: Record<string, string[]> = {
            activate: ['DRAFT'],
            close: ['ACTIVE'],
            archive: ['CLOSED'],
        };
        const allowed = validTransitions[transition] || [];
        if (!allowed.includes(currentStatus)) {
            throw new CustomError(httpStatus.CONFLICT,
                `Cannot ${transition} a batch with status "${currentStatus}". Allowed: ${allowed.join(', ')}.`
            );
        }
    }

    // ── Overlap assertion helpers ─────────────────────────────────────

    /**
     * Checks that the given date range does not overlap with any existing non-CLOSED fiscal year.
     *
     * @param companyId - The numeric ID of the company.
     * @param startDate - The start date to check.
     * @param endDate - The end date to check.
     * @param exclude - Optional exclusion criteria (id or name to exclude from the check).
     * @throws {CustomError} If an overlapping fiscal year is found.
     */
    private async assertNoFiscalYearOverlap(
        companyId: number,
        startDate: Date,
        endDate: Date,
        exclude?: { id?: string; name?: string },
    ): Promise<void> {
        const where: any = {
            companyId,
            isActive: true,
            status: { not: FiscalStatusConst.CLOSED as any },
            OR: [
                { startDate: { lte: endDate }, endDate: { gte: startDate } },
            ],
        };
        if (exclude?.id) where.id = { not: exclude.id };
        if (exclude?.name) where.name = { not: exclude.name };

        const overlapping = await prisma.fiscalYear.findFirst({ where });
        if (overlapping) {
            throw new CustomError(httpStatus.CONFLICT,
                `Fiscal year dates overlap with "${overlapping.name}" (${overlapping.startDate.toISOString().slice(0, 10)} — ${overlapping.endDate.toISOString().slice(0, 10)}). Please adjust the date range.`
            );
        }
    }

    /**
     * Checks that the given date range does not overlap with any existing non-DONE payroll period
     * in the specified fiscal year.
     *
     * @param companyId - The numeric ID of the company.
     * @param fiscalYearId - The fiscal year ID to scope the check to.
     * @param startDate - The start date to check.
     * @param endDate - The end date to check.
     * @param exclude - Optional exclusion criteria (id or compoundKey for upsert scenario).
     * @throws {CustomError} If an overlapping payroll period is found.
     */
    private async assertNoPayrollPeriodOverlap(
        companyId: number,
        fiscalYearId: string,
        startDate: Date,
        endDate: Date,
        exclude?: { id?: string; compoundKey?: { startDate: Date; endDate: Date; cycle: string } },
    ): Promise<void> {
        const where: any = {
            companyId,
            fiscalYearId,
            status: { notIn: [PayrollPeriodStatusConst.DONE] as any },
            OR: [
                { startDate: { lte: endDate }, endDate: { gte: startDate } },
            ],
        };
        if (exclude?.id) where.id = { not: exclude.id };
        if (exclude?.compoundKey) {
            where.NOT = {
                AND: [
                    { startDate: exclude.compoundKey.startDate },
                    { endDate: exclude.compoundKey.endDate },
                    { cycle: exclude.compoundKey.cycle },
                ],
            };
        }

        const overlapping = await prisma.payrollPeriod.findFirst({ where });
        if (overlapping) {
            const overlapInfo = `${overlapping.name || 'Unnamed'} (${overlapping.startDate.toISOString().slice(0, 10)} — ${overlapping.endDate.toISOString().slice(0, 10)})`;
            throw new CustomError(httpStatus.CONFLICT, `Period dates overlap with an existing period: ${overlapInfo}`);
        }
    }

    // =========================================================================
    // FISCAL YEAR
    // =========================================================================

    /**
     * Creates a new fiscal year configuration for a company. If the status is ACTIVE,
     * all other active fiscal years for the company are automatically closed.
     *
     * @param companyId - The numeric ID of the company.
     * @param name - The display name for the fiscal year.
     * @param startDate - The start date of the fiscal year.
     * @param endDate - The end date of the fiscal year.
     * @param status - Optional status override; defaults to ACTIVE.
     * @returns The newly created fiscal year record.
     */
    async createFiscalYearConfiguration(companyId: number, name: string, startDate: Date, endDate: Date, status?: FiscalStatus) {
        const newStatus = status ?? FiscalStatusConst.ACTIVE;
        const parsedStart = this.toDate(startDate)!;
        const parsedEnd = this.toDate(endDate)!;

        if (newStatus === FiscalStatusConst.ACTIVE) {
            const activeFiscalYear = await prisma.fiscalYear.findFirst({
                where: { companyId, status: FiscalStatusConst.ACTIVE, isActive: true },
            });
            if (activeFiscalYear) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot create a new active fiscal year while "${activeFiscalYear.name}" is still active. Please close it first.`
                );
            }
        }

        // Check for overlapping date ranges with existing non-CLOSED fiscal years
        await this.assertNoFiscalYearOverlap(companyId, parsedStart, parsedEnd);

        const fiscalYear = await prisma.fiscalYear.create({
            data: {
                companyId,
                name,
                startDate: parsedStart,
                endDate: parsedEnd,
                status: newStatus as any,
            }
        });
        return fiscalYear;
    }

    /**
     * Updates an existing fiscal year configuration. Automatically closes other active fiscal years
     * if the status is set to ACTIVE. Adjusts overlapping payroll period dates when the fiscal year
     * range is narrowed.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the fiscal year to update.
     * @param name - The new display name.
     * @param startDate - The new start date.
     * @param endDate - The new end date.
     * @param status - Optional new status.
     * @returns The updated fiscal year record.
     * @throws {CustomError} If the fiscal year is not found or unauthorized.
     */
    async updateFiscalYearConfiguration(companyId: number, id: string, name: string, startDate: Date, endDate: Date, status?: FiscalStatus) {
        const existing = await prisma.fiscalYear.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found or unauthorized");
        }
        const parsedStart = this.toDate(startDate)!;
        const parsedEnd = this.toDate(endDate)!;

        if (status === FiscalStatusConst.ACTIVE) {
            const activeFiscalYear = await prisma.fiscalYear.findFirst({
                where: { companyId, id: { not: id }, status: FiscalStatusConst.ACTIVE, isActive: true },
            });
            if (activeFiscalYear) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Cannot set status to ACTIVE while "${activeFiscalYear.name}" is still active. Please close it first.`
                );
            }
        }

        // Check for overlapping date ranges with other non-CLOSED fiscal years
        if (parsedStart && parsedEnd && (parsedStart.getTime() !== existing.startDate.getTime() || parsedEnd.getTime() !== existing.endDate.getTime())) {
            await this.assertNoFiscalYearOverlap(companyId, parsedStart, parsedEnd, { id });
        }

        const fiscalYear = await prisma.fiscalYear.update({
            where: { id },
            data: {
                name,
                startDate: parsedStart,
                endDate: parsedEnd,
                ...(status !== undefined && { status: status as any }),
            }
        });


        const activeStatuses = [PayrollPeriodStatusConst.DRAFT, PayrollPeriodStatusConst.ACTIVE];
        const updates: any[] = [];
        if (parsedStart > existing.startDate) {
            updates.push(
                prisma.payrollPeriod.updateMany({
                    where: { fiscalYearId: id, startDate: { lt: parsedStart }, status: { in: activeStatuses as any } },
                    data: { startDate: parsedStart },
                })
            );
        }
        if (parsedEnd < existing.endDate) {
            updates.push(
                prisma.payrollPeriod.updateMany({
                    where: { fiscalYearId: id, endDate: { gt: parsedEnd }, status: { in: activeStatuses as any } },
                    data: { endDate: parsedEnd },
                })
            );
        }
        if (updates.length) {
            await Promise.all(updates);
        }

        return fiscalYear;
    }

    /**
     * Deletes a fiscal year configuration. Only DRAFT fiscal years can be deleted.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the fiscal year to delete.
     * @returns An object indicating successful deletion.
     * @throws {CustomError} If the fiscal year is not found, unauthorized, or not in DRAFT status.
     */
    async deleteFiscalYearConfiguration(companyId: number, id: string) {
        const existing = await prisma.fiscalYear.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found or unauthorized");
        }
        if (existing.status !== FiscalStatusConst.DRAFT) {
            throw new CustomError(httpStatus.CONFLICT,
                `Only DRAFT fiscal years can be deleted. Current status: ${existing.status}`
            );
        }
        await prisma.fiscalYear.delete({ where: { id } });
        return { deleted: true };
    }

    /**
     * Activates a fiscal year, automatically closing any other currently active fiscal year.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the fiscal year to activate.
     * @returns The updated fiscal year record with ACTIVE status.
     * @throws {CustomError} If the fiscal year is not found or cannot be activated from its current status.
     */
    async activateFiscalYear(companyId: number, id: string) {
        const existing = await prisma.fiscalYear.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found or unauthorized");
        }
        this.assertFiscalYearTransition('activate', existing.status as FiscalStatus, companyId);

        // Check if there is already an active fiscal year
        const activeFiscalYear = await prisma.fiscalYear.findFirst({
            where: { companyId, id: { not: id }, status: FiscalStatusConst.ACTIVE },
        });
        if (activeFiscalYear) {
            throw new CustomError(httpStatus.CONFLICT,
                `Cannot activate fiscal year "${existing.name}" while "${activeFiscalYear.name}" is still active. Please close the active fiscal year first.`
            );
        }

        const fiscalYear = await prisma.fiscalYear.update({
            where: { id },
            data: { status: FiscalStatusConst.ACTIVE as any },
        });
        return fiscalYear;
    }

    /**
     * Closes a fiscal year, also closing any open payroll periods under it.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the fiscal year to close.
     * @returns The updated fiscal year record with CLOSED status.
     * @throws {CustomError} If the fiscal year is not found or cannot be closed from its current status.
     */
    async closeFiscalYear(companyId: number, id: string) {
        const existing = await prisma.fiscalYear.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found or unauthorized");
        }
        this.assertFiscalYearTransition('close', existing.status as FiscalStatus, companyId);

        await prisma.payrollPeriod.updateMany({
            where: { fiscalYearId: id, status: PayrollPeriodStatusConst.ACTIVE as any },
            data: { status: PayrollPeriodStatusConst.DONE as any },
        });

        const fiscalYear = await prisma.fiscalYear.update({
            where: { id },
            data: { status: FiscalStatusConst.CLOSED as any },
        });
        return fiscalYear;
    }

    /**
     * Retrieves a single fiscal year configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the fiscal year.
     * @returns The fiscal year record.
     * @throws {CustomError} If the fiscal year is not found or unauthorized.
     */
    async getFiscalYearConfiguration(companyId: number, id: string) {
        const existing = await prisma.fiscalYear.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of all fiscal years for a company, ordered by start date ascending.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the fiscalYears array and total count.
     */
    async getAllFiscalYearsConfiguration(companyId: number, skip: number, take: number) {
        const [fiscalYears, totalItems] = await Promise.all([
            prisma.fiscalYear.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { startDate: "asc" }
            }),
            prisma.fiscalYear.count({ where: { companyId, isActive: true } })
        ]);

        return { fiscalYears, totalItems };
    }

    /**
     * Batch creates or updates fiscal year configurations within a transaction.
     * Existing fiscal years are matched by company ID and name.
     *
     * @param companyId - The numeric ID of the company.
     * @param fiscalYears - An array of objects containing name, startDate, and endDate for each fiscal year.
     * @returns An array of created or updated fiscal year records.
     */
    async saveFiscalYearBatch(companyId: number, fiscalYears: { name: string; startDate: Date; endDate: Date }[]) {
        // Parse and validate dates, checking for overlaps with existing non-CLOSED fiscal years
        const parsed = fiscalYears.map(fy => ({
            ...fy,
            parsedStart: this.toDate(fy.startDate)!,
            parsedEnd: this.toDate(fy.endDate)!,
        }));

        for (const fy of parsed) {
            // Check overlap with existing non-CLOSED fiscal years (excluding self by name for upsert)
            await this.assertNoFiscalYearOverlap(companyId, fy.parsedStart, fy.parsedEnd, { name: fy.name });

            // Check overlap with other batch entries
            const batchOverlap = parsed.find(other =>
                other.name !== fy.name &&
                fy.parsedStart <= other.parsedEnd &&
                fy.parsedEnd >= other.parsedStart
            );
            if (batchOverlap) {
                throw new CustomError(httpStatus.CONFLICT,
                    `Fiscal years "${fy.name}" and "${batchOverlap.name}" have overlapping date ranges in the same batch. Please adjust the dates.`
                );
            }
        }

        const results = await prisma.$transaction(async (tx) => {
            return Promise.all(fiscalYears.map(async fy => {
                const startDate = this.toDate(fy.startDate)!;
                const endDate = this.toDate(fy.endDate)!;
                const existing = await tx.fiscalYear.findFirst({
                    where: { companyId, name: fy.name, isActive: true }
                });
                if (existing) {
                    return tx.fiscalYear.update({
                        where: { id: existing.id },
                        data: { startDate, endDate }
                    });
                } else {
                    return tx.fiscalYear.create({
                        data: { companyId, name: fy.name, startDate, endDate }
                    });
                }
            }));
        });
        return results;
    }

    // =========================================================================
    // TAX CONFIGURATION
    // =========================================================================

    /**
     * Creates a new tax bracket configuration for a company.
     * Automatically converts percentage rates (greater than 1) to decimal.
     *
     * @param companyId - The numeric ID of the company.
     * @param lowerBound - The lower income boundary for this bracket.
     * @param upperBound - The upper income boundary, or null for the highest bracket.
     * @param rate - The tax rate (if > 1, divided by 100 to convert to decimal).
     * @param deductionAmount - The cumulative deduction amount for this bracket.
     * @param effectiveDate - The date this tax bracket becomes effective.
     * @param expiryDate - The date this tax bracket expires.
     * @returns The newly created tax bracket record.
     */
    async createTaxBracketConfiguration(companyId: number, lowerBound: number, upperBound: number | null, rate: number, deductionAmount: number, effectiveDate: Date, expiryDate: Date) {
        const taxBracket = await prisma.taxBracket.create({
            data: {
                companyId,
                lowerBound,
                upperBound: upperBound !== undefined ? upperBound : null,
                rate: rate > 1 ? rate / 100 : rate,
                deductionAmount,
                effectiveDate: this.toDate(effectiveDate)!,
                expiryDate: this.toDate(expiryDate)!,
            }
        });
        return taxBracket;
    }

    /**
     * Updates an existing tax bracket configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the tax bracket to update.
     * @param lowerBound - The new lower income boundary.
     * @param upperBound - The new upper income boundary, or null.
     * @param rate - The new tax rate.
     * @param deductionAmount - The new cumulative deduction amount.
     * @param effectiveDate - The new effective date.
     * @param expiryDate - The new expiry date.
     * @returns The updated tax bracket record.
     * @throws {CustomError} If the tax bracket is not found or unauthorized.
     */
    async updateTaxBracketConfiguration(companyId: number, id: string, lowerBound: number, upperBound: number | null, rate: number, deductionAmount: number, effectiveDate: Date, expiryDate: Date) {
        const existing = await prisma.taxBracket.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Tax Bracket not found or unauthorized");
        }
        const taxBracket = await prisma.taxBracket.update({
            where: {
                id,
            },
            data: {
                lowerBound,
                upperBound: upperBound !== undefined ? upperBound : null,
                rate: rate > 1 ? rate / 100 : rate,
                deductionAmount,
                effectiveDate: this.toDate(effectiveDate)!,
                expiryDate: this.toDate(expiryDate)!,
            }
        });
        return taxBracket;
    }

    /**
     * Soft-deletes a tax bracket by marking it as deleted (isDeleted = true).
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the tax bracket to delete.
     * @returns The updated tax bracket record with isDeleted set to true.
     * @throws {CustomError} If the tax bracket is not found or unauthorized.
     */
    async deleteTaxBracketConfiguration(companyId: number, id: string) {
        const existing = await prisma.taxBracket.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Tax Bracket not found or unauthorized");
        }
        const taxBracket = await prisma.taxBracket.update({
            where: {
                id,
            },
            data: {
                isActive: false,
            }
        });
        return taxBracket;
    }

    /**
     * Retrieves a single tax bracket configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the tax bracket.
     * @returns The tax bracket record.
     * @throws {CustomError} If the tax bracket is not found or unauthorized.
     */
    async getTaxBracketConfiguration(companyId: number, id: string) {
        const existing = await prisma.taxBracket.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Tax Bracket not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of non-deleted tax brackets for a company, ordered by lower bound ascending.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the taxBrackets array and total count.
     */
    async getAllTaxBracketsConfiguration(companyId: number, skip: number, take: number) {
        const [taxBrackets, totalItems] = await Promise.all([
            prisma.taxBracket.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { lowerBound: "asc" }
            }),
            prisma.taxBracket.count({ where: { companyId, isActive: true } })
        ]);

        return { taxBrackets, totalItems };
    }

    /**
     * Batch replaces all active tax brackets for a company within a transaction.
     * Marks existing active brackets as deleted and creates new ones.
     *
     * @param companyId - The numeric ID of the company.
     * @param brackets - An array of tax bracket configurations to create.
     * @returns An array of the newly created tax bracket records.
     */
    async saveTaxBracketBatch(companyId: number, brackets: { id?: string; lowerBound: number; upperBound?: number; rate: number; deductionAmount: number; effectiveDate: Date; expiryDate?: Date | null }[]) {
        return await prisma.$transaction(async (tx) => {
            await tx.taxBracket.updateMany({
                where: { companyId, isActive: true },
                data: { isActive: false }
            });

            const results = await Promise.all(brackets.map(async b => {
                const effectiveDate = this.toDate(b.effectiveDate)!;
                const expiryDate = this.toDate(b.expiryDate);
                return tx.taxBracket.create({
                    data: {
                        companyId,
                        lowerBound: b.lowerBound,
                        // Treat 0 as "no limit" (same as null) — prevents data corruption from frontend edge cases
                        upperBound: b.upperBound != null && b.upperBound > 0 ? b.upperBound : null,
                        rate: b.rate > 1 ? b.rate / 100 : b.rate,
                        deductionAmount: b.deductionAmount,
                        effectiveDate,
                        ...(expiryDate && { expiryDate }),
                    }
                });
            }));
            return results;
        });
    }

    // =========================================================================
    // PENSION CONFIGURATION
    // =========================================================================

    /**
     * Creates a new pension rule configuration for a company.
     * Automatically converts percentage rates (greater than 1) to decimal.
     *
     * @param companyId - The numeric ID of the company.
     * @param employeeRate - The employee's pension contribution rate.
     * @param employerRate - The employer's pension contribution rate.
     * @param basis - The calculation basis (BASIC or GROSS salary).
     * @param mandatoryForForeigners - Whether the rule applies to foreign employees.
     * @param remittanceDeadlineDays - The number of days allowed for remittance.
     * @param effectiveDate - The date the rule becomes effective.
     * @returns The newly created pension rule record.
     */
    async createPensionRuleConfiguration(companyId: number, employeeRate: number, employerRate: number, basis: PensionBasis, mandatoryForForeigners: boolean, remittanceDeadlineDays: number, effectiveDate: Date) {
        const pensionRule = await prisma.pensionRule.create({
            data: {
                companyId,
                employeeRate: employeeRate > 1 ? employeeRate / 100 : employeeRate,
                employerRate: employerRate > 1 ? employerRate / 100 : employerRate,
                basis,
                mandatoryForForeigners,
                remittanceDeadlineDays,
                effectiveDate: this.toDate(effectiveDate)!,
            }
        });
        return pensionRule;
    }

    /**
     * Updates an existing pension rule configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pension rule to update.
     * @param employeeRate - The new employee contribution rate.
     * @param employerRate - The new employer contribution rate.
     * @param basis - The new calculation basis.
     * @param mandatoryForForeigners - Whether the rule applies to foreign employees.
     * @param remittanceDeadlineDays - The new remittance deadline in days.
     * @param effectiveDate - The new effective date.
     * @returns The updated pension rule record.
     * @throws {CustomError} If the pension rule is not found or unauthorized.
     */
    async updatePensionRuleConfiguration(companyId: number, id: string, employeeRate: number, employerRate: number, basis: PensionBasis, mandatoryForForeigners: boolean, remittanceDeadlineDays: number, effectiveDate: Date) {
        const existing = await prisma.pensionRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pension Rule not found or unauthorized");
        }
        const pensionRule = await prisma.pensionRule.update({
            where: { id },
            data: {
                employeeRate: employeeRate > 1 ? employeeRate / 100 : employeeRate,
                employerRate: employerRate > 1 ? employerRate / 100 : employerRate,
                basis,
                mandatoryForForeigners,
                remittanceDeadlineDays,
                effectiveDate: this.toDate(effectiveDate)!,
            }
        });
        return pensionRule;
    }

    /**
     * Soft-deletes a pension rule by marking it as inactive.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pension rule to delete.
     * @returns The updated pension rule record with isActive set to false.
     * @throws {CustomError} If the pension rule is not found or unauthorized.
     */
    async deletePensionRuleConfiguration(companyId: number, id: string) {
        const existing = await prisma.pensionRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pension Rule not found or unauthorized");
        }
        const pensionRule = await prisma.pensionRule.update({
            where: { id },
            data: { isActive: false }
        });
        return pensionRule;
    }

    /**
     * Retrieves a single pension rule configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pension rule.
     * @returns The pension rule record.
     * @throws {CustomError} If the pension rule is not found or unauthorized.
     */
    async getPensionRuleConfiguration(companyId: number, id: string) {
        const existing = await prisma.pensionRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pension Rule not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of active pension rules for a company, ordered by effective date ascending.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the pensionRules array and total count.
     */
    async getAllPensionRulesConfiguration(companyId: number, skip: number, take: number) {
        const [pensionRules, totalItems] = await Promise.all([
            prisma.pensionRule.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { effectiveDate: "asc" }
            }),
            prisma.pensionRule.count({ where: { companyId, isActive: true } })
        ]);

        return { pensionRules, totalItems };
    }

    /**
     * Batch upserts pension rules for a company. Matches on company ID, basis, and effective date.
     * Automatically converts BASIC_SALARY basis to BASIC for enum compatibility.
     *
     * @param companyId - The numeric ID of the company.
     * @param rules - An array of pension rule configurations to upsert.
     * @returns An array of upserted pension rule records.
     */
    async savePensionRuleBatch(companyId: number, rules: any[]) {
        // Ensure the company exists (may not be synced yet from employee management system)
        const existing = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
        if (!existing) {
            await prisma.company.upsert({
                where: { id: companyId },
                create: { id: companyId, name: `Company #${companyId}`, isActive: true },
                update: {},
            });
            console.log(`[PensionConfig] Auto-created missing Company record for companyId=${companyId}`);
        }

        return await prisma.$transaction(async (tx) => {
            // Deactivate all currently active pension rules so only the new one is active
            await tx.pensionRule.updateMany({
                where: { companyId, isActive: true },
                data: { isActive: false }
            });

            return Promise.all(rules.map(async r => {
                const effectiveDate = this.toDate(r.effectiveDate)!;
                const basis = r.basis === "BASIC_SALARY" ? "BASIC" : r.basis;
                
                const data = {
                    employeeRate: r.employeeRate > 1 ? r.employeeRate / 100 : r.employeeRate,
                    employerRate: r.employerRate > 1 ? r.employerRate / 100 : r.employerRate,
                    mandatoryForForeigners: r.mandatoryForForeigners || false,
                    remittanceDeadlineDays: r.remittanceDeadlineDays || 30,
                    isActive: true
                };

                return tx.pensionRule.upsert({
                    where: {
                        companyId_basis_effectiveDate: {
                            companyId,
                            basis: basis as any,
                            effectiveDate
                        }
                    },
                    update: data,
                    create: {
                        ...data,
                        companyId,
                        basis: basis as any,
                        effectiveDate
                    }
                });
            }));
        });
    }

    // =========================================================================
    // OVERTIME CONFIGURATION
    // =========================================================================

    /**
     * Creates a new overtime rule configuration for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param category - The overtime category (e.g. NORMAL, WEEKEND, HOLIDAY).
     * @param rate - The overtime pay multiplier.
     * @param weeklyCapHours - The maximum overtime hours allowed per week.
     * @param effectiveDate - The date the rule becomes effective.
     * @param calculationBase - Whether the overtime rate applies to basic or gross salary.
     * @param isTaxable - Whether the overtime payment is subject to tax.
     * @param monthlyCapHours - Optional maximum overtime hours allowed per month.
     * @returns The newly created overtime rule record.
     */
    async createOvertimeRuleConfiguration(companyId: number, category: OvertimeCategory, rate: number, weeklyCapHours: number, effectiveDate: Date, calculationBase?: string, isTaxable?: boolean, monthlyCapHours?: number | null) {
        const overtimeRule = await prisma.overtimeRule.create({
            data: {
                companyId,
                category,
                rate,
                weeklyCapHours,
                calculationBase: calculationBase as any ?? "BASIC",
                isTaxable: isTaxable ?? true,
                monthlyCapHours: monthlyCapHours ?? null,
                effectiveDate: this.toDate(effectiveDate)!,
            }
        });
        return overtimeRule;
    }

    /**
     * Updates an existing overtime rule configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the overtime rule to update.
     * @param category - The overtime category.
     * @param rate - The new overtime pay multiplier.
     * @param weeklyCapHours - The new weekly cap on overtime hours.
     * @param effectiveDate - The new effective date.
     * @param calculationBase - Whether the overtime rate applies to basic or gross salary.
     * @param isTaxable - Whether the overtime payment is subject to tax.
     * @param monthlyCapHours - Optional maximum overtime hours allowed per month.
     * @returns The updated overtime rule record.
     * @throws {CustomError} If the overtime rule is not found or unauthorized.
     */
    async updateOvertimeRuleConfiguration(companyId: number, id: string, category: OvertimeCategory, rate: number, weeklyCapHours: number, effectiveDate: Date, calculationBase?: string, isTaxable?: boolean, monthlyCapHours?: number | null) {
        const existing = await prisma.overtimeRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Overtime Rule not found or unauthorized");
        }
        const data: any = {
            category,
            rate,
            weeklyCapHours,
            effectiveDate: this.toDate(effectiveDate)!,
        };
        if (calculationBase !== undefined) data.calculationBase = calculationBase;
        if (isTaxable !== undefined) data.isTaxable = isTaxable;
        if (monthlyCapHours !== undefined) data.monthlyCapHours = monthlyCapHours;

        const overtimeRule = await prisma.overtimeRule.update({
            where: { id },
            data,
        });
        return overtimeRule;
    }

    /**
     * Soft-deletes an overtime rule by marking it as inactive.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the overtime rule to delete.
     * @returns The updated overtime rule record with isActive set to false.
     * @throws {CustomError} If the overtime rule is not found or unauthorized.
     */
    async deleteOvertimeRuleConfiguration(companyId: number, id: string) {
        const existing = await prisma.overtimeRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Overtime Rule not found or unauthorized");
        }
        const overtimeRule = await prisma.overtimeRule.update({
            where: {
                id,
            },
            data: {
                isActive: false,
            }
        });
        return overtimeRule;
    }

    /**
     * Retrieves a single overtime rule configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the overtime rule.
     * @returns The overtime rule record.
     * @throws {CustomError} If the overtime rule is not found or unauthorized.
     */
    async getOvertimeRuleConfiguration(companyId: number, id: string) {
        const existing = await prisma.overtimeRule.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Overtime Rule not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of active overtime rules for a company, ordered by category ascending.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the overtimeRules array and total count.
     */
    async getAllOvertimeRulesConfiguration(companyId: number, skip: number, take: number) {
        const [overtimeRules, totalItems] = await Promise.all([
            prisma.overtimeRule.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { category: "asc" }
            }),
            prisma.overtimeRule.count({ where: { companyId, isActive: true } })
        ]);

        return { overtimeRules, totalItems };
    }

    /**
     * Batch upserts overtime rule configurations within a transaction.
     * Matches on company ID, category, and effective date.
     *
     * @param companyId - The numeric ID of the company.
     * @param configs - An array of overtime configuration objects to upsert.
     * @returns An array of upserted overtime rule records.
     */
    async saveOvertimeConfigurations(companyId: number, configs: {
        category: OvertimeCategory;
        rate: number;
        weeklyCapHours: number;
        effectiveDate: Date;
        calculationBase?: string;
        isTaxable?: boolean;
        monthlyCapHours?: number | null;
    }[]) {
        return await prisma.$transaction(async (tx) => {
            return Promise.all(configs.map(async c => {
                const effectiveDate = this.toDate(c.effectiveDate)!;
                return tx.overtimeRule.upsert({
                    where: { companyId_category_effectiveDate: { companyId, category: c.category, effectiveDate } },
                    update: {
                        rate: c.rate,
                        weeklyCapHours: c.weeklyCapHours,
                        calculationBase: c.calculationBase as any ?? "BASIC",
                        isTaxable: c.isTaxable ?? true,
                        monthlyCapHours: c.monthlyCapHours ?? null,
                        isActive: true,
                    },
                    create: {
                        companyId,
                        category: c.category,
                        rate: c.rate,
                        weeklyCapHours: c.weeklyCapHours,
                        calculationBase: c.calculationBase as any ?? "BASIC",
                        isTaxable: c.isTaxable ?? true,
                        monthlyCapHours: c.monthlyCapHours ?? null,
                        effectiveDate,
                    }
                });
            }));
        });
    }

    // =========================================================================
    // ALLOWANCE CONFIGURATION
    // =========================================================================

    /**
     * Creates a new allowance configuration for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param earningType - The earning type for this allowance.
     * @param label - A human-readable label for the allowance.
     * @param isTaxable - Whether the allowance is subject to tax.
     * @returns The newly created allowance configuration record.
     */
    async createAllowanceConfiguration(companyId: number, earningType: string, label: string, isTaxable: boolean, isExempt?: boolean, exemptPercent?: number | null) {
        const allowance = await prisma.allowanceConfig.create({
            data: {
                companyId,
                earningType,
                label,
                isTaxable,
                isExempt: isExempt ?? false,
                exemptPercent: exemptPercent != null ? new Prisma.Decimal(exemptPercent) : null,
            }
        });
        return allowance;
    }

    /**
     * Updates an existing allowance configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the allowance to update.
     * @param label - The new label for the allowance.
     * @param isTaxable - Whether the allowance is taxable.
     * @param isActive - Whether the allowance is active.
     * @returns The updated allowance configuration record.
     * @throws {CustomError} If the allowance is not found or unauthorized.
     */
    async updateAllowanceConfiguration(companyId: number, id: string, label: string, isTaxable: boolean, isActive: boolean, isExempt?: boolean, exemptPercent?: number | null) {
        const existing = await prisma.allowanceConfig.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Allowance not found or unauthorized");
        }
        const data: any = { label, isTaxable, isActive };
        if (isExempt !== undefined) data.isExempt = isExempt;
        if (exemptPercent !== undefined) data.exemptPercent = exemptPercent != null ? new Prisma.Decimal(exemptPercent) : null;
        const allowance = await prisma.allowanceConfig.update({
            where: { id },
            data,
        });
        return allowance;
    }

    /**
     * Soft-deletes an allowance configuration by marking it as inactive.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the allowance to delete.
     * @returns The updated allowance configuration record with isActive set to false.
     * @throws {CustomError} If the allowance is not found or unauthorized.
     */
    async deleteAllowanceConfiguration(companyId: number, id: string) {
        const existing = await prisma.allowanceConfig.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Allowance not found or unauthorized");
        }
        const allowance = await prisma.allowanceConfig.update({
            where: {
                id,
            },
            data: {
                isActive: false,
            }
        });
        return allowance;
    }

    /**
     * Retrieves a single allowance configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the allowance.
     * @returns The allowance configuration record.
     * @throws {CustomError} If the allowance is not found or unauthorized.
     */
    async getAllowanceConfiguration(companyId: number, id: string) {
        const existing = await prisma.allowanceConfig.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Allowance not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of active allowance configurations for a company, ordered by label.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the allowances array and total count.
     */
    async getAllAllowanceConfigurations(companyId: number, skip: number, take: number) {
        const [allowances, totalItems] = await Promise.all([
            prisma.allowanceConfig.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { label: "asc" }
            }),
            prisma.allowanceConfig.count({ where: { companyId, isActive: true } })
        ]);

        return { allowances, totalItems };
    }

    /**
     * Batch upserts allowance configurations for a company within a transaction.
     * Matches on company ID and earning type.
     *
     * @param companyId - The numeric ID of the company.
     * @param allowances - An array of allowance configuration objects to upsert.
     * @returns An array of upserted allowance configuration records.
     */
    async saveAllowanceConfigurations(companyId: number, allowances: { earningType: string; label: string; isTaxable: boolean; isExempt?: boolean; exemptPercent?: number | null }[]) {
        return await prisma.$transaction(async (tx) => {
            return Promise.all(allowances.map(async a => {
                return tx.allowanceConfig.upsert({
                    where: { companyId_earningType: { companyId, earningType: a.earningType } },
                    update: {
                        label: a.label,
                        isTaxable: a.isTaxable,
                        isActive: true,
                        isExempt: a.isExempt ?? false,
                        exemptPercent: a.exemptPercent != null ? new Prisma.Decimal(a.exemptPercent) : null,
                    },
                    create: {
                        companyId,
                        earningType: a.earningType,
                        label: a.label,
                        isTaxable: a.isTaxable,
                        isExempt: a.isExempt ?? false,
                        exemptPercent: a.exemptPercent != null ? new Prisma.Decimal(a.exemptPercent) : null,
                    }
                });
            }));
        });
    }

    // =========================================================================
    // SALARY STRUCTURE CONFIGURATION
    // =========================================================================

    /**
     * Creates a new salary structure for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param name - The display name of the salary structure.
     * @param description - A description of the salary structure.
     * @returns The newly created salary structure record.
     */
    async createSalaryStructure(companyId: number, name: string, description: string) {
        const salaryStructure = await prisma.salaryStructure.create({
            data: {
                companyId,
                name,
                description,
            }
        });
        return salaryStructure;
    }

    /**
     * Updates an existing salary structure.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the salary structure to update.
     * @param name - The new display name.
     * @param description - The new description.
     * @returns The updated salary structure record.
     * @throws {CustomError} If the salary structure is not found or unauthorized.
     */
    async updateSalaryStructure(companyId: number, id: string, name: string, description: string) {
        const existing = await prisma.salaryStructure.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Salary Structure not found or unauthorized");
        }
        const salaryStructure = await prisma.salaryStructure.update({
            where: {
                id,
            },
            data: {
                name,
                description,
            }
        });
        return salaryStructure;
    }

    /**
     * Soft-deletes a salary structure by marking it as inactive.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the salary structure to delete.
     * @returns The updated salary structure record with isActive set to false.
     * @throws {CustomError} If the salary structure is not found or unauthorized.
     */
    async deleteSalaryStructure(companyId: number, id: string) {
        const existing = await prisma.salaryStructure.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Salary Structure not found or unauthorized");
        }
        const salaryStructure = await prisma.salaryStructure.update({
            where: {
                id,
            },
            data: {
                isActive: false,
            }
        });
        return salaryStructure;
    }

    /**
     * Retrieves a single salary structure by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the salary structure.
     * @returns The salary structure record.
     * @throws {CustomError} If the salary structure is not found or unauthorized.
     */
    async getSalaryStructure(companyId: number, id: string) {
        const existing = await prisma.salaryStructure.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Salary Structure not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of active salary structures for a company, ordered by name.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @returns An object containing the salaryStructures array and total count.
     */
    async getAllSalaryStructures(companyId: number, skip: number, take: number) {
        const [salaryStructures, totalItems] = await Promise.all([
            prisma.salaryStructure.findMany({
                where: { companyId, isActive: true },
                skip,
                take,
                orderBy: { name: "asc" }
            }),
            prisma.salaryStructure.count({ where: { companyId, isActive: true } })
        ]);

        return { salaryStructures, totalItems };
    }

    /**
     * Batch creates or updates salary structures within a transaction.
     * Existing structures are matched by company ID and name.
     *
     * @param companyId - The numeric ID of the company.
     * @param structures - An array of objects containing name and optional description.
     * @returns An array of created or updated salary structure records.
     */
    async saveSalaryStructureBatch(companyId: number, structures: { name: string; description?: string }[]) {
        return await prisma.$transaction(async (tx) => {
            return Promise.all(structures.map(async s => {
                const existing = await tx.salaryStructure.findFirst({ where: { companyId, name: s.name } });
                if (existing) {
                    return tx.salaryStructure.update({
                        where: { id: existing.id },
                        data: { description: s.description, isActive: true }
                    });
                } else {
                    return tx.salaryStructure.create({
                        data: { companyId, name: s.name, description: s.description }
                    });
                }
            }));
        });
    }

    // =========================================================================
    // PAYROLL PERIOD CONFIGURATION
    // =========================================================================

    /**
     * Computes derived period fields (calendar days, work days, work hours) based on
     * the company's workday configuration and the given date range.
     *
     * @param companyId - The numeric ID of the company.
     * @param startDate - The start date of the period.
     * @param endDate - The end date of the period.
     * @returns An object containing calendarDays, workDays, workHours, and the source workday configuration.
     */
    async computePeriodFields(companyId: number, startDate: any, endDate: any) {
        const workdays = await this.getWorkdaysConfiguration(companyId);
        const { dailyWorkingHours, defaultMonthlyWorkdays } = workdays;

        const d1 = startDate instanceof Date ? startDate : new Date(startDate);
        const d2 = endDate instanceof Date ? endDate : new Date(endDate);

        const msPerDay = 86400000;
        let calendarDays = 0;
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            calendarDays = Math.round((d2.getTime() - d1.getTime()) / msPerDay) + 1;
        }

        // Strictly use Monthly Basis * Daily Hours for Capacity
        const monthlyBasis = Number(defaultMonthlyWorkdays || 30);
        const dailyBasis = Number(dailyWorkingHours || 8);
        const workHours = monthlyBasis * dailyBasis;

        return {
            calendarDays,
            workHours,
            dailyWorkingHours: dailyBasis,
            defaultMonthlyWorkdays: monthlyBasis,
        };
    }

    /**
     * Creates a new payroll period configuration within a fiscal year.
     * Validates that dates are within the fiscal year range, checks for overlaps with other
     * active periods, and auto-closes any existing DRAFT periods in the same fiscal year.
     *
     * @param companyId - The numeric ID of the company.
     * @param name - An optional display name for the period.
     * @param cycle - The payroll cycle (e.g. MONTHLY, WEEKLY).
     * @param startDate - The start date of the period.
     * @param endDate - The end date of the period.
     * @param dateOfPayment - Optional date of payment (must be on or after endDate).
     * @param fiscalYearId - The ID of the parent fiscal year.
     * @returns The newly created payroll period record with computed period fields.
     * @throws {CustomError} If validation fails for dates, fiscal year status, or overlapping periods.
     */
    async createPayrollPeriodConfiguration(companyId: number, name: string | null, cycle: PayrollCycle, startDate: Date, endDate: Date, dateOfPayment: Date | null, fiscalYearId: string) {
        const parsedStartDate = this.toDate(startDate);
        const parsedEndDate = this.toDate(endDate);
        const parsedDateOfPayment = this.toDate(dateOfPayment);

        if (!parsedStartDate || !parsedEndDate) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Invalid startDate or endDate");
        }

        // Normalize to midnight UTC for pure date comparison
        parsedStartDate.setUTCHours(0, 0, 0, 0);
        parsedEndDate.setUTCHours(0, 0, 0, 0);
        if (parsedDateOfPayment) parsedDateOfPayment.setUTCHours(0, 0, 0, 0);
        if (parsedStartDate >= parsedEndDate) {
            throw new CustomError(httpStatus.BAD_REQUEST, "startDate must be before endDate");
        }
        if (parsedDateOfPayment && parsedDateOfPayment < parsedEndDate) {
            throw new CustomError(httpStatus.BAD_REQUEST, "dateOfPayment must be on or after endDate");
        }

        // Verify fiscal year exists and is ACTIVE
        const fy = await prisma.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId } });
        if (!fy) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found");
        }
        if (fy.status !== FiscalStatusConst.ACTIVE) {
            throw new CustomError(httpStatus.CONFLICT, "Payroll periods can only be created in an ACTIVE fiscal year");
        }

        // Limit to 12 periods per fiscal year
        const periodCount = await prisma.payrollPeriod.count({
            where: { fiscalYearId, companyId }
        });
        if (periodCount >= 12) {
            throw new CustomError(httpStatus.BAD_REQUEST, "Maximum of 12 payroll periods are allowed per fiscal year.");
        }
        if (parsedStartDate < fy.startDate || parsedEndDate > fy.endDate) {
            throw new CustomError(httpStatus.BAD_REQUEST,
                `Period dates must be within the fiscal year range (${fy.startDate.toISOString().slice(0, 10)} — ${fy.endDate.toISOString().slice(0, 10)})`
            );
        }

        // Check overlap with existing non-DONE periods in the same fiscal year
        await this.assertNoPayrollPeriodOverlap(companyId, fiscalYearId, parsedStartDate, parsedEndDate);


        const payrollPeriod = await prisma.payrollPeriod.create({
            data: {
                companyId,
                fiscalYearId,
                name: name ?? null,
                cycle,
                startDate: parsedStartDate,
                endDate: parsedEndDate,
                dateOfPayment: parsedDateOfPayment,
                status: PayrollPeriodStatusConst.DRAFT as any,
            }
        });

        const computed = await this.computePeriodFields(companyId, parsedStartDate, parsedEndDate);

        return { ...payrollPeriod, ...computed };
    }

    /**
     * Updates an existing payroll period's metadata. Only DRAFT periods can be updated.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the payroll period.
     * @param name - Optional new display name.
     * @param cycle - Optional new payroll cycle.
     * @param dateOfPayment - Optional new date of payment.
     * @returns The updated payroll period record.
     * @throws {CustomError} If the period is not found or is not in DRAFT status.
     */
    async updatePayrollPeriodConfiguration(companyId: number, id: string, name?: string, cycle?: PayrollCycle, startDate?: Date, endDate?: Date, dateOfPayment?: Date | null) {
        const existing = await prisma.payrollPeriod.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }
        
        if (existing.status !== PayrollPeriodStatusConst.DRAFT) {
            throw new CustomError(httpStatus.CONFLICT, `Cannot update a ${existing.status} period`);
        }

        const parsedStartDate = startDate ? this.toDate(startDate) : undefined;
        const parsedEndDate = endDate ? this.toDate(endDate) : undefined;
        const parsedDateOfPayment = dateOfPayment !== undefined ? this.toDate(dateOfPayment) : undefined;

        if (parsedStartDate) parsedStartDate.setUTCHours(0, 0, 0, 0);
        if (parsedEndDate) parsedEndDate.setUTCHours(0, 0, 0, 0);
        if (parsedDateOfPayment) parsedDateOfPayment.setUTCHours(0, 0, 0, 0);

        // If dates are provided, validate them
        const finalStart = parsedStartDate ?? existing.startDate;
        const finalEnd = parsedEndDate ?? existing.endDate;

        if (finalStart >= finalEnd) {
            throw new CustomError(httpStatus.BAD_REQUEST, "startDate must be before endDate");
        }

        if (parsedDateOfPayment && parsedDateOfPayment < finalEnd) {
            throw new CustomError(httpStatus.BAD_REQUEST, "dateOfPayment must be on or after endDate");
        }

        // Check overlap if dates changed
        if (parsedStartDate || parsedEndDate) {
            await this.assertNoPayrollPeriodOverlap(companyId, existing.fiscalYearId!, finalStart, finalEnd, { id });
        }

        const payrollPeriod = await prisma.payrollPeriod.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(cycle !== undefined && { cycle }),
                ...(parsedStartDate && { startDate: parsedStartDate }),
                ...(parsedEndDate && { endDate: parsedEndDate }),
                ...(parsedDateOfPayment !== undefined && { dateOfPayment: parsedDateOfPayment }),
            }
        });
        return payrollPeriod;
    }

    /**
     * Deletes a payroll period. Only DRAFT periods can be deleted.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the payroll period to delete.
     * @returns An object indicating successful deletion.
     * @throws {CustomError} If the period is not found or is not in DRAFT status.
     */
    async deletePayrollPeriodConfiguration(companyId: number, id: string) {
        const existing = await prisma.payrollPeriod.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }

        if (existing.status !== PayrollPeriodStatusConst.DRAFT) {
            throw new CustomError(httpStatus.CONFLICT,
                `Only DRAFT payroll periods can be deleted. Current status: ${existing.status}`
            );
        }

        await prisma.payrollPeriod.delete({ where: { id } });
        return { deleted: true };
    }

    /**
     * Retrieves a single payroll period configuration with computed period fields.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the payroll period.
     * @returns The payroll period record with computed workday fields.
     * @throws {CustomError} If the period is not found or unauthorized.
     */
    async getPayrollPeriodConfiguration(companyId: number, id: string) {
        const existing = await prisma.payrollPeriod.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }
        const computed = await this.computePeriodFields(companyId, existing.startDate, existing.endDate);
        return { ...existing, ...computed };
    }

    /**
     * Retrieves the most recent active payroll period (DRAFT or OPEN) for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @returns The current payroll period record with computed workday fields.
     * @throws {CustomError} If no active period is found.
     */
    async getCurrentPayrollPeriodConfiguration(companyId: number) {
        const period = await prisma.payrollPeriod.findFirst({
            where: {
                companyId,
                status: { in: [PayrollPeriodStatusConst.DRAFT, PayrollPeriodStatusConst.ACTIVE] as any },
            },
            orderBy: { startDate: 'desc' },
        });

        if (!period) {
            throw new CustomError(httpStatus.NOT_FOUND, 'No current period found');
        }

        const computed = await this.computePeriodFields(companyId, period.startDate, period.endDate);

        return { ...period, ...computed };
    }

    async getAllPayrollPeriodsConfiguration(companyId: number, skip: number, take: number, status?: $Enums.PayrollPeriodStatus, cycle?: PayrollCycle) {
        const whereArgs = {
            companyId,
            ...(status && { status }),
            ...(cycle && { cycle }),
        };

        const [payrollPeriods, totalItems] = await Promise.all([
            prisma.payrollPeriod.findMany({
                where: whereArgs,
                skip,
                take,
                orderBy: { startDate: "desc" }
            }),
            prisma.payrollPeriod.count({ where: whereArgs })
        ]);

        const periodsWithComputed = await Promise.all(payrollPeriods.map(async p => {
            try {
                const computed = await this.computePeriodFields(companyId, p.startDate, p.endDate);
                return { ...p, ...computed };
            } catch (err) {
                return p;
            }
        }));

        return { payrollPeriods: periodsWithComputed, totalItems };
    }

    /**
     * Opens a payroll period, transitioning it from DRAFT to OPEN status.
     * Requires the parent fiscal year to be ACTIVE.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the payroll period to open.
     * @returns The updated payroll period record with OPEN status.
     * @throws {CustomError} If the period is not found or the transition is not allowed.
     */
    async openPayrollPeriod(companyId: number, id: string) {
        const existing = await prisma.payrollPeriod.findFirst({
            where: { id, companyId },
            include: { fiscalYear: true },
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }
        this.assertPayrollPeriodTransition('open', existing.status as PayrollPeriodStatus);

        if (existing.fiscalYear?.status !== FiscalStatusConst.ACTIVE) {
            throw new CustomError(httpStatus.CONFLICT,
                "Cannot open a payroll period in a non-active fiscal year. The fiscal year must be ACTIVE."
            );
        }

        // Check if there is already an active payroll period for this company
        const activePeriod = await prisma.payrollPeriod.findFirst({
            where: {
                companyId,
                status: PayrollPeriodStatusConst.ACTIVE as any,
                id: { not: id },
            },
        });
        if (activePeriod) {
            throw new CustomError(httpStatus.CONFLICT,
                `Cannot open payroll period "${existing.name || 'Unnamed'}" while "${activePeriod.name || 'Unnamed'}" is still open. Please close the active payroll period first.`
            );
        }

        const period = await prisma.payrollPeriod.update({
            where: { id },
            data: { status: PayrollPeriodStatusConst.ACTIVE as any },
        });
        return period;
    }

    /**
     * Closes a payroll period, transitioning it from OPEN to CLOSED status.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the payroll period to close.
     * @returns The updated payroll period record with CLOSED status.
     * @throws {CustomError} If the period is not found or the transition is not allowed.
     */
    async closePayrollPeriod(companyId: number, id: string) {
        const existing = await prisma.payrollPeriod.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }
        this.assertPayrollPeriodTransition('close', existing.status as PayrollPeriodStatus);

        const period = await prisma.payrollPeriod.update({
            where: { id },
            data: { status: PayrollPeriodStatusConst.DONE as any },
        });
        return period;
    }

    /**
     * Saves (upserts) a payroll period configuration within a transaction.
     * Auto-closes other DRAFT periods in the same fiscal year before upserting.
     * Requires the fiscal year to be ACTIVE and dates to be within its range.
     *
     * @param companyId - The numeric ID of the company.
     * @param name - An optional display name for the period.
     * @param cycle - The payroll cycle.
     * @param startDate - The start date of the period.
     * @param endDate - The end date of the period.
     * @param dateOfPayment - Optional date of payment.
     * @param fiscalYearId - The ID of the parent fiscal year.
     * @returns The upserted payroll period record with computed period fields.
     * @throws {CustomError} If validation fails or the fiscal year is not ACTIVE.
     */
    async savePayrollPeriodConfiguration(companyId: number, name: string | null, cycle: PayrollCycle, startDate: Date, endDate: Date, dateOfPayment: Date | null, fiscalYearId: string) {
        const parsedStartDate = this.toDate(startDate)!;
        const parsedEndDate = this.toDate(endDate)!;
        const parsedDateOfPayment = this.toDate(dateOfPayment);

        const fy = await prisma.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId } });
        if (!fy) {
            throw new CustomError(httpStatus.NOT_FOUND, "Fiscal Year not found");
        }
        if (fy.status !== FiscalStatusConst.ACTIVE) {
            throw new CustomError(httpStatus.CONFLICT, "Payroll periods can only be saved in an ACTIVE fiscal year");
        }
        if (parsedStartDate < fy.startDate || parsedEndDate > fy.endDate) {
            throw new CustomError(httpStatus.BAD_REQUEST,
                `Period dates must be within the fiscal year range (${fy.startDate.toISOString().slice(0, 10)} — ${fy.endDate.toISOString().slice(0, 10)})`
            );
        }

        // Check overlap with existing non-DONE periods (excluding this exact period for upsert scenario)
        await this.assertNoPayrollPeriodOverlap(companyId, fiscalYearId, parsedStartDate, parsedEndDate, {
            compoundKey: { startDate: parsedStartDate, endDate: parsedEndDate, cycle: cycle as string },
        });

        // Enforce maximum of 12 payroll periods per fiscal year
        const existingCount = await prisma.payrollPeriod.count({
            where: {
                companyId,
                fiscalYearId,
                // Exclude this exact period if it already exists (upsert scenario)
                NOT: {
                    AND: [
                        { startDate: parsedStartDate },
                        { endDate: parsedEndDate },
                        { cycle },
                    ],
                },
            },
        });

        if (existingCount >= 12) {
            throw new CustomError(httpStatus.CONFLICT,
                `A fiscal year can have a maximum of 12 payroll periods. This fiscal year already has ${existingCount} periods.`
            );
        }


        await prisma.payrollPeriod.updateMany({
            where: {
                companyId,
                fiscalYearId,
                status: { in: [PayrollPeriodStatusConst.DRAFT] as any },
            },
            data: { status: PayrollPeriodStatusConst.DONE as any },
        });

        const result = await prisma.payrollPeriod.upsert({
            where: { companyId_startDate_endDate_cycle: { companyId, startDate: parsedStartDate, endDate: parsedEndDate, cycle } },
            update: { name, dateOfPayment: parsedDateOfPayment, fiscalYearId, status: PayrollPeriodStatusConst.DRAFT as any },
            create: {
                companyId, fiscalYearId, name, cycle, startDate: parsedStartDate, endDate: parsedEndDate,
                dateOfPayment: parsedDateOfPayment,
                status: PayrollPeriodStatusConst.DRAFT as any,
            },
        });

        const computed = await this.computePeriodFields(companyId, parsedStartDate, parsedEndDate);

        return { ...result, ...computed };
    }

    // =========================================================================
    // WORKDAYS CONFIGURATION
    // =========================================================================

    public readonly WORKDAY_KEYS = {
        MONTHLY: 'DEFAULT_MONTHLY_WORKDAYS',
        WEEKLY: 'WEEKLY_WORKING_DAYS',
        DAILY_HOURS: 'DAILY_WORKING_HOURS',
    } as const;

    /**
     * Retrieves the workday configuration for a company from the configuration table.
     * Falls back to sensible defaults (30 monthly days, 5 working days, 8 daily hours) when not set.
     *
     * @param companyId - The numeric ID of the company.
     * @returns An object containing defaultMonthlyWorkdays, weeklyWorkingDays, and dailyWorkingHours.
     */
    async getWorkdaysConfiguration(companyId: number) {
        const configs = await prisma.configuration.findMany({
            where: { companyId, key: { in: [this.WORKDAY_KEYS.MONTHLY, this.WORKDAY_KEYS.DAILY_HOURS] } },
        });

        const get = (key: string, fallback: number) =>
            Number(configs.find((c) => c.key === key)?.value ?? fallback);

        return {
            defaultMonthlyWorkdays: get(this.WORKDAY_KEYS.MONTHLY, 30),
            dailyWorkingHours: get(this.WORKDAY_KEYS.DAILY_HOURS, 8),
        };
    }

    /**
     * Upserts a single workday configuration key within a transaction context.
     *
     * @param tx - The Prisma transaction client.
     * @param companyId - The numeric ID of the company.
     * @param key - The configuration key to upsert.
     * @param value - The string value to set.
     * @param userId - The ID of the user making the change.
     * @returns The upserted configuration record.
     */
    upsertWorkdayKey(tx: any, companyId: number, key: string, value: string, userId: string) {
        return tx.configuration.upsert({
            where: { companyId_key: { companyId, key } },
            update: { value, updatedBy: userId },
            create: { companyId, key, value, updatedBy: userId },
        });
    }

    /**
     * Saves the full workday configuration (all three keys) within a transaction.
     * Validates that weekly working days do not exceed monthly workdays and daily hours are within 1-24.
     *
     * @param companyId - The numeric ID of the company.
     * @param defaultMonthlyWorkdays - The default number of workdays per month.
     * @param weeklyWorkingDays - The number of working days per week.
     * @param dailyWorkingHours - The number of working hours per day.
     * @param userId - The ID of the user making the change.
     * @returns An object containing the saved configuration values.
     * @throws {CustomError} If validation fails.
     */
    async saveWorkdaysConfiguration(
        companyId: number,
        defaultMonthlyWorkdays: number,
        weeklyWorkingDays: number,
        dailyWorkingHours: number,
        userId: string
    ) {
        if (weeklyWorkingDays > defaultMonthlyWorkdays) {
            throw new CustomError(httpStatus.BAD_REQUEST, "weeklyWorkingDays cannot exceed defaultMonthlyWorkdays");
        }
        if (dailyWorkingHours < 1 || dailyWorkingHours > 24) {
            throw new CustomError(httpStatus.BAD_REQUEST, "dailyWorkingHours must be 1–24");
        }

        await prisma.$transaction([
            this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.MONTHLY, String(defaultMonthlyWorkdays), userId),
            this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.WEEKLY, String(weeklyWorkingDays), userId),
            this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.DAILY_HOURS, String(dailyWorkingHours), userId),
        ]);

        return {
            defaultMonthlyWorkdays,
            weeklyWorkingDays,
            dailyWorkingHours,
        };
    }

    /**
     * Patches individual workday configuration fields (partial update).
     * Only the provided fields are updated; others remain unchanged.
     *
     * @param companyId - The numeric ID of the company.
     * @param updates - A partial object containing the fields to update.
     * @param userId - The ID of the user making the change.
     * @returns The updated workday configuration after applying the patch.
     * @throws {CustomError} If no fields are provided or dailyWorkingHours is out of range.
     */
    async patchWorkdaysConfiguration(companyId: number, updates: Partial<{ defaultMonthlyWorkdays: number; weeklyWorkingDays: number; dailyWorkingHours: number }>, userId: string) {
        const operations: any[] = [];

        if (updates.defaultMonthlyWorkdays != null) {
            operations.push(this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.MONTHLY, String(updates.defaultMonthlyWorkdays), userId));
        }
        if (updates.weeklyWorkingDays != null) {
            operations.push(this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.WEEKLY, String(updates.weeklyWorkingDays), userId));
        }
        if (updates.dailyWorkingHours != null) {
            if (updates.dailyWorkingHours < 1 || updates.dailyWorkingHours > 24) {
                throw new CustomError(httpStatus.BAD_REQUEST, "dailyWorkingHours must be 1–24");
            }
            operations.push(this.upsertWorkdayKey(prisma, companyId, this.WORKDAY_KEYS.DAILY_HOURS, String(updates.dailyWorkingHours), userId));
        }

        if (operations.length === 0) {
            throw new CustomError(httpStatus.BAD_REQUEST, "No fields provided to update");
        }

        await prisma.$transaction(operations);
        return this.getWorkdaysConfiguration(companyId);
    }

    // =========================================================================
    // DEDUCTION CONFIGURATION
    // =========================================================================

    /**
     * Creates a new deduction item under a specific salary structure.
     *
     * @param salaryStructureId - The ID of the parent salary structure.
     * @param companyId - The numeric ID of the company for ownership validation.
     * @param deductionType - The type of deduction (e.g. LOAN, ADVANCE, TAX).
     * @param label - A human-readable label.
     * @param isMandatory - Whether the deduction is mandatory.
     * @param isStatutory - Whether the deduction is statutory.
     * @returns The newly created deduction item record.
     * @throws {CustomError} If the salary structure is not found or unauthorized.
     */
    async createDeductionConfiguration(
        salaryStructureId: string,
        companyId: number,
        deductionType: string,
        label: string,
        isMandatory?: boolean,
        isStatutory?: boolean,
        calculationType?: string | null,
        calculationBasis?: string | null,
        amount?: number | null,
        percent?: number | null,
    ) {
        const structure = await prisma.salaryStructure.findFirst({ where: { id: salaryStructureId, companyId } });
        if (!structure) {
            throw new CustomError(httpStatus.NOT_FOUND, "Salary Structure not found or unauthorized");
        }
        return prisma.deductionItem.create({
            data: {
                salaryStructureId,
                deductionType: (deductionType || 'OTHER') as any,
                label,
                ...(calculationType !== undefined && calculationType !== null && { calculationType: calculationType as any }),
                ...(calculationBasis !== undefined && calculationBasis !== null && { calculationBasis: calculationBasis as any }),
                ...(amount !== undefined && amount !== null && { amount }),
                ...(percent !== undefined && percent !== null && { percent }),
                isMandatory: isMandatory ?? false,
                isStatutory: isStatutory ?? false,
            }
        });
    }

    /**
     * Creates a deduction configuration using the company's first active salary structure,
     * auto-creating a default one if none exists.
     *
     * @param companyId - The numeric ID of the company.
     * @param deductionType - The type of deduction.
     * @param label - A human-readable label.
     * @param isMandatory - Whether the deduction is mandatory.
     * @param isStatutory - Whether the deduction is statutory.
     * @param calculationType - Optional calculation method.
     * @param amount - Optional fixed amount.
     * @param percent - Optional percentage.
     * @returns The newly created deduction item record.
     */
    async createDeductionConfigurationSimple(
        companyId: number,
        deductionType: string,
        label: string,
        isMandatory?: boolean,
        isStatutory?: boolean,
        calculationType?: string | null,
        calculationBasis?: string | null,
        amount?: number | null,
        percent?: number | null,
    ) {
        let structure = await prisma.salaryStructure.findFirst({
            where: { companyId, isActive: true },
            orderBy: { createdAt: 'asc' }
        });
        if (!structure) {
            structure = await prisma.salaryStructure.create({
                data: { companyId, name: 'Default', description: 'Auto-created default salary structure' }
            });
        }
        return this.createDeductionConfiguration(
            structure.id, companyId, deductionType, label,
            isMandatory, isStatutory, calculationType, calculationBasis, amount, percent,
        );
    }

    /**
     * Updates an existing deduction configuration. Any provided field is patched.
     *
     * @param companyId - The numeric ID of the company for ownership validation.
     * @param id - The unique ID of the deduction item.
     * @param deductionType - Optional new deduction type.
     * @param label - Optional new label.
     * @param isMandatory - Optional new mandatory flag.
     * @param isStatutory - Optional new statutory flag.
     * @returns The updated deduction item record.
     * @throws {CustomError} If the deduction item is not found or unauthorized.
     */
    async updateDeductionConfiguration(
        companyId: number,
        id: string,
        deductionType?: string,
        label?: string,
        isMandatory?: boolean,
        isStatutory?: boolean,
        calculationType?: string | null,
        calculationBasis?: string | null,
        amount?: number | null,
        percent?: number | null,
    ) {
        const existing = await prisma.deductionItem.findFirst({
            where: { id },
            include: { salaryStructure: true }
        });
        if (!existing || existing.salaryStructure.companyId !== companyId) {
            throw new CustomError(httpStatus.NOT_FOUND, "Deduction item not found or unauthorized");
        }
        return prisma.deductionItem.update({
            where: { id },
            data: {
                ...(deductionType !== undefined && { deductionType: deductionType as any }),
                ...(label !== undefined && { label }),
                ...(isMandatory !== undefined && { isMandatory }),
                ...(isStatutory !== undefined && { isStatutory }),
                ...(calculationType !== undefined && { calculationType: calculationType as any }),
                ...(calculationBasis !== undefined && { calculationBasis: calculationBasis as any }),
                ...(amount !== undefined && { amount }),
                ...(percent !== undefined && { percent }),
            }
        });
    }

    /**
     * Soft-deletes a deduction configuration by marking it as inactive.
     *
     * @param companyId - The numeric ID of the company for ownership validation.
     * @param id - The unique ID of the deduction item to delete.
     * @returns The updated deduction item record with isActive set to false.
     * @throws {CustomError} If the deduction item is not found or unauthorized.
     */
    async deleteDeductionConfiguration(companyId: number, id: string) {
        const existing = await prisma.deductionItem.findFirst({
            where: { id },
            include: { salaryStructure: true }
        });
        if (!existing || existing.salaryStructure.companyId !== companyId) {
            throw new CustomError(httpStatus.NOT_FOUND, "Deduction item not found or unauthorized");
        }
        return prisma.deductionItem.update({
            where: { id },
            data: { isActive: false }
        });
    }

    /**
     * Retrieves a single deduction configuration by ID with its salary structure.
     *
     * @param companyId - The numeric ID of the company for ownership validation.
     * @param id - The unique ID of the deduction item.
     * @returns The deduction item record with its salary structure.
     * @throws {CustomError} If the deduction item is not found or unauthorized.
     */
    async getDeductionConfiguration(companyId: number, id: string) {
        const existing = await prisma.deductionItem.findFirst({
            where: { id },
            include: { salaryStructure: true }
        });
        if (!existing || existing.salaryStructure.companyId !== companyId) {
            throw new CustomError(httpStatus.NOT_FOUND, "Deduction item not found or unauthorized");
        }
        return existing;
    }

    /**
     * Retrieves a paginated list of active deduction configurations.
     * Filters by company via salary structure ownership, with optional salary structure filter.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of records to skip for pagination.
     * @param take - The number of records to take.
     * @param salaryStructureId - Optional filter by salary structure ID.
     * @returns An object containing the deductionItems array and total count.
     */
    async getAllDeductionConfigurations(companyId: number, skip: number, take: number, salaryStructureId?: string) {
        const whereArgs: any = {
            isActive: true,
            salaryStructure: { companyId },
            ...(salaryStructureId && { salaryStructureId }),
        };

        const [deductionItems, totalItems] = await Promise.all([
            prisma.deductionItem.findMany({
                where: whereArgs,
                skip,
                take,
                orderBy: { deductionType: 'asc' }
            }),
            prisma.deductionItem.count({ where: whereArgs })
        ]);

        return { deductionItems, totalItems };
    }

    /**
     * Batch saves deduction configurations for a salary structure within a transaction.
     * Marks existing active deductions as inactive and creates the new set.
     *
     * @param companyId - The numeric ID of the company for ownership validation.
     * @param salaryStructureId - The ID of the salary structure to associate deductions with.
     * @param deductions - An array of deduction configuration objects to create.
     * @returns An object containing the count of created items and the items themselves.
     * @throws {CustomError} If the salary structure is not found or unauthorized.
     */
    async saveDeductionConfigurations(
        companyId: number,
        salaryStructureId: string,
        deductions: {
            deductionType: string;
            label: string;
            isMandatory?: boolean;
            isStatutory?: boolean;
            calculationType?: string | null;
            calculationBasis?: string | null;
            amount?: number | null;
            percent?: number | null;
        }[]
    ) {
        const structure = await prisma.salaryStructure.findFirst({ where: { id: salaryStructureId, companyId } });
        if (!structure) {
            throw new CustomError(httpStatus.NOT_FOUND, "Salary Structure not found or unauthorized");
        }

        return await prisma.$transaction(async (tx) => {
            await tx.deductionItem.updateMany({
                where: { salaryStructureId, isActive: true },
                data: { isActive: false }
            });

            const created = await Promise.all(deductions.map(d =>
                tx.deductionItem.create({
                    data: {
                        salaryStructureId,
                        deductionType: d.deductionType as any,
                        label: d.label,
                        ...(d.calculationType !== undefined && d.calculationType !== null && { calculationType: d.calculationType as any }),
                        ...(d.calculationBasis !== undefined && d.calculationBasis !== null && { calculationBasis: d.calculationBasis as any }),
                        ...(d.amount !== undefined && d.amount !== null && { amount: d.amount }),
                        ...(d.percent !== undefined && d.percent !== null && { percent: d.percent }),
                        isMandatory: d.isMandatory ?? false,
                        isStatutory: d.isStatutory ?? false,
                    }
                })
            ));

            return { count: created.length, items: created };
        });
    }

    /**
     * Batch saves deduction configurations using the company's first active salary structure,
     * auto-creating a default one if none exists.
     *
     * @param companyId - The numeric ID of the company.
     * @param deductions - An array of deduction configuration objects to create.
     * @returns An object containing the count of created items and the items themselves.
     */
    async saveDeductionConfigurationsSimple(
        companyId: number,
        deductions: {
            deductionType: string;
            label: string;
            isMandatory?: boolean;
            isStatutory?: boolean;
            calculationType?: string | null;
            calculationBasis?: string | null;
            amount?: number | null;
            percent?: number | null;
        }[]
    ) {
        let structure = await prisma.salaryStructure.findFirst({
            where: { companyId, isActive: true },
            orderBy: { createdAt: 'asc' }
        });

        if (!structure) {
            structure = await prisma.salaryStructure.create({
                data: { companyId, name: 'Default', description: 'Auto-created default salary structure' }
            });
        }

        return this.saveDeductionConfigurations(companyId, structure.id, deductions);
    }

    // =========================================================================
    // PAYROLL BATCH (Auto-generation)
    // =========================================================================

    private numberToBatchName(n: number): string {
        let name = "";
        while (n >= 0) {
            name = String.fromCharCode(65 + (n % 26)) + name;
            n = Math.floor(n / 26) - 1;
        }
        return name;
    }

    async generateBatches(companyId: number, payrollPeriodId: string, batchSize: number) {
        // Verify the period belongs to the company
        const period = await prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, companyId } });
        if (!period) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }

        // Fetch all ACTIVE employees for this company, sorted alphabetically
        const employees = await prisma.employee.findMany({
            where: { companyId, status: "ACTIVE" },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
            select: { id: true },
        });

        if (employees.length === 0) {
            throw new CustomError(httpStatus.BAD_REQUEST, "No active employees found for this company");
        }

        // Delete any existing DRAFT batches for this period (to allow regeneration)
        const existingDraftBatches = await prisma.payrollBatch.findMany({
            where: { payrollPeriodId, status: "DRAFT" },
            select: { id: true },
        });
        if (existingDraftBatches.length > 0) {
            await prisma.payrollBatchEmployee.deleteMany({
                where: { payrollBatchId: { in: existingDraftBatches.map(b => b.id) } },
            });
            await prisma.payrollBatch.deleteMany({
                where: { id: { in: existingDraftBatches.map(b => b.id) } },
            });
        }

        // Chunk employees into batches
        const batches: { name: string; employeeIds: string[] }[] = [];
        for (let i = 0; i < employees.length; i += batchSize) {
            const chunk = employees.slice(i, i + batchSize);
            batches.push({
                name: `Batch ${this.numberToBatchName(batches.length)}`,
                employeeIds: chunk.map(e => e.id),
            });
        }

        // Create batches and employee assignments in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const created = await Promise.all(
                batches.map(b =>
                    tx.payrollBatch.create({
                        data: {
                            name: b.name,
                            payrollPeriodId,
                            employees: {
                                create: b.employeeIds.map(eid => ({
                                    employeeId: eid,
                                    payrollPeriodId,
                                })),
                            },
                        },
                        include: { _count: { select: { employees: true } } },
                    })
                )
            );
            return created;
        });

        return { batches: result, totalEmployees: employees.length, batchCount: result.length };
    }

    async updateBatchName(companyId: number, batchId: string, name: string) {
        const batch = await prisma.payrollBatch.findFirst({
            where: { id: batchId, payrollPeriod: { companyId } },
        });
        if (!batch) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Batch not found or unauthorized");
        }
        const updated = await prisma.payrollBatch.update({
            where: { id: batchId },
            data: { name },
        });
        return updated;
    }

    async activateBatch(companyId: number, batchId: string) {
        const batch = await prisma.payrollBatch.findFirst({
            where: { id: batchId, payrollPeriod: { companyId } },
        });
        if (!batch) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Batch not found or unauthorized");
        }
        this.assertBatchTransition('activate', batch.status);
        const updated = await prisma.payrollBatch.update({
            where: { id: batchId },
            data: { status: 'ACTIVE' as any },
        });
        return updated;
    }

    async closeBatch(companyId: number, batchId: string) {
        const batch = await prisma.payrollBatch.findFirst({
            where: { id: batchId, payrollPeriod: { companyId } },
        });
        if (!batch) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Batch not found or unauthorized");
        }
        this.assertBatchTransition('close', batch.status);
        const updated = await prisma.payrollBatch.update({
            where: { id: batchId },
            data: { status: 'CLOSED' as any },
        });
        return updated;
    }

    async archiveBatch(companyId: number, batchId: string) {
        const batch = await prisma.payrollBatch.findFirst({
            where: { id: batchId, payrollPeriod: { companyId } },
        });
        if (!batch) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Batch not found or unauthorized");
        }
        this.assertBatchTransition('archive', batch.status);
        const updated = await prisma.payrollBatch.update({
            where: { id: batchId },
            data: { status: 'ARCHIVED' as any },
        });
        return updated;
    }

    async listBatchesByPeriod(companyId: number, payrollPeriodId: string, page: number, limit: number) {
        // Verify the period belongs to this company
        const period = await prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, companyId } });
        if (!period) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Period not found or unauthorized");
        }

        const skip = (page - 1) * limit;

        const [batches, totalItems] = await Promise.all([
            prisma.payrollBatch.findMany({
                where: { payrollPeriodId },
                skip,
                take: limit,
                orderBy: { name: "asc" },
                include: { _count: { select: { employees: true } } },
            }),
            prisma.payrollBatch.count({ where: { payrollPeriodId } }),
        ]);

        return { batches, totalItems, totalPages: Math.ceil(totalItems / limit) };
    }

    async listBatchEmployees(companyId: number, batchId: string, page: number, limit: number, search?: string) {
        // Verify the batch belongs to this company via its payroll period
        const batch = await prisma.payrollBatch.findFirst({
            where: { id: batchId, payrollPeriod: { companyId } },
        });
        if (!batch) {
            throw new CustomError(httpStatus.NOT_FOUND, "Payroll Batch not found or unauthorized");
        }

        const skip = (page - 1) * limit;

        const where: any = { payrollBatchId: batchId };
        if (search) {
            where.employee = {
                OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { externalId: { contains: search, mode: "insensitive" } },
                ],
            };
        }

        try {
            const [items, totalItems] = await Promise.all([
                prisma.payrollBatchEmployee.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                    employee: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            externalId: true,
                            department: { select: { name: true } },
                            position: { select: { title: true } },
                        },
                    },
                    },
                    orderBy: { employee: { firstName: "asc" } },
                }),
                prisma.payrollBatchEmployee.count({ where }),
            ]);

            return { items, totalItems, totalPages: Math.ceil(totalItems / limit) };
        } catch (error) {
            console.error("[listBatchEmployees] Prisma error:", error);
            throw error;
        }
    }

    // =========================================================================
    // PAYSLIP NOTIFICATION SETTINGS
    // =========================================================================

    /**
     * Retrieves the payslip notification settings for a company (singleton).
     * Returns defaults if no settings have been configured yet.
     *
     * @param companyId - The numeric ID of the company.
     * @returns The payslip notification settings record or default values.
     */
    async getPayslipNotificationSettings(companyId: number) {
        const settings = await prisma.payslipNotificationSettings.findUnique({
            where: { companyId },
        });
        if (!settings) {
            return {
                companyId,
                emailNotifications: true,
                smsNotifications: false,
                pushNotifications: false,
                inAppNotifications: false,
                digestFrequency: 'WEEKLY',
                payslipFormat: 'PDF',
                emailTemplate: null,
                deliveryTriggers: null,
            };
        }
        return settings;
    }

    /**
     * Saves (upserts) the payslip notification settings for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param data - The notification settings data.
     * @returns The upserted payslip notification settings record.
     */
    async savePayslipNotificationSettings(companyId: number, data: any) {
        const settings = await prisma.payslipNotificationSettings.upsert({
            where: { companyId },
            update: {
                ...(data.emailNotifications !== undefined && { emailNotifications: data.emailNotifications }),
                ...(data.smsNotifications !== undefined && { smsNotifications: data.smsNotifications }),
                ...(data.pushNotifications !== undefined && { pushNotifications: data.pushNotifications }),
                ...(data.inAppNotifications !== undefined && { inAppNotifications: data.inAppNotifications }),
                ...(data.digestFrequency !== undefined && { digestFrequency: data.digestFrequency as any }),
                ...(data.payslipFormat !== undefined && { payslipFormat: data.payslipFormat as any }),
                ...(data.emailTemplate !== undefined && { emailTemplate: data.emailTemplate }),
                ...(data.deliveryTriggers !== undefined && { deliveryTriggers: JSON.stringify(data.deliveryTriggers) }),
            },
            create: {
                companyId,
                emailNotifications: data.emailNotifications ?? true,
                smsNotifications: data.smsNotifications ?? false,
                pushNotifications: data.pushNotifications ?? false,
                inAppNotifications: data.inAppNotifications ?? false,
                digestFrequency: (data.digestFrequency as any) ?? 'WEEKLY',
                payslipFormat: (data.payslipFormat as any) ?? 'PDF',
                emailTemplate: data.emailTemplate ?? null,
                deliveryTriggers: data.deliveryTriggers ? JSON.stringify(data.deliveryTriggers) : null,
            },
        });
        return settings;
    }

    // =========================================================================
    // SYSTEM CURRENCY
    // =========================================================================

    /**
     * Retrieves all system currencies for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @returns An array of currency records.
     */
    async getAllCurrencies(companyId: number) {
        const currencies = await prisma.systemCurrency.findMany({
            where: { companyId },
            orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
            include: { _count: { select: { ratesFrom: true } } },
        });
        return currencies;
    }

    /**
    * Retrieves a single system currency by ID.
    *
    * @param companyId - The numeric ID of the company.
    * @param id - The unique ID of the currency.
    * @returns The currency record.
    * @throws {CustomError} If not found.
    */
    async getCurrency(companyId: number, id: string) {
        const currency = await prisma.systemCurrency.findFirst({ where: { id, companyId } });
        if (!currency) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency not found");
        }
        return currency;
    }

    /**
     * Creates a new system currency for a company.
     *
     * @param companyId - The numeric ID of the company.
     * @param data - The currency data.
     * @returns The created currency record.
     */
    async createCurrency(companyId: number, data: any) {
        const currency = await prisma.systemCurrency.create({
            data: {
                companyId,
                code: data.code,
                name: data.name,
                symbol: data.symbol,
                decimalPlaces: data.decimalPlaces ?? 2,
                roundingRule: data.roundingRule ?? 'ROUND_HALF_UP',
                isBase: data.isBase ?? false,
                isActive: data.isActive ?? true,
                autoFetchRate: data.autoFetchRate ?? false,
            }
        });

        // If this currency is marked as base and no base currency exists, set it
        if (data.isBase) {
            await this.setBaseCurrency(companyId, currency.id);
        }

        return currency;
    }

    /**
     * Updates an existing system currency.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency.
     * @param data - Partial data to update.
     * @returns The updated currency record.
     * @throws {CustomError} If not found or attempting to deactivate the base currency.
     */
    async updateCurrency(companyId: number, id: string, data: any) {
        const existing = await prisma.systemCurrency.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency not found or unauthorized");
        }

        // Prevent deactivating the base currency
        if (existing.isBase && data.isActive === false) {
            throw new CustomError(httpStatus.CONFLICT, "Cannot deactivate the base currency. Set a different base currency first.");
        }

        const updateData: any = {};
        if (data.code !== undefined) updateData.code = data.code;
        if (data.name !== undefined) updateData.name = data.name;
        if (data.symbol !== undefined) updateData.symbol = data.symbol;
        if (data.decimalPlaces !== undefined) updateData.decimalPlaces = data.decimalPlaces;
        if (data.roundingRule !== undefined) updateData.roundingRule = data.roundingRule;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.autoFetchRate !== undefined) updateData.autoFetchRate = data.autoFetchRate;

        // Handle base currency change
        if (data.isBase === true && !existing.isBase) {
            // Unset current base currency first
            await prisma.company.update({
                where: { id: companyId },
                data: { baseCurrencyId: null },
            });
            await prisma.systemCurrency.updateMany({
                where: { companyId, isBase: true },
                data: { isBase: false },
            });
            updateData.isBase = true;
            // Update company baseCurrencyId after the currency update
            await prisma.company.update({
                where: { id: companyId },
                data: { baseCurrencyId: id },
            });
        }

        const currency = await prisma.systemCurrency.update({
            where: { id },
            data: updateData,
        });
        return currency;
    }

    /**
     * Deletes a system currency.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency to delete.
     * @returns The deleted currency record.
     * @throws {CustomError} If it is the base currency or has associated rates.
     */
    async deleteCurrency(companyId: number, id: string) {
        const existing = await prisma.systemCurrency.findFirst({
            where: { id, companyId },
            include: { _count: { select: { ratesFrom: true } } },
        });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency not found or unauthorized");
        }
        if (existing.isBase) {
            throw new CustomError(httpStatus.CONFLICT, "Cannot delete the base currency. Set a different base currency first.");
        }
        // Delete associated rates first
        await prisma.currencyRate.deleteMany({
            where: { OR: [{ fromCurrencyId: id }, { toCurrencyId: id }] },
        });
        await prisma.systemCurrency.delete({ where: { id } });
        return existing;
    }

    /**
     * Sets a system currency as the base currency for the company.
     * Unsets the previous base currency.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency to set as base.
     * @returns The updated currency record.
     */
    async setBaseCurrency(companyId: number, id: string) {
        const currency = await prisma.systemCurrency.findFirst({ where: { id, companyId } });
        if (!currency) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency not found or unauthorized");
        }

        // Unset current base
        await prisma.company.update({
            where: { id: companyId },
            data: { baseCurrencyId: null },
        });
        await prisma.systemCurrency.updateMany({
            where: { companyId, isBase: true },
            data: { isBase: false },
        });

        // Set new base
        await prisma.systemCurrency.update({
            where: { id },
            data: { isBase: true },
        });
        await prisma.company.update({
            where: { id: companyId },
            data: { baseCurrencyId: id },
        });

        return { ...currency, isBase: true };
    }

    // =========================================================================
    // CURRENCY RATE
    // =========================================================================

    /**
     * Creates a new currency exchange rate.
     *
     * @param companyId - The numeric ID of the company.
     * @param data - The currency rate data (fromCurrencyId, toCurrencyId, rate, source, overrideReason, effectiveDate).
     * @returns The newly created currency rate record.
     */
    async createCurrencyRate(companyId: number, data: any) {
        const currencyRate = await prisma.currencyRate.create({
            data: {
                companyId,
                fromCurrencyId: data.fromCurrencyId,
                toCurrencyId: data.toCurrencyId,
                rate: data.rate,
                source: data.source ?? 'MANUAL',
                overrideReason: data.overrideReason ?? null,
                effectiveDate: this.toDate(data.effectiveDate)!,
            },
            include: {
                fromCurrency: true,
                toCurrency: true,
            },
        });
        return currencyRate;
    }

    /**
     * Updates an existing currency exchange rate.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency rate to update.
     * @param data - Partial data object with fields to update.
     * @returns The updated currency rate record.
     * @throws {CustomError} If the currency rate is not found.
     */
    async updateCurrencyRate(companyId: number, id: string, data: any) {
        const existing = await prisma.currencyRate.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency Rate not found");
        }
        const updateData: any = {};
        if (data.fromCurrencyId !== undefined) updateData.fromCurrencyId = data.fromCurrencyId;
        if (data.toCurrencyId !== undefined) updateData.toCurrencyId = data.toCurrencyId;
        if (data.rate !== undefined) updateData.rate = data.rate;
        if (data.source !== undefined) updateData.source = data.source;
        if (data.overrideReason !== undefined) updateData.overrideReason = data.overrideReason;
        if (data.effectiveDate !== undefined) updateData.effectiveDate = this.toDate(data.effectiveDate)!;

        const currencyRate = await prisma.currencyRate.update({
            where: { id },
            data: updateData,
            include: {
                fromCurrency: true,
                toCurrency: true,
            },
        });
        return currencyRate;
    }

    /**
     * Deletes a currency exchange rate by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency rate to delete.
     * @returns The deleted currency rate record.
     * @throws {CustomError} If the currency rate is not found.
     */
    async deleteCurrencyRate(companyId: number, id: string) {
        const existing = await prisma.currencyRate.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency Rate not found");
        }
        await prisma.currencyRate.delete({ where: { id } });
        return existing;
    }

    /**
     * Retrieves a single currency exchange rate by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the currency rate.
     * @returns The currency rate record with related currencies.
     * @throws {CustomError} If the currency rate is not found.
     */
    async getCurrencyRate(companyId: number, id: string) {
        const rate = await prisma.currencyRate.findFirst({
            where: { id, companyId },
            include: {
                fromCurrency: true,
                toCurrency: true,
            },
        });
        if (!rate) {
            throw new CustomError(httpStatus.NOT_FOUND, "Currency Rate not found");
        }
        return rate;
    }

    /**
     * Retrieves all currency exchange rates for a company with optional pagination.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of items to skip.
     * @param take - The number of items to take.
     * @returns An object containing the rates array and totalItems count.
     */
    async getAllCurrencyRates(companyId: number, skip: number = 0, take: number = 100) {
        const [rates, totalItems] = await Promise.all([
            prisma.currencyRate.findMany({
                where: { companyId },
                orderBy: { effectiveDate: 'desc' },
                skip,
                take,
                include: {
                    fromCurrency: true,
                    toCurrency: true,
                },
            }),
            prisma.currencyRate.count({ where: { companyId } }),
        ]);
        return { rates, totalItems };
    }

    /**
     * Saves a batch array of currency rate configurations (upsert).
     *
     * @param companyId - The numeric ID of the company.
     * @param rates - Array of currency rate data objects.
     * @returns The saved currency rate records.
     */
    async saveCurrencyRates(companyId: number, rates: any[]) {
        const results: any[] = [];
        for (const item of rates) {
            if (item.id) {
                const updated = await prisma.currencyRate.update({
                    where: { id: item.id },
                    data: {
                        fromCurrencyId: item.fromCurrencyId,
                        toCurrencyId: item.toCurrencyId,
                        rate: item.rate,
                        source: item.source ?? 'MANUAL',
                        overrideReason: item.overrideReason ?? null,
                        effectiveDate: this.toDate(item.effectiveDate)!,
                    },
                    include: {
                        fromCurrency: true,
                        toCurrency: true,
                    },
                });
                results.push(updated);
            } else {
                const created = await prisma.currencyRate.create({
                    data: {
                        companyId,
                        fromCurrencyId: item.fromCurrencyId,
                        toCurrencyId: item.toCurrencyId,
                        rate: item.rate,
                        source: item.source ?? 'MANUAL',
                        overrideReason: item.overrideReason ?? null,
                        effectiveDate: this.toDate(item.effectiveDate)!,
                    },
                    include: {
                        fromCurrency: true,
                        toCurrency: true,
                    },
                });
                results.push(created);
            }
        }
        return results;
    }

    // =========================================================================
    // PAY FREQUENCY
    // =========================================================================

    /**
     * Creates a new pay frequency configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param data - The pay frequency data object.
     * @returns The newly created pay frequency record.
     */
    async createPayFrequency(companyId: number, data: any) {
        const payFreq = await prisma.payFrequency.create({
            data: {
                companyId,
                name: data.name,
                frequency: data.frequency as any,
                periodsPerYear: data.periodsPerYear,
                isActive: data.isActive ?? true,
                payDayRule: data.payDayRule ?? null,
                fixedPayDate: data.fixedPayDate ?? null,
                offsetDays: data.offsetDays ?? null,
                weekendRollover: data.weekendRollover ?? null,
                holidayRollover: data.holidayRollover ?? null,
                applicableEmployeeGroup: data.applicableEmployeeGroup ?? null,
                autoGeneratePeriods: data.autoGeneratePeriods ?? true,
                dailyRateBasis: data.dailyRateBasis ?? null,
                workingDaysPerYear: data.workingDaysPerYear ?? null,
                minimumPayableDays: data.minimumPayableDays ?? null,
                overtimeEligible: data.overtimeEligible ?? true,
            }
        });
        return payFreq;
    }

    /**
     * Updates an existing pay frequency configuration.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pay frequency to update.
     * @param data - Partial pay frequency data object with fields to update.
     * @returns The updated pay frequency record.
     * @throws {CustomError} If the pay frequency is not found or unauthorized.
     */
    async updatePayFrequency(companyId: number, id: string, data: any) {
        const existing = await prisma.payFrequency.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pay Frequency not found or unauthorized");
        }
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.frequency !== undefined) updateData.frequency = data.frequency as any;
        if (data.periodsPerYear !== undefined) updateData.periodsPerYear = data.periodsPerYear;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.payDayRule !== undefined) updateData.payDayRule = data.payDayRule;
        if (data.fixedPayDate !== undefined) updateData.fixedPayDate = data.fixedPayDate;
        if (data.offsetDays !== undefined) updateData.offsetDays = data.offsetDays;
        if (data.weekendRollover !== undefined) updateData.weekendRollover = data.weekendRollover;
        if (data.holidayRollover !== undefined) updateData.holidayRollover = data.holidayRollover;
        if (data.applicableEmployeeGroup !== undefined) updateData.applicableEmployeeGroup = data.applicableEmployeeGroup;
        if (data.autoGeneratePeriods !== undefined) updateData.autoGeneratePeriods = data.autoGeneratePeriods;
        if (data.dailyRateBasis !== undefined) updateData.dailyRateBasis = data.dailyRateBasis;
        if (data.workingDaysPerYear !== undefined) updateData.workingDaysPerYear = data.workingDaysPerYear;
        if (data.minimumPayableDays !== undefined) updateData.minimumPayableDays = data.minimumPayableDays;
        if (data.overtimeEligible !== undefined) updateData.overtimeEligible = data.overtimeEligible;
        const payFreq = await prisma.payFrequency.update({
            where: { id },
            data: updateData,
        });
        return payFreq;
    }

    /**
     * Deletes a pay frequency configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pay frequency to delete.
     * @returns The deleted pay frequency record.
     * @throws {CustomError} If the pay frequency is not found or unauthorized.
     */
    async deletePayFrequency(companyId: number, id: string) {
        const existing = await prisma.payFrequency.findFirst({ where: { id, companyId } });
        if (!existing) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pay Frequency not found or unauthorized");
        }
        await prisma.payFrequency.delete({ where: { id } });
        return existing;
    }

    /**
     * Retrieves a single pay frequency configuration by ID.
     *
     * @param companyId - The numeric ID of the company.
     * @param id - The unique ID of the pay frequency.
     * @returns The pay frequency record.
     * @throws {CustomError} If the pay frequency is not found or unauthorized.
     */
    async getPayFrequency(companyId: number, id: string) {
        const freq = await prisma.payFrequency.findFirst({ where: { id, companyId } });
        if (!freq) {
            throw new CustomError(httpStatus.NOT_FOUND, "Pay Frequency not found or unauthorized");
        }
        return freq;
    }

    /**
     * Retrieves all pay frequency configurations for a company with optional pagination.
     *
     * @param companyId - The numeric ID of the company.
     * @param skip - The number of items to skip.
     * @param take - The number of items to take.
     * @returns An object containing the frequencies array and totalItems count.
     */
    async getAllPayFrequencies(companyId: number, skip: number = 0, take: number = 100) {
        const [frequencies, totalItems] = await Promise.all([
            prisma.payFrequency.findMany({
                where: { companyId },
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
            prisma.payFrequency.count({ where: { companyId } }),
        ]);
        return { frequencies, totalItems };
    }

    /**
     * Saves a batch array of pay frequency configurations (upsert).
     *
     * @param companyId - The numeric ID of the company.
     * @param frequencies - Array of pay frequency data objects.
     * @returns The saved pay frequency records.
     */
    async savePayFrequencies(companyId: number, frequencies: any[]) {
        const results: any[] = [];
        for (const item of frequencies) {
            if (item.id) {
                const updated = await prisma.payFrequency.update({
                    where: { id: item.id },
                    data: {
                        name: item.name,
                        frequency: item.frequency as any,
                        periodsPerYear: item.periodsPerYear,
                        isActive: item.isActive ?? true,
                        payDayRule: item.payDayRule ?? null,
                        fixedPayDate: item.fixedPayDate ?? null,
                        offsetDays: item.offsetDays ?? null,
                        weekendRollover: item.weekendRollover ?? null,
                        holidayRollover: item.holidayRollover ?? null,
                        applicableEmployeeGroup: item.applicableEmployeeGroup ?? null,
                        autoGeneratePeriods: item.autoGeneratePeriods ?? true,
                        dailyRateBasis: item.dailyRateBasis ?? null,
                        workingDaysPerYear: item.workingDaysPerYear ?? null,
                        minimumPayableDays: item.minimumPayableDays ?? null,
                        overtimeEligible: item.overtimeEligible ?? true,
                    }
                });
                results.push(updated);
            } else {
                const created = await prisma.payFrequency.create({
                    data: {
                        companyId,
                        name: item.name,
                        frequency: item.frequency as any,
                        periodsPerYear: item.periodsPerYear,
                        isActive: item.isActive ?? true,
                        payDayRule: item.payDayRule ?? null,
                        fixedPayDate: item.fixedPayDate ?? null,
                        offsetDays: item.offsetDays ?? null,
                        weekendRollover: item.weekendRollover ?? null,
                        holidayRollover: item.holidayRollover ?? null,
                        applicableEmployeeGroup: item.applicableEmployeeGroup ?? null,
                        autoGeneratePeriods: item.autoGeneratePeriods ?? true,
                        dailyRateBasis: item.dailyRateBasis ?? null,
                        workingDaysPerYear: item.workingDaysPerYear ?? null,
                        minimumPayableDays: item.minimumPayableDays ?? null,
                        overtimeEligible: item.overtimeEligible ?? true,
                    }
                });
                results.push(created);
            }
        }
        return results;
    }

}

export const payrollConfigurationService = new PayrollConfigurationService();
