import prisma from "../config/database";
import { $Enums } from "../generated/prisma";

type NotificationType = $Enums.AttendanceNotificationType;

export class AttendanceNotificationService {
  /**
   * Create a notification for a recipient.
   */
  async createNotification(data: {
    recipientId: number;
    type: NotificationType;
    title: string;
    message?: string;
    attendanceImportId?: string;
    rejectionNote?: string;
  }) {
    return prisma.attendanceNotification.create({ data });
  }

  /**
   * Fetch unread notifications for a recipient, newest first.
   */
  async getNotifications(recipientId: number, unreadOnly: boolean = false) {
    const where: any = { recipientId };
    if (unreadOnly) where.read = false;

    return prisma.attendanceNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string) {
    return prisma.attendanceNotification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications for a recipient as read.
   */
  async markAllAsRead(recipientId: number) {
    return prisma.attendanceNotification.updateMany({
      where: { recipientId, read: false },
      data: { read: true },
    });
  }
}

export const attendanceNotificationService = new AttendanceNotificationService();
