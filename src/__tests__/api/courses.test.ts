import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/courses/route";
import { GET as GET_BY_ID, PUT, DELETE } from "@/app/api/courses/[id]/route";

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Courses API - GET /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return list of courses", async () => {
    const { db } = await import("@/lib/db");
    const mockCourses = [
      { id: "1", title: "Test Course", description: "Test Description" },
    ];
    vi.mocked(db.course.findMany).mockResolvedValue(mockCourses as any);

    const request = new NextRequest("http://localhost:3000/api/courses");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockCourses);
    expect(data.error).toBeNull();
  });

  it("should filter by published when query param provided", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.course.findMany).mockResolvedValue([] as any);

    const request = new NextRequest("http://localhost:3000/api/courses?published=true");
    await GET(request as any);

    expect(db.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublished: true }),
      })
    );
  });

  it("should handle errors gracefully", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.course.findMany).mockRejectedValue(new Error("DB Error"));

    const request = new NextRequest("http://localhost:3000/api/courses");
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch courses");
  });
});

describe("Courses API - POST /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create course when authenticated as TEACHER", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "user1",
        email: "teacher@example.com",
        name: "Teacher",
        role: "TEACHER",
        organizationId: "org1",
      },
    } as any);

    const mockCourse = { id: "1", title: "New Course" };
    vi.mocked(db.course.create).mockResolvedValue(mockCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ title: "New Course", description: "Description" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toEqual(mockCourse);
  });

  it("should create course when authenticated as ADMIN", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "user1",
        email: "admin@example.com",
        name: "Admin",
        role: "ADMIN",
        organizationId: "org1",
      },
    } as any);

    const mockCourse = { id: "1", title: "Admin Course" };
    vi.mocked(db.course.create).mockResolvedValue(mockCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ title: "Admin Course" }),
    });
    const response = await POST(request as any);

    expect(response.status).toBe(201);
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ title: "New Course" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when STUDENT tries to create course", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "user1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ title: "New Course" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 400 when title is missing", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "TEACHER" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ description: "No title" }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Title is required");
  });

  it("should return 400 when title is empty string", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "TEACHER" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/courses", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Title is required");
  });
});

describe("Courses API - GET /api/courses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return single course by ID", async () => {
    const { db } = await import("@/lib/db");
    const mockCourse = {
      id: "1",
      title: "Test Course",
      description: "Description",
      organization: { id: "org1", name: "Org", slug: "org" },
    };
    vi.mocked(db.course.findFirst).mockResolvedValue(mockCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1");
    const response = await GET_BY_ID(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual(mockCourse);
  });

  it("should return 404 when course not found", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.course.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/courses/nonexistent");
    const response = await GET_BY_ID(request as any, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Course not found");
  });
});

describe("Courses API - PUT /api/courses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update course as TEACHER", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "user1",
        email: "teacher@example.com",
        name: "Teacher",
        role: "TEACHER",
      },
    } as any);

    const existingCourse = { id: "1", title: "Old Title" };
    vi.mocked(db.course.findFirst).mockResolvedValue(existingCourse as any);

    const updatedCourse = { id: "1", title: "New Title" };
    vi.mocked(db.course.update).mockResolvedValue(updatedCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "PUT",
      body: JSON.stringify({ title: "New Title" }),
    });
    const response = await PUT(request as any, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(response.status).toBe(200);
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "PUT",
      body: JSON.stringify({ title: "New Title" }),
    });
    const response = await PUT(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when STUDENT tries to update", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "STUDENT" },
    } as any);

    const existingCourse = { id: "1", title: "Course" };
    vi.mocked(db.course.findFirst).mockResolvedValue(existingCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "PUT",
      body: JSON.stringify({ title: "New Title" }),
    });
    const response = await PUT(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 400 for invalid title update", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "TEACHER" },
    } as any);

    const existingCourse = { id: "1", title: "Course" };
    vi.mocked(db.course.findFirst).mockResolvedValue(existingCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "PUT",
      body: JSON.stringify({ title: "" }),
    });
    const response = await PUT(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Title must be a non-empty string");
  });
});

describe("Courses API - DELETE /api/courses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should soft delete course as TEACHER", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "user1",
        email: "teacher@example.com",
        name: "Teacher",
        role: "TEACHER",
      },
    } as any);

    const existingCourse = { id: "1", title: "Course" };
    vi.mocked(db.course.findFirst).mockResolvedValue(existingCourse as any);
    vi.mocked(db.course.update).mockResolvedValue({ ...existingCourse, deletedAt: new Date() } as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.success).toBe(true);
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 404 when course not found", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "TEACHER" },
    } as any);
    vi.mocked(db.course.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Course not found");
  });

  it("should return 403 when STUDENT tries to delete", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user1", role: "STUDENT" },
    } as any);

    const existingCourse = { id: "1", title: "Course" };
    vi.mocked(db.course.findFirst).mockResolvedValue(existingCourse as any);

    const request = new NextRequest("http://localhost:3000/api/courses/1", {
      method: "DELETE",
    });
    const response = await DELETE(request as any, {
      params: Promise.resolve({ id: "1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });
});
