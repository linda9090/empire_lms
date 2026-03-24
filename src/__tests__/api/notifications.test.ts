/**
 * Notifications API Tests
 *
 * 라운드 1 보완 항목 포괄:
 * 1. 보안: GET /api/notifications에서 자신의 알림만 조회
 * 2. 이메일 실패 처리: 실패해도 DB에 저장됨
 * 3. 경계값: userId, lessonId null 체크
 * 4. 다중 사용자: 타인 알림 접근 403 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/notifications/route";
import { POST } from "@/app/api/notifications/read/route";
import { createNotification, createBulkNotifications } from "@/lib/notification";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock fetch for Resend API
global.fetch = vi.fn();

describe("Notifications API - GET /api/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Security: Only user's own notifications", () => {
    it("should filter notifications by current user's ID from session", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", email: "user@example.com", role: "STUDENT" },
      } as any);

      const mockNotifications = [
        { id: "notif1", userId: "user123", title: "Your notification" },
      ];
      vi.mocked(db.notification.findMany).mockResolvedValue(mockNotifications as any);
      vi.mocked(db.notification.count).mockResolvedValue(1);
      vi.mocked(db.notification.count).mockResolvedValue(0);

      const request = new NextRequest("http://localhost:3000/api/notifications");
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user123" }),
        })
      );
      expect(data.data).toEqual(mockNotifications);
    });

    it("should NOT accept userId from query params (security)", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.findMany).mockResolvedValue([] as any);
      vi.mocked(db.notification.count).mockResolvedValue(0);

      // userId를 쿼리 파라미터로 보내려고 시도
      const request = new NextRequest("http://localhost:3000/api/notifications?userId=other_user");
      await GET(request as any);

      // 세션의 userId가 사용되어야 함, 쿼리 파라미터는 무시됨
      expect(db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user123" }), // "other_user"가 아님!
        })
      );
    });
  });

  describe("Filtering and pagination", () => {
    it("should filter by isRead=false", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.findMany).mockResolvedValue([] as any);
      vi.mocked(db.notification.count).mockResolvedValue(0);

      const request = new NextRequest("http://localhost:3000/api/notifications?isRead=false");
      await GET(request as any);

      expect(db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRead: false }),
        })
      );
    });

    it("should filter by type", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.findMany).mockResolvedValue([] as any);
      vi.mocked(db.notification.count).mockResolvedValue(0);

      const request = new NextRequest("http://localhost:3000/api/notifications?type=PAYMENT_SUCCEEDED");
      await GET(request as any);

      expect(db.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "PAYMENT_SUCCEEDED" }),
        })
      );
    });

    it("should validate limit bounds (1-100)", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/notifications?limit=101");
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("limit must be between 1 and 100");
    });

    it("should return 401 when not authenticated", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/notifications");
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should include unreadCount in meta", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.findMany).mockResolvedValue([] as any);
      // 첫 번째 호출: total count, 두 번째 호출: unread count
      vi.mocked(db.notification.count)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);

      const request = new NextRequest("http://localhost:3000/api/notifications");
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.meta.unreadCount).toBe(3);
    });
  });
});

describe("Notifications API - POST /api/notifications/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authorization: 403 for others' notifications", () => {
    it("should return 403 when trying to mark another user's notification as read", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      // 다른 사용자의 알림
      vi.mocked(db.notification.findUnique).mockResolvedValue({
        id: "notif1",
        userId: "other_user", // 소유자가 다름!
        isRead: false,
      } as any);

      const request = new NextRequest("http://localhost:3000/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ notificationId: "notif1" }),
      });
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain("Forbidden");
    });

    it("should allow marking own notification as read", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      // 자신의 알림
      vi.mocked(db.notification.findUnique).mockResolvedValue({
        id: "notif1",
        userId: "user123", // 소유자 일치!
        isRead: false,
      } as any);

      const updatedNotification = {
        id: "notif1",
        type: "PAYMENT_SUCCEEDED",
        title: "Payment succeeded",
        message: "Your payment was successful",
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      };
      vi.mocked(db.notification.update).mockResolvedValue(updatedNotification as any);

      const request = new NextRequest("http://localhost:3000/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ notificationId: "notif1" }),
      });
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.isRead).toBe(true);
      expect(db.notification.update).toHaveBeenCalled();
    });

    it("should return 404 when notification does not exist", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.findUnique).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ notificationId: "nonexistent" }),
      });
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Notification not found");
    });
  });

  describe("Read all notifications", () => {
    it("should mark all notifications as read for current user", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 5 });

      const request = new NextRequest("http://localhost:3000/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ readAll: true }),
      });
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.updatedCount).toBe(5);
      expect(db.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user123", isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it("should return 400 when neither notificationId nor readAll is provided", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue({
        user: { id: "user123", role: "STUDENT" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Either notificationId or readAll");
    });
  });
});

describe("Notification Library - Email failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@test.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Email failure scenarios", () => {
    it("should save notification to DB even when email fails", async () => {
      const { db } = await import("@/lib/db");

      // DB create 성공
      const mockNotification = {
        id: "notif1",
        userId: "user123",
        type: "PAYMENT_SUCCEEDED",
        title: "Test",
        message: "Test message",
        emailStatus: "PENDING",
      };
      vi.mocked(db.notification.create).mockResolvedValue(mockNotification as any);

      // 사용자 정보 조회 성공
      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      } as any);

      // Email API 실패
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as Response);

      // DB update로 실패 상태 저장
      vi.mocked(db.notification.update).mockResolvedValue({
        ...mockNotification,
        emailStatus: "FAILED",
      } as any);

      const result = await createNotification({
        userId: "user123",
        type: "PAYMENT_SUCCEEDED",
        title: "Payment succeeded",
        message: "Your payment was successful",
      });

      // DB에 저장됨 (핵심: 이메일 실패해도 알림은 저장됨)
      expect(db.notification.create).toHaveBeenCalled();
      expect(db.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailStatus: "FAILED" }),
        })
      );
      expect(result.emailStatus).toBe("FAILED");
      expect(result.emailError).toBeDefined();
    });

    it("should handle Resend API timeout gracefully", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "PENDING",
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      } as any);

      // 네트워크 타임아웃 시뮬레이션
      vi.mocked(global.fetch).mockRejectedValue(new Error("ETIMEDOUT"));

      vi.mocked(db.notification.update).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "FAILED",
      } as any);

      const result = await createNotification({
        userId: "user123",
        type: "PAYMENT_SUCCEEDED",
        title: "Test",
        message: "Test",
      });

      expect(result.emailStatus).toBe("FAILED");
      expect(result.emailError).toContain("ETIMEDOUT");
    });

    it("should set emailStatus to SENT when email succeeds", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "PENDING",
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test User",
      } as any);

      // Email API 성공
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_123" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "SENT",
      } as any);

      const result = await createNotification({
        userId: "user123",
        type: "PAYMENT_SUCCEEDED",
        title: "Test",
        message: "Test",
      });

      expect(result.emailStatus).toBe("SENT");
      expect(result.emailError).toBeUndefined();
    });

    it("should skip email when RESEND_API_KEY is not configured", async () => {
      const { db } = await import("@/lib/db");

      vi.unstubAllEnvs(); // RESEND_API_KEY 제거

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "PENDING",
      } as any);

      vi.mocked(db.notification.update).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        emailStatus: "FAILED",
      } as any);

      const result = await createNotification({
        userId: "user123",
        type: "PAYMENT_SUCCEEDED",
        title: "Test",
        message: "Test",
      });

      // fetch가 호출되지 않음
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.emailStatus).toBe("FAILED");
    });
  });

  describe("Boundary value testing for nullable fields", () => {
    it("should accept notification with null courseId", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        courseId: null, // nullable
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test",
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_1" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({} as any);

      await expect(
        createNotification({
          userId: "user123",
          type: "PAYMENT_SUCCEEDED",
          title: "Test",
          message: "Test",
          courseId: null, // 명시적 null
        })
      ).resolves.not.toThrow();

      expect(db.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ courseId: null }),
        })
      );
    });

    it("should accept notification with null lessonId", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        lessonId: null,
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test",
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_1" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({} as any);

      await expect(
        createNotification({
          userId: "user123",
          type: "PAYMENT_SUCCEEDED",
          title: "Test",
          message: "Test",
          lessonId: null,
        })
      ).resolves.not.toThrow();
    });

    it("should accept notification with null enrollmentId", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        enrollmentId: null,
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test",
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_1" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({} as any);

      await expect(
        createNotification({
          userId: "user123",
          type: "PAYMENT_SUCCEEDED",
          title: "Test",
          message: "Test",
          enrollmentId: null,
        })
      ).resolves.not.toThrow();
    });

    it("should accept notification with all optional fields as null", async () => {
      const { db } = await import("@/lib/db");

      vi.mocked(db.notification.create).mockResolvedValue({
        id: "notif1",
        userId: "user123",
        courseId: null,
        lessonId: null,
        enrollmentId: null,
        metadata: null,
      } as any);

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test",
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_1" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({} as any);

      await expect(
        createNotification({
          userId: "user123",
          type: "PAYMENT_SUCCEEDED",
          title: "Test",
          message: "Test",
          courseId: null,
          lessonId: null,
          enrollmentId: null,
          metadata: null,
        })
      ).resolves.not.toThrow();
    });
  });

  describe("Bulk notifications", () => {
    it("should handle partial failures in bulk notifications", async () => {
      const { db } = await import("@/lib/db");

      // 첫 번째는 성공, 두 번째는 실패
      vi.mocked(db.notification.create)
        .mockResolvedValueOnce({
          id: "notif1",
          userId: "user1",
          type: "PAYMENT_SUCCEEDED",
          title: "Test",
          message: "Test",
          emailStatus: "PENDING",
        } as any)
        .mockRejectedValueOnce(new Error("DB error for user2"));

      vi.mocked(db.user.findUnique).mockResolvedValue({
        email: "user@example.com",
        name: "Test",
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ id: "email_1" }),
      } as Response);

      vi.mocked(db.notification.update).mockResolvedValue({
        id: "notif1",
        userId: "user1",
        emailStatus: "SENT",
      } as any);

      const results = await createBulkNotifications([
        { userId: "user1", type: "PAYMENT_SUCCEEDED", title: "Test", message: "Test" },
        { userId: "user2", type: "PAYMENT_SUCCEEDED", title: "Test", message: "Test" },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("notif1");
      expect(results[0].emailStatus).toBe("SENT");
      expect(results[1].id).toBe(""); // 실패한 경우
      expect(results[1].emailError).toBe("Failed to create notification in DB");
    });
  });
});
