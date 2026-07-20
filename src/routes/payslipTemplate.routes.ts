import { Router } from "express";
import { PayslipTemplateController } from "../controllers/payslipTemplate.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";

const router = Router();

router.get("/payslip-templates", protect, requireAdmin, PayslipTemplateController.list);
router.get("/payslip-templates/:id", protect, requireAdmin, PayslipTemplateController.getById);
router.post("/payslip-templates", protect, requireAdmin, PayslipTemplateController.create);
router.put("/payslip-templates/:id", protect, requireAdmin, PayslipTemplateController.update);
router.delete("/payslip-templates/:id", protect, requireAdmin, PayslipTemplateController.delete);
router.post("/payslip-templates/:id/preview", protect, requireAdmin, PayslipTemplateController.preview);
router.get("/payslip-templates/:id/download", protect, PayslipTemplateController.download);

export default router;
