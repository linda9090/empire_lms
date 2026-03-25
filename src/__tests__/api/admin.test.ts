import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_ADMIN_USERS } from "@/app/api/admin/users/route";
import { PATCH as PATCH_ADMIN_USER } from "@/app/api/admin/users/[id]/route";
import { GET as GET_ADMIN_COURSES } from "@/app/api/admin/courses/route";
import { PATCH as PATCH_ADMIN_COURSE } from "@/app/api/admin/courses/[id]/route";
import { GET as GET_ADMIN_STATS } from "@/app/api/admin/stats/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    user: {
      update: vi.fn(),
    },
    course: {
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  return {
    db: {
      user: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      course: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      enrollment: {
        findMany: vi.fn(),
      },
      paymentTransaction: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => {
        return callback(tx);
      }),
    },
    __tx: tx,
  };
});

describe("Admin API - Authorization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users on GET /api/admin/users", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "teacher-1",
        role: "TEACHER",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users");
    const response = await GET_ADMIN_USERS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });

  it("returns 403 for non-admin users on GET /api/admin/courses", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student-1",
        role: "STUDENT",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/courses");
    const response = await GET_ADMIN_COURSES(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });
});

describe("Admin API - Users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when page is invalid", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users?page=-1");
    const response = await GET_ADMIN_USERS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_PAGE");
  });

  it("returns 400 when pageSize exceeds max", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users?pageSize=1000");
    const response = await GET_ADMIN_USERS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("PAGE_SIZE_EXCEEDS_LIMIT");
  });

  it("returns 400 when role is invalid on PATCH /api/admin/users/[id]", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ role: "INVALID_ROLE" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "user-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_ROLE");
  });

  it("returns 404 when target user does not exist", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue(null as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/missing", {
      method: "PATCH",
      body: JSON.stringify({ role: "TEACHER" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("writes audit log when user role is changed", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db, __tx } = await import("@/lib/db");
    const { createAuditLog } = await import("@/lib/audit");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      role: "STUDENT",
      organizationId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    } as any);

    vi.mocked(__tx.user.update).mockResolvedValue({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      role: "TEACHER",
      organizationId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ role: "TEACHER", reason: "promotion" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "USER_ROLE_CHANGED",
        targetType: "User",
        targetId: "user-1",
      }),
      expect.anything()
    );
  });
});

describe("Admin API - Courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when target course does not exist", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);
    vi.mocked(db.course.findUnique).mockResolvedValue(null as any);

    const request = new NextRequest("http://localhost:3000/api/admin/courses/missing", {
      method: "PATCH",
      body: JSON.stringify({ isPublished: false }),
    });

    const response = await PATCH_ADMIN_COURSE(request as any, {
      params: Promise.resolve({ id: "missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("NOT_FOUND");
  });

  it("writes audit log when course is force-unpublished", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db, __tx } = await import("@/lib/db");
    const { createAuditLog } = await import("@/lib/audit");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    vi.mocked(db.course.findUnique).mockResolvedValue({
      id: "course-1",
      title: "Course",
      description: null,
      isPublished: true,
      teacherId: "teacher-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    } as any);

    vi.mocked(__tx.course.update).mockResolvedValue({
      id: "course-1",
      title: "Course",
      description: null,
      isPublished: false,
      teacherId: "teacher-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/courses/course-1", {
      method: "PATCH",
      body: JSON.stringify({ isPublished: false, reason: "policy violation" }),
    });

    const response = await PATCH_ADMIN_COURSE(request as any, {
      params: Promise.resolve({ id: "course-1" }),
    });

    expect(response.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "COURSE_UNPUBLISHED",
        targetType: "Course",
        targetId: "course-1",
      }),
      expect.anything()
    );
  });
});

describe("Admin API - Stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when startDate is after endDate", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/stats?startDate=2026-03-25&endDate=2026-03-01"
    );

    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_DATE_RANGE");
  });

  it("returns 400 when date range exceeds 365 days", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/stats?startDate=2024-01-01&endDate=2026-03-25"
    );

    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("DATE_RANGE_TOO_LARGE");
  });
});
