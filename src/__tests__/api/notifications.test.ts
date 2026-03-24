import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  NotificationEmailStatus,
  NotificationEventType,
} from "@prisma/client";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { POST as markNotificationsRead } from "@/app/api/notifications/read/route";
import { createNotification } from "@/lib/notification";

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe("Notifications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when reading another user's notification", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student-1",
        name: "Student 1",
        email: "student1@example.com",
        role: "STUDENT",
      },
    } as never);

    vi.mocked(db.notification.findMany).mockResolvedValue([
      {
        id: "notif-2",
        userId: "student-2",
      },
    ] as never);

    const request = new NextRequest("http://localhost:3000/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ notificationId: "notif-2" }),
    });

    const response = await markNotificationsRead(request as never);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("Forbidden");
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it("returns paginated notifications for current user only", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student-1",
        name: "Student 1",
        email: "student1@example.com",
        role: "STUDENT",
      },
    } as never);

    const page = [
      { id: "n3", userId: "student-1", isRead: false, title: "c", message: "c" },
      { id: "n2", userId: "student-1", isRead: false, title: "b", message: "b" },
      { id: "n1", userId: "student-1", isRead: true, title: "a", message: "a" },
    ];

    vi.mocked(db.notification.findMany).mockResolvedValue(page as never);
    vi.mocked(db.notification.count).mockResolvedValue(2 as never);

    const request = new NextRequest(
      "http://localhost:3000/api/notifications?limit=2&status=unread"
    );

    const response = await listNotifications(request as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.meta.hasMore).toBe(true);
    expect(json.meta.nextCursor).toBe("n2");
    expect(json.meta.unreadCount).toBe(2);

    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "student-1",
          isRead: false,
        }),
        take: 3,
      })
    );
  });

  it("rejects userId query filter to prevent direct user probing", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student-1",
        name: "Student 1",
        email: "student1@example.com",
        role: "STUDENT",
      },
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/notifications?userId=student-2"
    );

    const response = await listNotifications(request as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("userId");
  });
});

describe("Notification utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it("stores notification in DB even when email delivery fails", async () => {
    const { db } = await import("@/lib/db");

    vi.mocked(db.notification.create).mockResolvedValue({
      id: "notif-1",
      userId: "student-1",
      eventType: NotificationEventType.STUDENT_PAYMENT_COMPLETED,
      title: "결제가 완료되었습니다",
      message: "강의 결제가 완료되었습니다.",
      linkUrl: null,
      metadata: null,
      idempotencyKey: null,
      courseId: "course-1",
      lessonId: null,
      isRead: false,
      readAt: null,
      emailStatus: NotificationEmailStatus.PENDING,
      emailError: null,
      emailSentAt: null,
      emailRetryCount: 0,
      nextEmailRetryAt: null,
      emailLastAttemptAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.mocked(db.notification.update).mockResolvedValue({
      id: "notif-1",
      userId: "student-1",
      eventType: NotificationEventType.STUDENT_PAYMENT_COMPLETED,
      title: "결제가 완료되었습니다",
      message: "강의 결제가 완료되었습니다.",
      linkUrl: null,
      metadata: null,
      idempotencyKey: null,
      courseId: "course-1",
      lessonId: null,
      isRead: false,
      readAt: null,
      emailStatus: NotificationEmailStatus.RETRY_PENDING,
      emailError: "RESEND_API_KEY is not configured",
      emailSentAt: null,
      emailRetryCount: 1,
      nextEmailRetryAt: new Date(Date.now() + 300_000),
      emailLastAttemptAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await createNotification({
      recipient: {
        userId: "student-1",
        email: "student1@example.com",
        name: "Student 1",
      },
      eventType: NotificationEventType.STUDENT_PAYMENT_COMPLETED,
      title: "결제가 완료되었습니다",
      message: "강의 결제가 완료되었습니다.",
      courseId: "course-1",
      sendEmail: true,
    });

    expect(db.notification.create).toHaveBeenCalledOnce();
    expect(db.notification.update).toHaveBeenCalledOnce();
    expect(result.emailStatus).toBe(NotificationEmailStatus.RETRY_PENDING);
    expect(result.emailRetryCount).toBe(1);
  });

  it("rejects notification creation when recipient userId is null", async () => {
    await expect(
      createNotification({
        recipient: {
          userId: null as unknown as string,
          email: "student1@example.com",
        },
        eventType: NotificationEventType.STUDENT_ENROLLMENT_COMPLETED,
        title: "수강신청",
        message: "완료",
      })
    ).rejects.toThrow();
  });

  it("accepts lessonId null boundary and stores null safely", async () => {
    const { db } = await import("@/lib/db");

    vi.mocked(db.notification.create).mockResolvedValue({
      id: "notif-2",
      userId: "student-1",
      eventType: NotificationEventType.STUDENT_NEW_LESSON_REGISTERED,
      title: "새 레슨",
      message: "등록",
      linkUrl: null,
      metadata: null,
      idempotencyKey: null,
      courseId: "course-1",
      lessonId: null,
      isRead: false,
      readAt: null,
      emailStatus: NotificationEmailStatus.SKIPPED,
      emailError: "Email disabled or recipient email missing",
      emailSentAt: null,
      emailRetryCount: 0,
      nextEmailRetryAt: null,
      emailLastAttemptAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await createNotification({
      recipient: {
        userId: "student-1",
        email: null,
      },
      eventType: NotificationEventType.STUDENT_NEW_LESSON_REGISTERED,
      title: "새 레슨",
      message: "등록",
      courseId: "course-1",
      lessonId: null,
      sendEmail: false,
    });

    expect(result.lessonId).toBeNull();
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lessonId: null,
          userId: "student-1",
        }),
      })
    );
  });
});
