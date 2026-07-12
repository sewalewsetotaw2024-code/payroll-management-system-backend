import { Router, Request, Response } from "express";
import { authenticate } from "../middlewares/auth";
import { requireViewAccess } from "../middlewares/roleGuard";
import { payrollNotificationService } from "../services/payrollNotification.service";
import asyncHandler from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);
router.use(requireViewAccess);

// GET /payroll-notifications
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = Number((req as any).user?.id);
    const unreadOnly = req.query.unreadOnly === "true";
    const notifications = await payrollNotificationService.getNotifications(userId, unreadOnly);
    res.json({ success: true, data: notifications });
  }),
);

// PATCH /payroll-notifications/:id/read
router.patch(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    await payrollNotificationService.markAsRead(req.params.id);
    res.json({ success: true });
  }),
);

// PATCH /payroll-notifications/read-all
router.patch(
  "/read-all",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = Number((req as any).user?.id);
    await payrollNotificationService.markAllAsRead(userId);
    res.json({ success: true });
  }),
);

export default router;
