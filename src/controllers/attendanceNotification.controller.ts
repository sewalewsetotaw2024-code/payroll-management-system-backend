import type { Request, Response } from "express";
import httpStatus from "http-status";
import asyncHandler from "../utils/asyncHandler";
import { attendanceNotificationService } from "../services/attendanceNotification.service";

export const AttendanceNotificationController = {
  /** GET /notifications — Get notifications for the current user */
  getNotifications: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const unreadOnly = req.query.unreadOnly === "true";
    const notifications = await attendanceNotificationService.getNotifications(Number(userId), unreadOnly);
    res.status(httpStatus.OK).json({ success: true, data: notifications });
  }),

  /** PATCH /notifications/:id/read — Mark a single notification as read */
  markAsRead: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const notification = await attendanceNotificationService.markAsRead(id);
    res.status(httpStatus.OK).json({ success: true, data: notification });
  }),

  /** PATCH /notifications/read-all — Mark all notifications as read for current user */
  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const result = await attendanceNotificationService.markAllAsRead(Number(userId));
    res.status(httpStatus.OK).json({ success: true, data: result });
  }),
};
