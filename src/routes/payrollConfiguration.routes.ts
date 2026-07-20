import { Router } from "express";
import { PayrollConfiguration } from "../controllers/payrollConfiguration.controller";
import { EmployeeDeductionController } from "../controllers/employeeDeduction.controller";
import { EmployeeController } from "../controllers/employee.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { validate } from "../middlewares/validation";

import {
    createFiscalYearSchema, updateFiscalYearSchema, saveFiscalYearBatchSchema,
    createTaxBracketSchema, updateTaxBracketSchema, saveTaxBracketBatchSchema,
    createPensionRuleSchema, updatePensionRuleSchema, savePensionRuleBatchSchema,
    createOvertimeRuleSchema, updateOvertimeRuleSchema, saveOvertimeBatchSchema,
    createPayrollPeriodSchema, updatePayrollPeriodSchema, savePayrollPeriodSchema,
    createSalaryStructureSchema, updateSalaryStructureSchema, saveSalaryStructureBatchSchema,
    createDeductionSchema, createDeductionSimpleSchema, updateDeductionSchema, saveDeductionBatchSchema, saveDeductionSimpleSchema,
    createAllowanceSchema, updateAllowanceSchema, saveAllowanceBatchSchema,
    updateWorkdaysSchema, patchWorkdaysSchema, saveWorkdaysSchema,
    activateFiscalYearSchema, closeFiscalYearSchema, openPayrollPeriodSchema, closePayrollPeriodSchema,
    createEmployeeDeductionSchema, updateEmployeeDeductionSchema, getEmployeeDeductionsSchema, recordPaymentSchema, bulkAssignEmployeeDeductionsSchema,
    generateBatchesSchema, listBatchesByPeriodSchema, listBatchEmployeesSchema, moveBatchEmployeeSchema,
    createPayslipNotificationSettingsSchema, updatePayslipNotificationSettingsSchema, savePayslipNotificationSettingsSchema,
    createSystemCurrencySchema, updateSystemCurrencySchema, setBaseCurrencySchema,
    createCurrencyRateSchema, updateCurrencyRateSchema, saveCurrencyRateBatchSchema,
    createPayFrequencySchema, updatePayFrequencySchema, savePayFrequencyBatchSchema,
} from "../dto/payrollConfiguration.dto";

const router = Router();

// Employee endpoints (for deduction assignment selection)
/**
 * GET /employees — Retrieves all employees for the authenticated company.
 */
router.get("/employees", protect, requireAdmin, EmployeeController.getEmployees);

/**
 * GET /employees/export — Exports all matching employees to XLSX.
 * Must be defined before /:id so "export" is not captured as an id parameter.
 */
router.get("/employees/export", protect, requireAdmin, EmployeeController.exportExcel);

/**
 * GET /employees/:id — Retrieves a single employee by ID.
 */
router.get("/employees/:id", protect, requireAdmin, EmployeeController.getEmployeeById);

// FISCAL YEAR ROUTES
/**
 * POST /fiscal-year — Creates a new fiscal year configuration. Validates the request body using createFiscalYearSchema.
 */
router.post("/fiscal-year", protect, requireAdmin, validate(createFiscalYearSchema), PayrollConfiguration.createFiscalYearConfiguration);

/**
 * PUT /fiscal-year/:id — Updates an existing fiscal year configuration. Validates the request body using updateFiscalYearSchema.
 */
router.put("/fiscal-year/:id", protect, requireAdmin, validate(updateFiscalYearSchema), PayrollConfiguration.updateFiscalYearConfiguration);

/**
 * DELETE /fiscal-year/:id — Deletes a fiscal year configuration by ID.
 */
router.delete("/fiscal-year/:id", protect, requireAdmin, PayrollConfiguration.deleteFiscalYearConfiguration);

/**
 * GET /fiscal-year/:id — Retrieves a single fiscal year configuration by ID.
 */
router.get("/fiscal-year/:id", protect, requireAdmin, PayrollConfiguration.getFiscalYearConfiguration);

/**
 * GET /fiscal-years — Retrieves all fiscal year configurations for the authenticated company.
 */
router.get("/fiscal-years", protect, requireAdmin, PayrollConfiguration.getAllFiscalYearsConfiguration);

/**
 * POST /fiscal-years/save-configuration — Saves a batch of fiscal year configurations. Validates using saveFiscalYearBatchSchema.
 */
router.post("/fiscal-years/save-configuration", protect, requireAdmin, validate(saveFiscalYearBatchSchema), PayrollConfiguration.saveFiscalYearConfigurations);

// FISCAL YEAR TRANSITION ROUTES
/**
 * POST /fiscal-year/:id/activate — Activates a fiscal year by ID. Validates the request body using activateFiscalYearSchema.
 */
router.post("/fiscal-year/:id/activate", protect, requireAdmin, validate(activateFiscalYearSchema), PayrollConfiguration.activateFiscalYear);

/**
 * POST /fiscal-year/:id/close — Closes a fiscal year by ID. Validates the request body using closeFiscalYearSchema.
 */
router.post("/fiscal-year/:id/close", protect, requireAdmin, validate(closeFiscalYearSchema), PayrollConfiguration.closeFiscalYear);

// TAX BRACKET ROUTES
/**
 * POST /tax-bracket — Creates a new tax bracket configuration. Validates the request body using createTaxBracketSchema.
 */
router.post("/tax-bracket", protect, requireAdmin, validate(createTaxBracketSchema), PayrollConfiguration.createTaxBracketConfiguration);

/**
 * PUT /tax-bracket/:id — Updates an existing tax bracket configuration. Validates the request body using updateTaxBracketSchema.
 */
router.put("/tax-bracket/:id", protect, requireAdmin, validate(updateTaxBracketSchema), PayrollConfiguration.updateTaxBracketConfiguration);

/**
 * DELETE /tax-bracket/:id — Deletes a tax bracket configuration by ID.
 */
router.delete("/tax-bracket/:id", protect, requireAdmin, PayrollConfiguration.deleteTaxBracketConfiguration);

/**
 * GET /tax-bracket/:id — Retrieves a single tax bracket configuration by ID.
 */
router.get("/tax-bracket/:id", protect, requireAdmin, PayrollConfiguration.getTaxBracketConfiguration);

/**
 * GET /tax-brackets — Retrieves all tax bracket configurations.
 */
router.get("/tax-brackets", protect, requireAdmin, PayrollConfiguration.getAllTaxBracketsConfiguration);

/**
 * POST /tax-brackets/save-configuration — Saves a batch of tax bracket configurations. Validates using saveTaxBracketBatchSchema.
 */
router.post("/tax-brackets/save-configuration", protect, requireAdmin, validate(saveTaxBracketBatchSchema), PayrollConfiguration.saveTaxBracketConfigurations);

// PENSION RULE ROUTES
/**
 * POST /pension-rule — Creates a new pension rule configuration. Validates the request body using createPensionRuleSchema.
 */
router.post("/pension-rule", protect, requireAdmin, validate(createPensionRuleSchema), PayrollConfiguration.createPensionRuleConfiguration);

/**
 * PUT /pension-rule/:id — Updates an existing pension rule configuration. Validates the request body using updatePensionRuleSchema.
 */
router.put("/pension-rule/:id", protect, requireAdmin, validate(updatePensionRuleSchema), PayrollConfiguration.updatePensionRuleConfiguration);

/**
 * DELETE /pension-rule/:id — Deletes a pension rule configuration by ID.
 */
router.delete("/pension-rule/:id", protect, requireAdmin, PayrollConfiguration.deletePensionRuleConfiguration);

/**
 * GET /pension-rule/:id — Retrieves a single pension rule configuration by ID.
 */
router.get("/pension-rule/:id", protect, requireAdmin, PayrollConfiguration.getPensionRuleConfiguration);

/**
 * GET /pension-rules — Retrieves all pension rule configurations.
 */
router.get("/pension-rules", protect, requireAdmin, PayrollConfiguration.getAllPensionRulesConfiguration);

/**
 * POST /pension-rules/save-configuration — Saves a batch of pension rule configurations. Validates using savePensionRuleBatchSchema.
 */
router.post("/pension-rules/save-configuration", protect, requireAdmin, validate(savePensionRuleBatchSchema), PayrollConfiguration.savePensionRuleConfigurations);

// OVERTIME RULE ROUTES
/**
 * POST /overtime-rule — Creates a new overtime rule configuration. Validates the request body using createOvertimeRuleSchema.
 */
router.post("/overtime-rule", protect, requireAdmin, validate(createOvertimeRuleSchema), PayrollConfiguration.createOvertimeRuleConfiguration);

/**
 * PUT /overtime-rule/:id — Updates an existing overtime rule configuration. Validates the request body using updateOvertimeRuleSchema.
 */
router.put("/overtime-rule/:id", protect, requireAdmin, validate(updateOvertimeRuleSchema), PayrollConfiguration.updateOvertimeRuleConfiguration);

/**
 * DELETE /overtime-rule/:id — Deletes an overtime rule configuration by ID.
 */
router.delete("/overtime-rule/:id", protect, requireAdmin, PayrollConfiguration.deleteOvertimeRuleConfiguration);

/**
 * GET /overtime-rule/:id — Retrieves a single overtime rule configuration by ID.
 */
router.get("/overtime-rule/:id", protect, requireAdmin, PayrollConfiguration.getOvertimeRuleConfiguration);

/**
 * GET /overtime-rules — Retrieves all overtime rule configurations.
 */
router.get("/overtime-rules", protect, requireAdmin, PayrollConfiguration.getAllOvertimeRulesConfiguration);

/**
 * POST /overtime-rules/save-configuration — Saves a batch of overtime rule configurations. Validates using saveOvertimeBatchSchema.
 */
router.post("/overtime-rules/save-configuration", protect, requireAdmin, validate(saveOvertimeBatchSchema), PayrollConfiguration.saveOvertimeConfigurations);

// PAYROLL PERIOD ROUTES
/**
 * POST /payroll-period — Creates a new payroll period configuration. Validates the request body using createPayrollPeriodSchema.
 */
router.post("/payroll-period", protect, requireAdmin, validate(createPayrollPeriodSchema), PayrollConfiguration.createPayrollPeriodConfiguration);

/**
 * GET /payroll-period/current — Retrieves the current active payroll period configuration.
 * Defined before /:id so "current" is not captured as an id parameter.
 */
router.get("/payroll-period/current", protect, requireAdmin, PayrollConfiguration.getCurrentPayrollPeriodConfiguration);

/**
 * GET /payroll-period/:id — Retrieves a single payroll period configuration by ID.
 */
router.get("/payroll-period/:id", protect, requireAdmin, PayrollConfiguration.getPayrollPeriodConfiguration);

/**
 * PUT /payroll-period/:id — Updates an existing payroll period configuration. Validates the request body using updatePayrollPeriodSchema.
 */
router.put("/payroll-period/:id", protect, requireAdmin, validate(updatePayrollPeriodSchema), PayrollConfiguration.updatePayrollPeriodConfiguration);

/**
 * DELETE /payroll-period/:id — Deletes a payroll period configuration by ID.
 */
router.delete("/payroll-period/:id", protect, requireAdmin, PayrollConfiguration.deletePayrollPeriodConfiguration);

/**
 * GET /payroll-periods — Retrieves all payroll period configurations.
 */
router.get("/payroll-periods", protect, requireAdmin, PayrollConfiguration.getAllPayrollPeriodsConfiguration);

/**
 * POST /payroll-period/preview — Previews payroll period fields based on dates.
 */
router.post("/payroll-period/preview", protect, requireAdmin, PayrollConfiguration.previewPayrollPeriodFields);

/**
 * POST /payroll-periods/save-configuration — Saves a batch of payroll period configurations. Validates using savePayrollPeriodSchema.
 */
router.post("/payroll-periods/save-configuration", protect, requireAdmin, validate(savePayrollPeriodSchema), PayrollConfiguration.savePayrollPeriodConfiguration);

// PAYROLL PERIOD TRANSITION ROUTES
/**
 * POST /payroll-period/:id/open — Opens a payroll period by ID. Validates the request body using openPayrollPeriodSchema.
 */
router.post("/payroll-period/:id/open", protect, requireAdmin, validate(openPayrollPeriodSchema), PayrollConfiguration.openPayrollPeriod);

/**
 * POST /payroll-period/:id/close — Closes a payroll period by ID. Validates the request body using closePayrollPeriodSchema.
 */
router.post("/payroll-period/:id/close", protect, requireAdmin, validate(closePayrollPeriodSchema), PayrollConfiguration.closePayrollPeriod);

// SALARY STRUCTURE ROUTES
/**
 * POST /salary-structure — Creates a new salary structure. Validates the request body using createSalaryStructureSchema.
 */
router.post("/salary-structure", protect, requireAdmin, validate(createSalaryStructureSchema), PayrollConfiguration.createSalaryStructure);

/**
 * PUT /salary-structure/:id — Updates an existing salary structure. Validates the request body using updateSalaryStructureSchema.
 */
router.put("/salary-structure/:id", protect, requireAdmin, validate(updateSalaryStructureSchema), PayrollConfiguration.updateSalaryStructure);

/**
 * DELETE /salary-structure/:id — Deletes a salary structure by ID.
 */
router.delete("/salary-structure/:id", protect, requireAdmin, PayrollConfiguration.deleteSalaryStructure);

/**
 * GET /salary-structure/:id — Retrieves a single salary structure by ID.
 */
router.get("/salary-structure/:id", protect, requireAdmin, PayrollConfiguration.getSalaryStructure);

/**
 * GET /salary-structures — Retrieves all salary structures.
 */
router.get("/salary-structures", protect, requireAdmin, PayrollConfiguration.getAllSalaryStructures);

/**
 * POST /salary-structures/save-configuration — Saves a batch of salary structure configurations. Validates using saveSalaryStructureBatchSchema.
 */
router.post("/salary-structures/save-configuration", protect, requireAdmin, validate(saveSalaryStructureBatchSchema), PayrollConfiguration.saveSalaryStructureConfigurations);

// DEDUCTION CONFIGURATION ROUTES
/**
 * POST /deduction-config — Creates a new deduction configuration (simple variant). Validates using createDeductionSimpleSchema.
 */
router.post("/deduction-config", protect, requireAdmin, validate(createDeductionSimpleSchema), PayrollConfiguration.createDeductionConfigurationSimple);

/**
 * POST /deduction-config/:salaryStructureId — Creates a new deduction configuration under a salary structure. Validates using createDeductionSchema.
 */
router.post("/deduction-config/:salaryStructureId", protect, requireAdmin, validate(createDeductionSchema), PayrollConfiguration.createDeductionConfiguration);

/**
 * PUT /deduction-config/:id — Updates an existing deduction configuration. Validates the request body using updateDeductionSchema.
 */
router.put("/deduction-config/:id", protect, requireAdmin, validate(updateDeductionSchema), PayrollConfiguration.updateDeductionConfiguration);

/**
 * DELETE /deduction-config/:id — Deletes a deduction configuration by ID.
 */
router.delete("/deduction-config/:id", protect, requireAdmin, PayrollConfiguration.deleteDeductionConfiguration);

/**
 * GET /deduction-config/:id — Retrieves a single deduction configuration by ID.
 */
router.get("/deduction-config/:id", protect, requireAdmin, PayrollConfiguration.getDeductionConfiguration);

/**
 * GET /deduction-configs — Retrieves all deduction configurations.
 */
router.get("/deduction-configs", protect, requireAdmin, PayrollConfiguration.getAllDeductionConfigurations);

/**
 * POST /salary-structure/:salaryStructureId/deduction-configs/save-configuration — Saves a batch of deduction configurations under a salary structure. Validates using saveDeductionBatchSchema.
 */
router.post("/salary-structure/:salaryStructureId/deduction-configs/save-configuration", protect, requireAdmin, validate(saveDeductionBatchSchema), PayrollConfiguration.saveDeductionConfigurations);

/**
 * POST /deduction-configs/save-configuration — Saves a batch of deduction configurations (simple variant). Validates using saveDeductionSimpleSchema.
 */
router.post("/deduction-configs/save-configuration", protect, requireAdmin, validate(saveDeductionSimpleSchema), PayrollConfiguration.saveDeductionConfigurationsSimple);

// ALLOWANCE CONFIGURATION ROUTES
/**
 * POST /allowance-config — Creates a new allowance configuration. Validates the request body using createAllowanceSchema.
 */
router.post("/allowance-config", protect, requireAdmin, validate(createAllowanceSchema), PayrollConfiguration.createAllowanceConfiguration);

/**
 * PUT /allowance-config/:id — Updates an existing allowance configuration. Validates the request body using updateAllowanceSchema.
 */
router.put("/allowance-config/:id", protect, requireAdmin, validate(updateAllowanceSchema), PayrollConfiguration.updateAllowanceConfiguration);

/**
 * DELETE /allowance-config/:id — Deletes an allowance configuration by ID.
 */
router.delete("/allowance-config/:id", protect, requireAdmin, PayrollConfiguration.deleteAllowanceConfiguration);

/**
 * GET /allowance-config/:id — Retrieves a single allowance configuration by ID.
 */
router.get("/allowance-config/:id", protect, requireAdmin, PayrollConfiguration.getAllowanceConfiguration);

/**
 * GET /allowance-configs — Retrieves all allowance configurations.
 */
router.get("/allowance-configs", protect, requireAdmin, PayrollConfiguration.getAllAllowanceConfigurations);

/**
 * POST /allowance-configs/save-configuration — Saves a batch of allowance configurations. Validates using saveAllowanceBatchSchema.
 */
router.post("/allowance-configs/save-configuration", protect, requireAdmin, validate(saveAllowanceBatchSchema), PayrollConfiguration.saveAllowanceConfigurations);

// WORKDAYS CONFIGURATION ROUTES
/**
 * GET /workdays-config — Retrieves the workdays configuration.
 */
router.get("/workdays-config", protect, requireAdmin, PayrollConfiguration.getWorkdaysConfiguration);

/**
 * PUT /workdays-config — Replaces the workdays configuration. Validates the request body using updateWorkdaysSchema.
 */
router.put("/workdays-config", protect, requireAdmin, validate(updateWorkdaysSchema), PayrollConfiguration.updateWorkdaysConfiguration);

/**
 * PATCH /workdays-config — Partially updates the workdays configuration. Validates the request body using patchWorkdaysSchema.
 */
router.patch("/workdays-config", protect, requireAdmin, validate(patchWorkdaysSchema), PayrollConfiguration.patchWorkdaysConfiguration);

/**
 * POST /workdays-config/save-configuration — Saves the workdays configuration. Validates using saveWorkdaysSchema.
 */
router.post("/workdays-config/save-configuration", protect, requireAdmin, validate(saveWorkdaysSchema), PayrollConfiguration.saveWorkdaysConfiguration);

// DEDUCTION CAP ROUTES
/**
 * GET /configuration/deduction-cap — Retrieves the company-wide deduction cap percentage.
 */
router.get("/configuration/deduction-cap", protect, requireAdmin, PayrollConfiguration.getDeductionCap);

/**
 * PUT /configuration/deduction-cap — Updates the company-wide deduction cap percentage.
 */
router.put("/configuration/deduction-cap", protect, requireAdmin, PayrollConfiguration.updateDeductionCap);

// ENUM LOOKUP ROUTES
/**
 * GET /deduction-types — Retrieves the list of available deduction types.
 */
router.get("/deduction-types", protect, requireAdmin, PayrollConfiguration.getDeductionTypes);

/**
 * GET /earning-types — Retrieves the list of available earning types.
 */
router.get("/earning-types", protect, requireAdmin, PayrollConfiguration.getEarningTypes);

// EMPLOYEE DEDUCTION ROUTES (Per-employee deduction assignments like loans, advances, etc.)
/**
 * POST /employee-deduction — Creates a new employee deduction assignment. Validates using createEmployeeDeductionSchema.
 */
router.post("/employee-deduction", protect, requireAdmin, validate(createEmployeeDeductionSchema), EmployeeDeductionController.createEmployeeDeduction);

/**
 * PUT /employee-deduction/:id — Updates an existing employee deduction assignment. Validates using updateEmployeeDeductionSchema.
 */
router.put("/employee-deduction/:id", protect, requireAdmin, validate(updateEmployeeDeductionSchema), EmployeeDeductionController.updateEmployeeDeduction);

/**
 * DELETE /employee-deduction/:id — Deletes an employee deduction assignment by ID.
 */
router.delete("/employee-deduction/:id", protect, requireAdmin, EmployeeDeductionController.deleteEmployeeDeduction);

/**
 * GET /employee-deduction/:id — Retrieves a single employee deduction assignment by ID.
 */
router.get("/employee-deduction/:id", protect, requireAdmin, EmployeeDeductionController.getEmployeeDeduction);

/**
 * GET /employee-deductions — Retrieves employee deduction assignments with optional filtering. Validates query parameters using getEmployeeDeductionsSchema.
 */
router.get("/employee-deductions", protect, requireAdmin, validate(getEmployeeDeductionsSchema), EmployeeDeductionController.getEmployeeDeductions);

/**
 * GET /employee/:employeeId/deductions/active — Retrieves active deductions for a specific employee.
 */
router.get("/employee/:employeeId/deductions/active", protect, requireAdmin, EmployeeDeductionController.getActiveEmployeeDeductions);

/**
 * POST /employee-deduction/:id/record-payment — Records a payment against an employee deduction. Validates using recordPaymentSchema.
 */
router.post("/employee-deduction/:id/record-payment", protect, requireAdmin, validate(recordPaymentSchema), EmployeeDeductionController.recordPayment);

/**
 * POST /employee-deductions/bulk-assign — Bulk assigns deductions to multiple employees. Validates using bulkAssignEmployeeDeductionsSchema.
 */
router.post("/employee-deductions/bulk-assign", protect, requireAdmin, validate(bulkAssignEmployeeDeductionsSchema), EmployeeDeductionController.bulkAssignEmployeeDeductions);

// =========================================================================
// PAYROLL BATCH ROUTES (Auto-generation)
// =========================================================================

/**
 * POST /payroll-batch/generate — Auto-generates employee batches for a payroll period. Validates using generateBatchesSchema.
 */
router.post("/payroll-batch/generate", protect, requireAdmin, validate(generateBatchesSchema), PayrollConfiguration.generateBatches);

/**
 * GET /payroll-batches/by-period — Lists all batches for a payroll period (paginated). Validates using listBatchesByPeriodSchema.
 */
router.get("/payroll-batches/by-period", protect, requireAdmin, validate(listBatchesByPeriodSchema), PayrollConfiguration.listBatchesByPeriod);

/**
 * GET /payroll-batch/employees — Lists all employees in a batch (paginated, searchable). Validates using listBatchEmployeesSchema.
 */
router.get("/payroll-batch/employees", protect, requireAdmin, validate(listBatchEmployeesSchema), PayrollConfiguration.listBatchEmployees);    /**
     * PUT /payroll-batch/:id — Updates a payroll batch name.
     */
    router.put("/payroll-batch/:id", protect, requireAdmin, PayrollConfiguration.updateBatchName);

    /**
     * POST /payroll-batch/:id/activate — Activates a batch (DRAFT → ACTIVE).
     */
    router.post("/payroll-batch/:id/activate", protect, requireAdmin, PayrollConfiguration.activateBatch);

    /**
     * POST /payroll-batch/:id/close — Closes a batch (ACTIVE → CLOSED).
     */
    router.post("/payroll-batch/:id/close", protect, requireAdmin, PayrollConfiguration.closeBatch);

    /**
     * POST /payroll-batch/:id/archive — Archives a batch (CLOSED → ARCHIVED).
     */
    router.post("/payroll-batch/:id/archive", protect, requireAdmin, PayrollConfiguration.archiveBatch);

/**
 * DELETE /payroll-batch/employees/:id — Removes an employee from a batch.
 */
router.delete("/payroll-batch/employees/:id", protect, requireAdmin, PayrollConfiguration.removeBatchEmployee);

/**
 * PUT /payroll-batch/employees/:id/move — Moves an employee to another batch in the same period.
 */
router.put("/payroll-batch/employees/:id/move", protect, requireAdmin, validate(moveBatchEmployeeSchema), PayrollConfiguration.moveBatchEmployee);

// =========================================================================
// PAYSLIP NOTIFICATION SETTINGS ROUTES
// =========================================================================

/**
 * GET /payslip-notification-settings — Retrieves the payslip notification settings for the company.
 */
router.get("/payslip-notification-settings", protect, requireAdmin, PayrollConfiguration.getPayslipNotificationSettings);

/**
 * POST /payslip-notification-settings/save-configuration — Saves (upserts) payslip notification settings. Validates using savePayslipNotificationSettingsSchema.
 */
router.post("/payslip-notification-settings/save-configuration", protect, requireAdmin, validate(savePayslipNotificationSettingsSchema), PayrollConfiguration.savePayslipNotificationSettings);

// =========================================================================
// SYSTEM CURRENCY ROUTES
// =========================================================================

/**
 * GET /currencies — Retrieves all system currencies for the company.
 */
router.get("/currencies", protect, requireAdmin, PayrollConfiguration.getAllCurrencies);

/**
 * GET /currency/:id — Retrieves a single system currency by ID.
 */
router.get("/currency/:id", protect, requireAdmin, PayrollConfiguration.getCurrency);

/**
 * POST /currency — Creates a new system currency. Validates using createSystemCurrencySchema.
 */
router.post("/currency", protect, requireAdmin, validate(createSystemCurrencySchema), PayrollConfiguration.createCurrency);

/**
 * PUT /currency/:id — Updates a system currency. Validates using updateSystemCurrencySchema.
 */
router.put("/currency/:id", protect, requireAdmin, validate(updateSystemCurrencySchema), PayrollConfiguration.updateCurrency);

/**
 * DELETE /currency/:id — Deletes a system currency by ID.
 */
router.delete("/currency/:id", protect, requireAdmin, PayrollConfiguration.deleteCurrency);

/**
 * POST /currency/:id/set-base — Sets a currency as the base currency for the company.
 */
router.post("/currency/:id/set-base", protect, requireAdmin, validate(setBaseCurrencySchema), PayrollConfiguration.setBaseCurrency);

// =========================================================================
// CURRENCY RATE ROUTES
// =========================================================================

/**
 * POST /currency-rate — Creates a new currency exchange rate. Validates using createCurrencyRateSchema.
 */
router.post("/currency-rate", protect, requireAdmin, validate(createCurrencyRateSchema), PayrollConfiguration.createCurrencyRate);

/**
 * PUT /currency-rate/:id — Updates an existing currency exchange rate. Validates using updateCurrencyRateSchema.
 */
router.put("/currency-rate/:id", protect, requireAdmin, validate(updateCurrencyRateSchema), PayrollConfiguration.updateCurrencyRate);

/**
 * DELETE /currency-rate/:id — Deletes a currency exchange rate by ID.
 */
router.delete("/currency-rate/:id", protect, requireAdmin, PayrollConfiguration.deleteCurrencyRate);

/**
 * GET /currency-rate/:id — Retrieves a single currency exchange rate by ID.
 */
router.get("/currency-rate/:id", protect, requireAdmin, PayrollConfiguration.getCurrencyRate);

/**
 * GET /currency-rates — Retrieves all currency exchange rates (paginated).
 */
router.get("/currency-rates", protect, requireAdmin, PayrollConfiguration.getAllCurrencyRates);

/**
 * POST /currency-rates/save-configuration — Saves a batch of currency rate configurations. Validates using saveCurrencyRateBatchSchema.
 */
router.post("/currency-rates/save-configuration", protect, requireAdmin, validate(saveCurrencyRateBatchSchema), PayrollConfiguration.saveCurrencyRates);

// =========================================================================
// PAY FREQUENCY ROUTES
// =========================================================================

/**
 * POST /pay-frequency — Creates a new pay frequency configuration. Validates using createPayFrequencySchema.
 */
router.post("/pay-frequency", protect, requireAdmin, validate(createPayFrequencySchema), PayrollConfiguration.createPayFrequency);

/**
 * PUT /pay-frequency/:id — Updates an existing pay frequency configuration. Validates using updatePayFrequencySchema.
 */
router.put("/pay-frequency/:id", protect, requireAdmin, validate(updatePayFrequencySchema), PayrollConfiguration.updatePayFrequency);

/**
 * DELETE /pay-frequency/:id — Deletes a pay frequency configuration by ID.
 */
router.delete("/pay-frequency/:id", protect, requireAdmin, PayrollConfiguration.deletePayFrequency);

/**
 * GET /pay-frequency/:id — Retrieves a single pay frequency configuration by ID.
 */
router.get("/pay-frequency/:id", protect, requireAdmin, PayrollConfiguration.getPayFrequency);

/**
 * GET /pay-frequencies — Retrieves all pay frequency configurations (paginated).
 */
router.get("/pay-frequencies", protect, requireAdmin, PayrollConfiguration.getAllPayFrequencies);

/**
 * POST /pay-frequencies/save-configuration — Saves a batch of pay frequency configurations. Validates using savePayFrequencyBatchSchema.
 */
router.post("/pay-frequencies/save-configuration", protect, requireAdmin, validate(savePayFrequencyBatchSchema), PayrollConfiguration.savePayFrequencies);

export default router;
