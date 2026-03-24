import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_BY_COURSE } from "@/app/api/progress/[courseId]/route";
import { POST } from "@/app/api/progress/route";

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: {
      findFirst: vi.fn(),
    },
    lesson: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    section: {
      findFirst: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
    },
    progress: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("Progress API - POST /api/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates progress for an enrolled student", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.lesson.findFirst).mockResolvedValue({
      id: "lesson-1",
      title: "Lesson 1",
      section: {
        courseId: "course-1",
        course: {
          id: "course-1",
          title: "Course 1",
        },
      },
    } as any);

    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.progress.findUnique).mockResolvedValue(null);
    vi.mocked(db.progress.create).mockResolvedValue({ id: "progress-1" } as any);
    vi.mocked(db.lesson.count).mockResolvedValue(5);
    vi.mocked(db.progress.count).mockResolvedValue(2);

    const request = new NextRequest("http://localhost:3000/api/progress", {
      method: "POST",
      body: JSON.stringify({ lessonId: "lesson-1" }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.courseProgress.courseId).toBe("course-1");
    expect(body.data.courseProgress.totalLessons).toBe(5);
    expect(body.data.courseProgress.completedLessons).toBe(2);
    expect(body.data.courseProgress.progressPercentage).toBe(40);
    expect(db.progress.create).toHaveBeenCalledWith({
      data: { userId: "student-1", lessonId: "lesson-1" },
    });
  });

  it("prevents duplicate completion", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.lesson.findFirst).mockResolvedValue({
      id: "lesson-1",
      title: "Lesson 1",
      section: {
        courseId: "course-1",
        course: { id: "course-1", title: "Course 1" },
      },
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.progress.findUnique).mockResolvedValue({ id: "progress-1" } as any);

    const request = new NextRequest("http://localhost:3000/api/progress", {
      method: "POST",
      body: JSON.stringify({ lessonId: "lesson-1" }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Activity already completed");
    expect(db.progress.create).not.toHaveBeenCalled();
  });

  it("returns 403 when student is not enrolled in the course", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.lesson.findFirst).mockResolvedValue({
      id: "lesson-1",
      title: "Lesson 1",
      section: {
        courseId: "course-1",
        course: { id: "course-1", title: "Course 1" },
      },
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/progress", {
      method: "POST",
      body: JSON.stringify({ lessonId: "lesson-1" }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden: You are not enrolled in this course");
  });

  it("returns 409 on race-condition unique constraint error", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.activity.findFirst).mockResolvedValue({
      id: "activity-1",
      title: "Lesson 1",
      courseId: "course-1",
      course: { id: "course-1", title: "Course 1" },
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.progress.findUnique).mockResolvedValue(null);
    vi.mocked(db.progress.create).mockRejectedValue({ code: "P2002" });

    const request = new NextRequest("http://localhost:3000/api/progress", {
      method: "POST",
      body: JSON.stringify({ activityId: "activity-1" }),
    });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Activity already completed");
  });
});

describe("Progress API - GET /api/progress/[courseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0% progress when no lesson is completed", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course-1",
      title: "Course 1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.activity.count).mockResolvedValue(5);
    vi.mocked(db.progress.count).mockResolvedValue(0);

    const request = new NextRequest("http://localhost:3000/api/progress/course-1");
    const response = await GET_BY_COURSE(request as any, {
      params: Promise.resolve({ courseId: "course-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.progressPercentage).toBe(0);
  });

  it("returns 100% progress when all lessons are completed", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course-1",
      title: "Course 1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.activity.count).mockResolvedValue(5);
    vi.mocked(db.progress.count).mockResolvedValue(5);

    const request = new NextRequest("http://localhost:3000/api/progress/course-1");
    const response = await GET_BY_COURSE(request as any, {
      params: Promise.resolve({ courseId: "course-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.progressPercentage).toBe(100);
  });

  it("calculates one completed lesson ratio correctly", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course-1",
      title: "Course 1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue({ id: "enroll-1" } as any);
    vi.mocked(db.activity.count).mockResolvedValue(10);
    vi.mocked(db.progress.count).mockResolvedValue(1);

    const request = new NextRequest("http://localhost:3000/api/progress/course-1");
    const response = await GET_BY_COURSE(request as any, {
      params: Promise.resolve({ courseId: "course-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.progressPercentage).toBe(10);
  });

  it("returns 403 for non-enrolled student", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student-1", role: "STUDENT" },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course-1",
      title: "Course 1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/progress/course-1");
    const response = await GET_BY_COURSE(request as any, {
      params: Promise.resolve({ courseId: "course-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden: You are not enrolled in this course");
  });
});
