import prisma from "../config/database";

class PayrollNotificationService {
  async createNotification(data: {
    recipientId: number;
    type: "PAYROLL_SUBMITTED" | "PAYROLL_APPROVED" | "PAYROLL_REJECTED";
    title: string;
    message?: string;
    payrollRunId?: string;
  }) {
    return prisma.payrollNotification.create({
      data: {
        recipientId: data.recipientId,
        type: data.type,
        title: data.title,
        message: data.message ?? null,
        payrollRunId: data.payrollRunId ?? null,
      },
    });
  }

  async getNotifications(userId: number, unreadOnly = false) {
    const where: any = { recipientId: userId };
    if (unreadOnly) where.read = false;

    return prisma.payrollNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async markAsRead(notificationId: string) {
    return prisma.payrollNotification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: number) {
    return prisma.payrollNotification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
  }
}

export const payrollNotificationService = new PayrollNotificationService();
