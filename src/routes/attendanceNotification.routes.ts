import { Router } from "express";
import { AttendanceNotificationController } from "../controllers/attendanceNotification.controller";
import { authenticate as protect } from "../middlewares/auth";
import { requireViewAccess } from "../middlewares/roleGuard";

const router = Router();

/** GET /notifications — Get notifications for current user (optional ?unreadOnly=true) */
router.get("/notifications", protect, requireViewAccess, AttendanceNotificationController.getNotifications);

/** PATCH /notifications/:id/read — Mark a single notification as read */
router.patch("/notifications/:id/read", protect, requireViewAccess, AttendanceNotificationController.markAsRead);

/** PATCH /notifications/read-all — Mark all notifications as read */
router.patch("/notifications/read-all", protect, requireViewAccess, AttendanceNotificationController.markAllAsRead);

export default router;
