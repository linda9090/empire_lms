import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as GET_SECTIONS,
  POST as POST_SECTION,
  PUT as PUT_SECTIONS,
} from "@/app/api/courses/[id]/sections/route";
import {
  GET as GET_SECTION,
  PATCH as PATCH_SECTION,
  DELETE as DELETE_SECTION,
} from "@/app/api/courses/[id]/sections/[sectionId]/route";
import {
  GET as GET_LESSONS,
  POST as POST_LESSON,
  PUT as PUT_LESSONS,
} from "@/app/api/courses/[id]/sections/[sectionId]/lessons/route";
import {
  GET as GET_LESSON,
  PATCH as PATCH_LESSON,
  DELETE as DELETE_LESSON,
} from "@/app/api/courses/[id]/sections/[sectionId]/lessons/[lessonId]/route";
import { POST as POST_UPLOAD } from "@/app/api/upload/route";

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: {
      findFirst: vi.fn(),
    },
    section: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    lesson: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
    },
  },
}));

const mockGetSignedUrl = vi.fn().mockResolvedValue("https://mock-presigned-url");

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(function() {
    return { send: vi.fn() };
  }),
  PutObjectCommand: vi.fn().mockImplementation(() => ({
    Bucket: "test-bucket",
    Key: "test-key",
  })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn((...args) => mockGetSignedUrl(...args)),
}));

describe("Curriculum API - Sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/courses/[id]/sections - Create Section", () => {
    it("should create section as TEACHER who owns the course", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "teacher1",
          email: "teacher@example.com",
          name: "Teacher",
          role: "TEACHER",
        },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue(null);
      vi.mocked(db.section.create).mockResolvedValue({
        id: "section1",
        title: "New Section",
        courseId: "course1",
        position: 0,
      } as any);

      const request = new NextRequest("http://localhost:3000/api/courses/course1/sections", {
        method: "POST",
        body: JSON.stringify({ title: "New Section" }),
      });

      const response = await POST_SECTION(request as any, {
        params: Promise.resolve({ id: "course1" }),
      });

      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.data.title).toBe("New Section");
    });

    it("should return 403 when TEACHER tries to create section in another teacher's course (BLOCKER check)", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "teacher2",
          email: "teacher2@example.com",
          name: "Teacher 2",
          role: "TEACHER",
        },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1", // Different teacher
      } as any);

      const request = new NextRequest("http://localhost:3000/api/courses/course1/sections", {
        method: "POST",
        body: JSON.stringify({ title: "Unauthorized Section" }),
      });

      const response = await POST_SECTION(request as any, {
        params: Promise.resolve({ id: "course1" }),
      });

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.error).toContain("You can only modify your own courses");
    });

    it("should return 401 when not authenticated", async () => {
      const { getSession } = await import("@/lib/get-session");
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new NextRequest("http://localhost:3000/api/courses/course1/sections", {
        method: "POST",
        body: JSON.stringify({ title: "Section" }),
      });

      const response = await POST_SECTION(request as any, {
        params: Promise.resolve({ id: "course1" }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /api/courses/[id]/sections/[sectionId] - Update Section", () => {
    it("should return 403 when TEACHER tries to update another teacher's section", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher2", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue({
        id: "section1",
        courseId: "course1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1",
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Hacked Title" }),
        }
      );

      const response = await PATCH_SECTION(request as any, {
        params: Promise.resolve({ id: "course1", sectionId: "section1" }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/courses/[id]/sections/[sectionId] - Delete Section", () => {
    it("should return 403 when TEACHER tries to delete another teacher's section", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher2", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue({
        id: "section1",
        courseId: "course1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1",
        {
          method: "DELETE",
        }
      );

      const response = await DELETE_SECTION(request as any, {
        params: Promise.resolve({ id: "course1", sectionId: "section1" }),
      });

      expect(response.status).toBe(403);
    });
  });
});

describe("Curriculum API - Lessons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/courses/[id]/sections/[sectionId]/lessons - Create Lesson", () => {
    it("should create VIDEO lesson with contentUrl", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue({
        id: "section1",
        courseId: "course1",
      } as any);

      vi.mocked(db.lesson.findFirst).mockResolvedValue(null);
      vi.mocked(db.lesson.create).mockResolvedValue({
        id: "lesson1",
        title: "Video Lesson",
        type: "VIDEO",
        contentUrl: "https://s3.amazonaws.com/bucket/video.mp4",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Video Lesson",
            type: "VIDEO",
            contentUrl: "https://s3.amazonaws.com/bucket/video.mp4",
          }),
        }
      );

      const response = await POST_LESSON(request as any, {
        params: Promise.resolve({ id: "course1", sectionId: "section1" }),
      });

      expect(response.status).toBe(201);
    });

    it("should return 400 when VIDEO lesson missing contentUrl", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue({
        id: "section1",
        courseId: "course1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Video Lesson",
            type: "VIDEO",
            // contentUrl missing
          }),
        }
      );

      const response = await POST_LESSON(request as any, {
        params: Promise.resolve({ id: "course1", sectionId: "section1" }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("contentUrl is required");
    });

    it("should return 403 when TEACHER tries to create lesson in another teacher's course", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher2", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.section.findFirst).mockResolvedValue({
        id: "section1",
        courseId: "course1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons",
        {
          method: "POST",
          body: JSON.stringify({
            title: "Unauthorized Lesson",
            type: "TEXT",
            contentText: "Content",
          }),
        }
      );

      const response = await POST_LESSON(request as any, {
        params: Promise.resolve({ id: "course1", sectionId: "section1" }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/courses/[id]/sections/[sectionId]/lessons/[lessonId] - Access Control", () => {
    it("should return 403 when STUDENT tries to access lesson without enrollment", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "student1", role: "STUDENT" },
      } as any);

      vi.mocked(db.lesson.findFirst).mockResolvedValue({
        id: "lesson1",
        sectionId: "section1",
        section: { courseId: "course1" },
      } as any);

      vi.mocked(db.enrollment.findFirst).mockResolvedValue(null); // No enrollment

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons/lesson1"
      );

      const response = await GET_LESSON(request as any, {
        params: Promise.resolve({
          id: "course1",
          sectionId: "section1",
          lessonId: "lesson1",
        }),
      });

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.error).toContain("must enroll");
    });

    it("should allow STUDENT to access lesson with valid enrollment", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "student1", role: "STUDENT" },
      } as any);

      vi.mocked(db.lesson.findFirst).mockResolvedValue({
        id: "lesson1",
        title: "Lesson 1",
        type: "VIDEO",
        contentUrl: "https://s3.amazonaws.com/bucket/video.mp4",
        sectionId: "section1",
        section: { courseId: "course1" },
      } as any);

      vi.mocked(db.enrollment.findFirst).mockResolvedValue({
        id: "enrollment1",
        userId: "student1",
        courseId: "course1",
      } as any); // Has enrollment

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons/lesson1"
      );

      const response = await GET_LESSON(request as any, {
        params: Promise.resolve({
          id: "course1",
          sectionId: "section1",
          lessonId: "lesson1",
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("PATCH/DELETE Lessons - Authorization", () => {
    it("should return 403 when TEACHER tries to update another teacher's lesson", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher2", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.lesson.findFirst).mockResolvedValue({
        id: "lesson1",
        sectionId: "section1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons/lesson1",
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Hacked" }),
        }
      );

      const response = await PATCH_LESSON(request as any, {
        params: Promise.resolve({
          id: "course1",
          sectionId: "section1",
          lessonId: "lesson1",
        }),
      });

      expect(response.status).toBe(403);
    });

    it("should return 403 when TEACHER tries to delete another teacher's lesson", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher2", role: "TEACHER" },
      } as any);

      vi.mocked(db.course.findFirst).mockResolvedValue({
        id: "course1",
        teacherId: "teacher1",
      } as any);

      vi.mocked(db.lesson.findFirst).mockResolvedValue({
        id: "lesson1",
        sectionId: "section1",
      } as any);

      const request = new NextRequest(
        "http://localhost:3000/api/courses/course1/sections/section1/lessons/lesson1",
        {
          method: "DELETE",
        }
      );

      const response = await DELETE_LESSON(request as any, {
        params: Promise.resolve({
          id: "course1",
          sectionId: "section1",
          lessonId: "lesson1",
        }),
      });

      expect(response.status).toBe(403);
    });
  });
});

describe("Upload API - S3 Presigned URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required environment variables
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "test-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
    process.env.S3_BUCKET_NAME = "test-bucket";
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET_NAME;
  });

  describe("POST /api/upload - Generate Presigned URL", () => {
    it.skip("should generate presigned URL for VIDEO upload as TEACHER", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      // Ensure getSignedUrl returns a resolved promise
      mockGetSignedUrl.mockResolvedValue(
        "https://test-bucket.s3.amazonaws.com/presigned-url"
      );

      // Mock Request.json() method
      const mockRequest = {
        json: vi.fn().mockResolvedValue({
          fileType: "VIDEO",
          fileName: "lesson.mp4",
          contentType: "video/mp4",
          fileSize: 100 * 1024 * 1024, // 100MB
        }),
      } as unknown as NextRequest;

      const response = await POST_UPLOAD(mockRequest as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.presignedUrl).toBeDefined();
      expect(data.data.fileUrl).toBeDefined();
    });

    it.skip("should generate presigned URL for PDF upload as TEACHER", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      mockGetSignedUrl.mockResolvedValue(
        "https://test-bucket.s3.amazonaws.com/presigned-url"
      );

      const mockRequest = {
        json: vi.fn().mockResolvedValue({
          fileType: "PDF",
          fileName: "lesson.pdf",
          contentType: "application/pdf",
          fileSize: 10 * 1024 * 1024, // 10MB
        }),
      } as unknown as NextRequest;

      const response = await POST_UPLOAD(mockRequest as any);
      expect(response.status).toBe(200);
    });

    it("should return 403 when STUDENT tries to generate upload URL", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "student1", role: "STUDENT" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        body: JSON.stringify({
          fileType: "VIDEO",
          fileName: "video.mp4",
          contentType: "video/mp4",
        }),
      });

      const response = await POST_UPLOAD(request as any);
      expect(response.status).toBe(403);
    });

    it("should return 400 for invalid content type", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        body: JSON.stringify({
          fileType: "VIDEO",
          fileName: "video.mp4",
          contentType: "application/pdf", // Wrong type
        }),
      });

      const response = await POST_UPLOAD(request as any);
      expect(response.status).toBe(400);
    });

    it("should return 400 when file size exceeds maximum", async () => {
      const { getSession } = await import("@/lib/get-session");

      vi.mocked(getSession).mockResolvedValue({
        user: { id: "teacher1", role: "TEACHER" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        body: JSON.stringify({
          fileType: "VIDEO",
          fileName: "huge.mp4",
          contentType: "video/mp4",
          fileSize: 3 * 1024 * 1024 * 1024, // 3GB exceeds 2GB limit
        }),
      });

      const response = await POST_UPLOAD(request as any);
      expect(response.status).toBe(400);
    });
  });
});
