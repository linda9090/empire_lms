import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/enrollments/route";

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    enrollment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    course: {
      findFirst: vi.fn(),
    },
  },
}));

describe("Enrollments API - GET /api/enrollments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return enrollments for current user as STUDENT", async () => {
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

    const mockEnrollments = [
      {
        id: "enroll1",
        userId: "student1",
        course: { id: "course1", title: "Course 1" },
      },
    ];
    vi.mocked(db.enrollment.findMany).mockResolvedValue(mockEnrollments as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockEnrollments);
    expect(db.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "student1" }),
      })
    );
  });

  it("should return all enrollments for ADMIN", async () => {
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

    const mockEnrollments = [
      { id: "enroll1", userId: "student1", course: { id: "course1", title: "Course 1" } },
      { id: "enroll2", userId: "student2", course: { id: "course2", title: "Course 2" } },
    ];
    vi.mocked(db.enrollment.findMany).mockResolvedValue(mockEnrollments as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toHaveLength(2);
  });

  it("should filter by courseId when query param provided", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(db.enrollment.findMany).mockResolvedValue([] as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments?courseId=course1");
    await GET(request as any);

    expect(db.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ courseId: "course1" }),
      })
    );
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should handle errors gracefully", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);
    vi.mocked(db.enrollment.findMany).mockRejectedValue(new Error("DB Error"));

    const request = new NextRequest("http://localhost:3000/api/enrollments");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch enrollments");
  });
});

describe("Enrollments API - POST /api/enrollments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create enrollment for STUDENT", async () => {
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

    const mockCourse = { id: "course1", title: "Course 1", isPublished: true };
    vi.mocked(db.course.findFirst).mockResolvedValue(mockCourse as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      courseId: "course1",
      course: mockCourse,
    };
    vi.mocked(db.enrollment.create).mockResolvedValue(mockEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toEqual(mockEnrollment);
  });

  it("should create enrollment for ADMIN", async () => {
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

    const mockCourse = { id: "course1", title: "Course 1" };
    vi.mocked(db.course.findFirst).mockResolvedValue(mockCourse as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const mockEnrollment = { id: "enroll1", userId: "admin1", courseId: "course1" };
    vi.mocked(db.enrollment.create).mockResolvedValue(mockEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when TEACHER tries to enroll", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "teacher1",
        email: "teacher@example.com",
        name: "Teacher",
        role: "TEACHER",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 403 when GUARDIAN tries to enroll", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "guardian1",
        email: "guardian@example.com",
        name: "Guardian",
        role: "GUARDIAN",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 400 when courseId is missing", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("courseId is required");
  });

  it("should return 404 when course not found", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);
    vi.mocked(db.course.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "nonexistent" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Course not found");
  });

  it("should return 409 when already enrolled", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    const mockCourse = { id: "course1", title: "Course 1" };
    vi.mocked(db.course.findFirst).mockResolvedValue(mockCourse as any);

    const existingEnrollment = { id: "enroll1", userId: "student1", courseId: "course1" };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(existingEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/enrollments", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already enrolled in this course");
  });
});
