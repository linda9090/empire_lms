import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_USERS } from "@/app/api/admin/users/route";
import { GET as GET_USER_BY_ID, PATCH as PATCH_USER } from "@/app/api/admin/users/[id]/route";
import { GET as GET_COURSES } from "@/app/api/admin/courses/route";
import { GET as GET_COURSE_BY_ID, PATCH as PATCH_COURSE, DELETE as DELETE_COURSE } from "@/app/api/admin/courses/[id]/route";
import { GET as GET_STATS } from "@/app/api/admin/stats/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    course: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    enrollment: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    paymentTransaction: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  serializeForAudit: (value: unknown) => JSON.stringify(value),
  AuditTargetType: {
    USER: "user",
    COURSE: "course",
    PAYMENT: "payment",
  },
}));

describe("Admin API - Authentication & Authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("P0: Permission Bypass Prevention - Direct Role Verification", () => {
    const roles = ["TEACHER", "STUDENT", "GUARDIAN"] as const;

    for (const role of roles) {
      describe(`${role} role attempting admin endpoints`, () => {
        it(`GET /api/admin/users - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/users");
          const response = await GET_USERS(request as any);
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`GET /api/admin/users/[id] - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/users/some-id");
          const response = await GET_USER_BY_ID(request as any, {
            params: Promise.resolve({ id: "some-id" }),
          });
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`PATCH /api/admin/users/[id] - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/users/some-id", {
            method: "PATCH",
            body: JSON.stringify({ role: "ADMIN" }),
          });
          const response = await PATCH_USER(request as any, {
            params: Promise.resolve({ id: "some-id" }),
          });
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`GET /api/admin/courses - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/courses");
          const response = await GET_COURSES(request as any);
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`PATCH /api/admin/courses/[id] - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/courses/some-id", {
            method: "PATCH",
            body: JSON.stringify({ isDeleted: true }),
          });
          const response = await PATCH_COURSE(request as any, {
            params: Promise.resolve({ id: "some-id" }),
          });
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`DELETE /api/admin/courses/[id] - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/courses/some-id", {
            method: "DELETE",
          });
          const response = await DELETE_COURSE(request as any, {
            params: Promise.resolve({ id: "some-id" }),
          });
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });

        it(`GET /api/admin/stats - should return 403 for ${role}`, async () => {
          const { getSession } = await import("@/lib/get-session");
          vi.mocked(getSession).mockResolvedValue({
            user: { id: "user1", email: `${role.toLowerCase()}@test.com`, name: role, role },
          } as any);

          const request = new NextRequest("http://localhost:3000/api/admin/stats");
          const response = await GET_STATS(request as any);
          const data = await response.json();

          expect(response.status).toBe(403);
          expect(data.error).toContain("Admin access required");
        });
      });
    }

    it("should return 401 when not authenticated", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/users");
      const response = await GET_USERS(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Status Code Boundaries - 400 vs 403 vs 404", () => {
    it("GET /api/admin/users/[id] - 400 for invalid ID format", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/admin/users/short");
      const response = await GET_USER_BY_ID(request as any, {
        params: Promise.resolve({ id: "short" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid user ID format");
    });

    it("GET /api/admin/users/[id] - 404 when user not found", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/users/clmvalidid123456789012345");
      const response = await GET_USER_BY_ID(request as any, {
        params: Promise.resolve({ id: "clmvalidid123456789012345" }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("User not found");
    });

    it("PATCH /api/admin/users/[id] - 400 for missing required fields", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const existingUser = { id: "user1", name: "User", email: "user@test.com", role: "STUDENT", deletedAt: null };
      vi.mocked(db.user.findUnique).mockResolvedValue(existingUser as any);

      const request = new NextRequest("http://localhost:3000/api/admin/users/clmvalidid123456789012345", {
        method: "PATCH",
        body: JSON.stringify({}), // No fields provided
      });
      const response = await PATCH_USER(request as any, {
        params: Promise.resolve({ id: "clmvalidid123456789012345" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("At least one field");
    });

    it("PATCH /api/admin/users/[id] - 400 for invalid role value", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const existingUser = { id: "user1", name: "User", email: "user@test.com", role: "STUDENT", deletedAt: null };
      vi.mocked(db.user.findUnique).mockResolvedValue(existingUser as any);

      const request = new NextRequest("http://localhost:3000/api/admin/users/clmvalidid123456789012345", {
        method: "PATCH",
        body: JSON.stringify({ role: "INVALID_ROLE" }),
      });
      const response = await PATCH_USER(request as any, {
        params: Promise.resolve({ id: "clmvalidid123456789012345" }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid request body");
    });

    it("PATCH /api/admin/users/[id] - 400 for self-modification attempt", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      const adminId = "clmadmin123456789012345";
      vi.mocked(getSession).mockResolvedValue({
        user: { id: adminId, email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const existingUser = { id: adminId, name: "Admin", email: "admin@test.com", role: "ADMIN", deletedAt: null };
      vi.mocked(db.user.findUnique).mockResolvedValue(existingUser as any);

      const request = new NextRequest(`http://localhost:3000/api/admin/users/${adminId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: "STUDENT" }),
      });
      const response = await PATCH_USER(request as any, {
        params: Promise.resolve({ id: adminId }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Cannot modify your own account");
    });

    it("GET /api/admin/courses/[id] - 404 when course not found", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);
      vi.mocked(db.course.findUnique).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/admin/courses/clmvalidid123456789012345");
      const response = await GET_COURSE_BY_ID(request as any, {
        params: Promise.resolve({ id: "clmvalidid123456789012345" }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Course not found");
    });
  });

  describe("P0: Pagination - Users and Courses", () => {
    it("GET /api/admin/users - should apply pagination with default values", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.user.count).mockResolvedValue(100);
      vi.mocked(db.user.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/users");
      await GET_USERS(request as any);

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // page 1
          take: 20, // default limit
        })
      );
    });

    it("GET /api/admin/users - should respect max limit of 100", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.user.count).mockResolvedValue(1000);
      vi.mocked(db.user.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/users?limit=999");
      await GET_USERS(request as any);

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // capped at 100
        })
      );
    });

    it("GET /api/admin/users - should calculate pagination metadata correctly", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.user.count).mockResolvedValue(55);
      vi.mocked(db.user.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/users?page=2&limit=20");
      const response = await GET_USERS(request as any);
      const data = await response.json();

      expect(data.meta).toEqual({
        page: 2,
        limit: 20,
        total: 55,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("GET /api/admin/courses - should apply pagination", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.course.count).mockResolvedValue(50);
      vi.mocked(db.course.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/courses?page=1&limit=10");
      await GET_COURSES(request as any);

      expect(db.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });
  });

  describe("P0: Statistics API - Period Parameter Integrity", () => {
    it("GET /api/admin/stats - should validate startDate <= endDate", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const startDate = "2026-03-25T00:00:00Z";
      const endDate = "2026-03-20T00:00:00Z"; // Before start date

      const request = new NextRequest(
        `http://localhost:3000/api/admin/stats?startDate=${startDate}&endDate=${endDate}`
      );
      const response = await GET_STATS(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid query parameters");
      expect(data.details.fieldErrors.endDate).toContain("startDate must be before or equal to endDate");
    });

    it("GET /api/admin/stats - should validate max range of 1 year", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      // More than 1 year apart
      const startDate = "2024-01-01T00:00:00Z";
      const endDate = "2026-03-25T00:00:00Z";

      const request = new NextRequest(
        `http://localhost:3000/api/admin/stats?startDate=${startDate}&endDate=${endDate}`
      );
      const response = await GET_STATS(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid query parameters");
      expect(data.details.fieldErrors.endDate).toContain("Date range cannot exceed 1 year");
    });

    it("GET /api/admin/stats - should validate datetime format", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/admin/stats?startDate=invalid-date"
      );
      const response = await GET_STATS(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid query parameters");
    });

    it("GET /api/admin/stats - should accept valid period presets", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      // Mock all db calls
      vi.mocked(db.user.count).mockResolvedValue(100);
      vi.mocked(db.user.groupBy).mockResolvedValue([]);
      vi.mocked(db.user.findMany).mockResolvedValue([]);
      vi.mocked(db.course.count).mockResolvedValue(10);
      vi.mocked(db.course.findMany).mockResolvedValue([]);
      vi.mocked(db.enrollment.count).mockResolvedValue(50);
      vi.mocked(db.paymentTransaction.aggregate).mockResolvedValue({ _sum: { amount: 1000 } });
      vi.mocked(db.paymentTransaction.findMany).mockResolvedValue([]);
      vi.mocked(db.paymentTransaction.findFirst).mockResolvedValue(null);

      const periods = ["7d", "30d", "90d", "1y", "all"];

      for (const period of periods) {
        const request = new NextRequest(
          `http://localhost:3000/api/admin/stats?period=${period}`
        );
        const response = await GET_STATS(request as any);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.period).toBeDefined();
      }
    });

    it("GET /api/admin/stats - should reject invalid period preset", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/admin/stats?period=invalid"
      );
      const response = await GET_STATS(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid query parameters");
    });
  });

  describe("P0: Audit Log Creation", () => {
    it("PATCH /api/admin/users/[id] - should create audit log on role change", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { createAuditLog } = await import("@/lib/audit-log");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "clmadmin123456789012345", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const existingUser = { id: "clmuser1234567890123456", name: "User", email: "user@test.com", role: "STUDENT", deletedAt: null };
      vi.mocked(db.user.findUnique).mockResolvedValue(existingUser as any);

      const updatedUser = { ...existingUser, role: "TEACHER" };
      vi.mocked(db.user.update).mockResolvedValue(updatedUser as any);

      const request = new NextRequest("http://localhost:3000/api/admin/users/clmuser1234567890123456", {
        method: "PATCH",
        body: JSON.stringify({ role: "TEACHER" }),
      });
      const response = await PATCH_USER(request as any, {
        params: Promise.resolve({ id: "clmuser1234567890123456" }),
      });

      expect(response.status).toBe(200);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "USER_ROLE_CHANGED",
          targetType: "user",
        })
      );
    });

    it("PATCH /api/admin/users/[id] - should create audit log on suspension", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { createAuditLog } = await import("@/lib/audit-log");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "clmadmin123456789012345", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const existingUser = { id: "clmuser1234567890123456", name: "User", email: "user@test.com", role: "STUDENT", deletedAt: null };
      vi.mocked(db.user.findUnique).mockResolvedValue(existingUser as any);

      const updatedUser = { ...existingUser, deletedAt: new Date() };
      vi.mocked(db.user.update).mockResolvedValue(updatedUser as any);

      const request = new NextRequest("http://localhost:3000/api/admin/users/clmuser1234567890123456", {
        method: "PATCH",
        body: JSON.stringify({ isSuspended: true }),
      });
      const response = await PATCH_USER(request as any, {
        params: Promise.resolve({ id: "clmuser1234567890123456" }),
      });

      expect(response.status).toBe(200);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "USER_SUSPENDED",
          targetType: "user",
        })
      );
    });

    it("PATCH /api/admin/courses/[id] - should create audit log on deletion", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { createAuditLog } = await import("@/lib/audit-log");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "clmadmin123456789012345", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const courseId = "clmcours1234567890123456";
      const existingCourse = { id: courseId, title: "Course", isPublished: true, deletedAt: null };
      vi.mocked(db.course.findUnique).mockResolvedValue(existingCourse as any);

      const updatedCourse = { ...existingCourse, deletedAt: new Date() };
      vi.mocked(db.course.update).mockResolvedValue(updatedCourse as any);

      const request = new NextRequest(`http://localhost:3000/api/admin/courses/${courseId}`, {
        method: "PATCH",
        body: JSON.stringify({ isDeleted: true }),
      });
      const response = await PATCH_COURSE(request as any, {
        params: Promise.resolve({ id: courseId }),
      });

      expect(response.status).toBe(200);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_DELETED",
          targetType: "course",
        })
      );
    });

    it("DELETE /api/admin/courses/[id] - should create audit log on hard delete", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { createAuditLog } = await import("@/lib/audit-log");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "clmadmin123456789012345", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      const courseId = "clmcours1234567890123456";
      const existingCourse = { id: courseId, title: "Course", deletedAt: null };
      vi.mocked(db.course.findUnique).mockResolvedValue(existingCourse as any);
      vi.mocked(db.course.delete).mockResolvedValue(existingCourse as any);

      const request = new NextRequest(`http://localhost:3000/api/admin/courses/${courseId}`, {
        method: "DELETE",
      });
      const response = await DELETE_COURSE(request as any, {
        params: Promise.resolve({ id: courseId }),
      });

      expect(response.status).toBe(200);
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_DELETED",
          targetType: "course",
          newValue: null, // Hard delete has no new value
        })
      );
    });
  });

  describe("Admin Users API - Filtering and Sorting", () => {
    it("GET /api/admin/users - should filter by role", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.user.count).mockResolvedValue(10);
      vi.mocked(db.user.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/users?role=TEACHER");
      await GET_USERS(request as any);

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: "TEACHER",
          }),
        })
      );
    });

    it("GET /api/admin/users - should search by name or email", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.user.count).mockResolvedValue(5);
      vi.mocked(db.user.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/users?search=john");
      await GET_USERS(request as any);

      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(Object) }),
              expect.objectContaining({ email: expect.any(Object) }),
            ]),
          }),
        })
      );
    });
  });

  describe("Admin Courses API - Filtering", () => {
    it("GET /api/admin/courses - should filter by published status", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.course.count).mockResolvedValue(10);
      vi.mocked(db.course.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/courses?isPublished=true");
      await GET_COURSES(request as any);

      expect(db.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublished: true,
          }),
        })
      );
    });

    it("GET /api/admin/courses - should search by title or description", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "admin1", email: "admin@test.com", name: "Admin", role: "ADMIN" },
      } as any);

      vi.mocked(db.course.count).mockResolvedValue(5);
      vi.mocked(db.course.findMany).mockResolvedValue([]);

      const request = new NextRequest("http://localhost:3000/api/admin/courses?search=math");
      await GET_COURSES(request as any);

      expect(db.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: expect.any(Object) }),
              expect.objectContaining({ description: expect.any(Object) }),
            ]),
          }),
        })
      );
    });
  });
});
