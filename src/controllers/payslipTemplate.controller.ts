import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import CustomError from "../utils/customError";
import { payslipTemplateService } from "../services/payslipTemplate.service";
import { payslipRenderService } from "../services/payslipRender.service";
import { resolveCompanyId } from "../utils/roleGuard";

export const PayslipTemplateController = {
  /** POST /payslip-templates — Create a new template */
  create: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const { name, language, isDefault, htmlContent } = req.body;

    const template = await payslipTemplateService.createTemplate(companyId, {
      name,
      language,
      isDefault,
    });

    // If HTML content was provided, upload it to Cloudinary
    if (htmlContent) {
      await payslipTemplateService.uploadTemplateHtml(companyId, template.id, htmlContent);
    }

    res.status(httpStatus.CREATED).json({
      success: true,
      message: "Payslip template created",
      data: template,
    });
  }),

  /** GET /payslip-templates — List all templates for the company */
  list: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const templates = await payslipTemplateService.listTemplates(companyId);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Templates fetched successfully",
      data: templates,
    });
  }),

  /** GET /payslip-templates/:id — Get single template */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const template = await payslipTemplateService.getTemplate(companyId, req.params.id);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Template fetched successfully",
      data: template,
    });
  }),

  /** PUT /payslip-templates/:id — Update template metadata */
  update: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const { name, language, isDefault, htmlContent } = req.body;

    const template = await payslipTemplateService.updateTemplate(companyId, req.params.id, {
      name, language, isDefault,
    });

    // Upload new HTML if provided
    if (htmlContent) {
      await payslipTemplateService.uploadTemplateHtml(companyId, template.id, htmlContent);
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: "Template updated",
      data: template,
    });
  }),

  /** DELETE /payslip-templates/:id — Delete template */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    await payslipTemplateService.deleteTemplate(companyId, req.params.id);
    res.status(httpStatus.OK).json({
      success: true,
      message: "Template deleted",
    });
  }),

  /** POST /payslip-templates/:id/preview — Preview with sample data */
  preview: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const templateId = req.params.id;

    // Fetch template HTML from Cloudinary
    const htmlContent = await payslipTemplateService.downloadTemplateHtml(companyId, templateId);
    if (!htmlContent) {
      throw new CustomError(httpStatus.NOT_FOUND, "No HTML content uploaded for this template");
    }

    // Render with sample data
    const Handlebars = require("handlebars");
    const compiled = Handlebars.compile(htmlContent);
    const sampleHtml = compiled({
      employeeName: "Sample Employee",
      employeeId: "1234",
      designation: "Position Title",
      department: "Department Name",
      dateOfJoining: "01/01/2020",
      payPeriodStart: "01/07/2026",
      payPeriodEnd: "31/07/2026",
      payDate: "31/07/2026",
      bankName: "Sample Bank",
      accountNo: "**** **** **** 1234",
      tin: "ET-1234-2020",
      earnings: [
        { label: "Basic Salary", amount: 80000 },
        { label: "Housing Allowance", amount: 32000 },
      ],
      deductions: [
        { label: "Income Tax", amount: 2800 },
      ],
      totalEarnings: 112000,
      totalDeductions: 2800,
      netPay: 109200,
      amountInWords: "One Hundred Nine Thousand Two Hundred Ethiopian Birr Only",
    });

    res.status(httpStatus.OK).json({
      success: true,
      message: "Preview generated",
      data: { html: sampleHtml },
    });
  }),

  /** GET /payslip-templates/:id/download — Download raw template HTML */
  download: asyncHandler(async (req: Request, res: Response) => {
    const companyId = resolveCompanyId(req);
    const htmlContent = await payslipTemplateService.downloadTemplateHtml(companyId, req.params.id);
    if (!htmlContent) {
      throw new CustomError(httpStatus.NOT_FOUND, "No HTML content uploaded for this template");
    }
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `attachment; filename="payslip-template.hbs"`);
    res.send(htmlContent);
  }),
};
