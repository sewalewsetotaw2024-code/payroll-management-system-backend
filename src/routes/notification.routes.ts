import { Router, type Request, type Response } from "express";
import { authenticate } from "../middlewares/auth";
import { requireViewAccess } from "../middlewares/roleGuard";
import { notificationService } from "../services/notification.service";
import asyncHandler from "../utils/asyncHandler";

const router = Router();

// All notification routes require authentication and a view-eligible role.
router.use(authenticate);
router.use(requireViewAccess);

/**
 * GET /notifications
 * Query params:
 *   - unreadOnly: "true" to return only unread notifications
 *   - category: filter by category (payroll, attendance, payslip, system)
 *   - limit: page size (default 50, max 100)
 *   - offset: pagination offset (default 0)
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = Number((req as any).user?.id);
    const unreadOnly = req.query.unreadOnly === "true";
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { notifications, total } = await notificationService.getForUser(userId, {
      unreadOnly,
      category,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: notifications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + notifications.length < total,
      },
    });
  }),
);

/**
 * GET /notifications/unread-count
 * Lightweight endpoint for badge count updates. Polled by the frontend as a
 * fallback to the WebSocket real-time channel.
 */
router.get(
  "/unread-count",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = Number((req as any).user?.id);
    const count = await notificationService.getUnreadCount(userId);
    res.json({ success: true, data: { count } });
  }),
);

/**
 * PATCH /notifications/:id/read
 * Mark a single notification as read.
 */
router.patch(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await notificationService.markAsRead(req.params.id);
    res.json({ success: true, data: notification });
  }),
);

/**
 * PATCH /notifications/read-all
 * Mark all of the current user's notifications as read.
 */
router.patch(
  "/read-all",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = Number((req as any).user?.id);
    const result = await notificationService.markAllAsRead(userId);
    res.json({ success: true, data: { updated: result.count } });
  }),
);

export default router;
