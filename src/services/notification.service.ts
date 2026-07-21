import prisma from "../config/database";
import logger from "../utils/logger";
import { broadcastToUser } from "./websocket.service";
import { enqueueEmail } from "../queues/email.queue";
import type { EmailJobData } from "../config/email";

// ── Types ────────────────────────────────────────────────────────────────────

export type NotificationCategory = "payroll" | "attendance" | "payslip" | "system" | "general";

export interface CreateNotificationData {
  recipientId: number;
  type: string;
  title: string;
  message?: string;
  category?: NotificationCategory;
  referenceId?: string;
  link?: string;
  /** Extra data for email templates (e.g., submitterName, periodName, reason) */
  emailData?: Record<string, string | number>;
}

// ── Service ──────────────────────────────────────────────────────────────────

class NotificationService {
  /**
   * Create a notification, persist it, push via WebSocket, and enqueue an email.
   */
  async create(data: CreateNotificationData) {
    const notification = await prisma.appNotification.create({
      data: {
        recipientId: data.recipientId,
        type: data.type,
        title: data.title,
        message: data.message ?? null,
        category: data.category ?? "general",
        referenceId: data.referenceId ?? null,
        link: data.link ?? null,
      },
    });

    logger.info(
      { notificationId: notification.id, recipientId: data.recipientId, type: data.type },
      "[Notification] Created",
    );

    // Real-time push — non-blocking; no-op if user is offline.
    try {
      broadcastToUser(data.recipientId, notification);
    } catch (err) {
      logger.warn({ err }, "[Notification] WebSocket broadcast failed (non-blocking)");
    }

    // Enqueue email — non-blocking; failure does not affect in-app notification.
    try {
      await this.enqueueEmailForNotification(data);
    } catch (err) {
      logger.warn({ err }, "[Notification] Email enqueue failed (non-blocking)");
    }

    return notification;
  }

  /**
   * Look up recipient email and enqueue an email job.
   * Skips if recipient has no email address.
   */
  private async enqueueEmailForNotification(data: CreateNotificationData) {
    // Look up recipient email from AppUser + Employee (no relation — query separately)
    const user = await prisma.appUser.findUnique({
      where: { id: data.recipientId },
      select: { email: true },
    });

    if (!user) {
      logger.warn({ recipientId: data.recipientId }, "[Notification] User not found, skipping email");
      return;
    }

    // Employee is linked by userId (no Prisma relation on AppUser)
    const employee = await prisma.employee.findFirst({
      where: { userId: data.recipientId },
      select: { firstName: true, lastName: true, email: true },
    });

    const email = user.email || employee?.email;
    if (!email) {
      logger.warn({ recipientId: data.recipientId }, "[Notification] No email address, skipping email");
      return;
    }

    const recipientName = employee
      ? `${employee.firstName} ${employee.lastName}`
      : `User #${data.recipientId}`;

    const jobData: EmailJobData = {
      to: email,
      recipientName,
      subject: data.title,
      notificationType: data.type,
      templateData: {
        recipientName,
        ...data.emailData,
      },
    };

    await enqueueEmail(jobData);
  }

  /**
   * Fetch notifications for a user with optional filters and pagination.
   */
  async getForUser(
    userId: number,
    options: { unreadOnly?: boolean; category?: string; limit?: number; offset?: number } = {},
  ) {
    const { unreadOnly = false, category, limit = 50, offset = 0 } = options;

    const where: Record<string, unknown> = { recipientId: userId };
    if (unreadOnly) where.read = false;
    if (category) where.category = category;

    const [notifications, total] = await Promise.all([
      prisma.appNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.appNotification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Get unread notification count for a user. Used for badge display.
   */
  async getUnreadCount(userId: number) {
    return prisma.appNotification.count({
      where: { recipientId: userId, read: false },
    });
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string) {
    return prisma.appNotification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: number) {
    return prisma.appNotification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
  }

  /**
   * Delete old notifications (cleanup job).
   * Removes notifications older than the given number of days.
   */
  async cleanupOldNotifications(daysOld = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = await prisma.appNotification.deleteMany({
      where: { createdAt: { lt: cutoff }, read: true },
    });

    if (result.count > 0) {
      logger.info({ deleted: result.count }, "[Notification] Cleaned up old read notifications");
    }

    return result;
  }
}

export const notificationService = new NotificationService();
