import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/enrollments/[id]/route";
import { EnrollmentStatus } from "@prisma/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    enrollment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Enrollment API - GET /api/enrollments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return enrollment by ID for owner", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
    } as any);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
      course: {
        id: "course1",
        title: "Course 1",
        organization: { id: "org1", name: "Org", slug: "org" },
        _count: { sections: 5, enrollments: 10 },
      },
      user: { id: "student1", name: "Student", email: "student@example.com", role: "STUDENT" },
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(mockEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1");
    const response = await GET(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockEnrollment);
  });

  it("should return enrollment for ADMIN viewing any enrollment", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "admin1",
        email: "admin@example.com",
        name: "Admin",
        role: "ADMIN",
      },
    } as any);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
      course: { id: "course1", title: "Course 1" },
      user: { id: "student1", name: "Student", email: "student@example.com", role: "STUDENT" },
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(mockEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1");
    const response = await GET(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });

    expect(response.status).toBe(200);
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1");
    const response = await GET(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when user tries to view another user's enrollment", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student2",
        email: "student2@example.com",
        name: "Student2",
        role: "STUDENT",
      },
    } as any);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(mockEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1");
    const response = await GET(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 404 when enrollment not found", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments/nonexistent");
    const response = await GET(request as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Enrollment not found");
  });
});

describe("Enrollment API - PATCH /api/enrollments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update enrollment status", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
    } as any);

    const existingEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
      course: { id: "course1", title: "Course 1" },
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);

    const updatedEnrollment = {
      ...existingEnrollment,
      status: "completed",
      completedAt: new Date(),
    };
    vi.mocked(db.enrollment.update).mockResolvedValue(updatedEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });

    expect(response.status).toBe(200);
    expect(db.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: EnrollmentStatus.COMPLETED }),
      })
    );
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when user tries to update another user's enrollment", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student2",
        email: "student2@example.com",
        name: "Student2",
        role: "STUDENT",
      },
    } as any);

    const existingEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 400 for invalid status", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    const existingEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "PATCH",
      body: JSON.stringify({ status: "invalid_status" }),
    });
    const response = await PATCH(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid status");
  });
});

describe("Enrollment API - DELETE /api/enrollments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should soft delete enrollment for owner", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
    } as any);

    const existingEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);
    vi.mocked(db.enrollment.update).mockResolvedValue({
      ...existingEnrollment,
      deletedAt: new Date(),
      cancelledAt: new Date(),
      status: "cancelled",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.success).toBe(true);
    expect(db.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          cancelledAt: expect.any(Date),
          status: EnrollmentStatus.CANCELLED,
        }),
      })
    );
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 404 when enrollment not found", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Enrollment not found");
  });

  it("should return 403 when user tries to delete another user's enrollment", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student2",
        email: "student2@example.com",
        name: "Student2",
        role: "STUDENT",
      },
    } as any);

    const existingEnrollment = {
      id: "enroll1",
      userId: "student1",
      status: "active",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments/enroll1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "enroll1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });
});
