import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/invitations/route";
import { GET as VerifyGET, DELETE } from "@/app/api/invitations/[code]/route";
import { POST as AcceptPOST } from "@/app/api/invitations/[code]/accept/route";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    course: {
      findFirst: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    guardianStudent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
  resetRateLimit: vi.fn(),
  RATE_LIMIT_CONFIGS: {
    invitationCreate: { maxRequests: 10, windowMs: 60000 },
    invitationVerify: { maxRequests: 5, windowMs: 60000 },
    invitationAccept: { maxRequests: 3, windowMs: 60000 },
  },
}));

describe("Invitations API - POST /api/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(Date.now() + 60000),
    });
  });

  it("should create STUDENT_TO_COURSE invitation for TEACHER", async () => {
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

    const mockCourse = { id: "course1", title: "Course 1", teacherId: "teacher1" };
    vi.mocked(db.course.findFirst).mockResolvedValue(mockCourse as any);

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      courseId: "course1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    vi.mocked(db.invitation.create).mockResolvedValue(mockInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({ type: "STUDENT_TO_COURSE", courseId: "course1" }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toBeTruthy();
    expect(data.data.type).toBe("STUDENT_TO_COURSE");
  });

  it("should create GUARDIAN_TO_STUDENT invitation for GUARDIAN", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "guardian1",
        email: "guardian@example.com",
        name: "Guardian",
        role: "GUARDIAN",
      },
    } as any);

    const mockInvitation = {
      id: "inv2",
      code: "XYZ789",
      type: "GUARDIAN_TO_STUDENT",
      status: "PENDING",
      guardianId: "guardian1",
    };
    vi.mocked(db.invitation.create).mockResolvedValue(mockInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({ type: "GUARDIAN_TO_STUDENT" }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.type).toBe("GUARDIAN_TO_STUDENT");
  });

  it("should return 403 when STUDENT tries to create invitation", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({ type: "STUDENT_TO_COURSE", courseId: "course1" }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Only teachers and admins");
  });

  it("should return 400 when type is missing", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "teacher1", role: "TEACHER" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invitation type is required");
  });

  it("should enforce rate limiting", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "teacher1", role: "TEACHER" },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60000),
    });

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({ type: "STUDENT_TO_COURSE", courseId: "course1" }),
    });

    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain("Too many invitations");
    // Note: X-RateLimit-Remaining header is set in NextResponse but may not be
    // accessible in the mock Response object. The important thing is 429 status.
  });
});

describe("Invitations API - GET /api/invitations/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60000),
    });
  });

  it("should require authentication", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 410 for expired invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    const expiredInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000), // Expired
    };
    vi.mocked(db.invitation.findUnique).mockResolvedValue(expiredInvitation as any);
    vi.mocked(db.invitation.update).mockResolvedValue({
      ...expiredInvitation,
      status: "EXPIRED",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe("Invitation code has expired");
  });

  it("should return 409 for already used invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    const usedInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 100000),
    };
    vi.mocked(db.invitation.findUnique).mockResolvedValue(usedInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Invitation code has already been used");
  });

  it("should return 404 for invalid code", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    // Use a valid 6-character code that doesn't exist in database
    vi.mocked(db.invitation.findUnique).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/invitations/NOTFND");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "NOTFND" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Invalid or expired invitation code");
  });

  it("should return 400 for invalid code format", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    // Use an invalid 7-character code
    const request = new NextRequest("http://localhost:3000/api/invitations/INVALID");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "INVALID" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid code format");
  });

  it("should enforce rate limiting for verify endpoint", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60000),
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");

    const response = await VerifyGET(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);

    expect(response.status).toBe(429);
  });
});

describe("Invitations API - POST /api/invitations/[code]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 2,
      resetAt: new Date(Date.now() + 60000),
    });
  });

  it("should accept STUDENT_TO_COURSE invitation", async () => {
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

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      courseId: "course1",
      expiresAt: new Date(Date.now() + 100000),
    };
    const mockCourse = { id: "course1", title: "Course 1" };

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue(mockInvitation),
          update: vi.fn().mockResolvedValue({ ...mockInvitation, status: "ACCEPTED" }),
        },
        enrollment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "enroll1",
            userId: "student1",
            courseId: "course1",
            course: mockCourse,
          }),
        },
        guardianStudent: {
          findFirst: vi.fn(),
        },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.type).toBe("ENROLLMENT");
  });

  it("should return 410 for expired invitation on accept", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv1",
            code: "ABC123",
            type: "STUDENT_TO_COURSE",
            status: "PENDING",
            courseId: "course1",
            expiresAt: new Date(Date.now() - 1000), // Expired
          }),
          update: vi.fn(),
        },
        enrollment: { findFirst: vi.fn() },
        guardianStudent: { findFirst: vi.fn() },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data.error).toBe("Invitation has expired");
  });

  it("should return 409 for already accepted invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv1",
            code: "ABC123",
            type: "STUDENT_TO_COURSE",
            status: "ACCEPTED", // Already accepted
            courseId: "course1",
            expiresAt: new Date(Date.now() + 100000),
          }),
          update: vi.fn(),
        },
        enrollment: { findFirst: vi.fn() },
        guardianStudent: { findFirst: vi.fn() },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Invitation has already been used");
  });

  it("should return 409 for already enrolled student", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv1",
            code: "ABC123",
            type: "STUDENT_TO_COURSE",
            status: "PENDING",
            courseId: "course1",
            expiresAt: new Date(Date.now() + 100000),
          }),
          update: vi.fn(),
        },
        enrollment: {
          findFirst: vi.fn().mockResolvedValue({ id: "existing" }), // Already enrolled
        },
        guardianStudent: { findFirst: vi.fn() },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already enrolled in this course");
  });

  it("should return 403 when TEACHER tries to accept course invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "teacher1", role: "TEACHER" },
    } as any);

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: "inv1",
            code: "ABC123",
            type: "STUDENT_TO_COURSE",
            status: "PENDING",
            courseId: "course1",
            expiresAt: new Date(Date.now() + 100000),
          }),
          update: vi.fn(),
        },
        enrollment: { findFirst: vi.fn() },
        guardianStudent: { findFirst: vi.fn() },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only students can accept course invitations");
  });

  it("should accept GUARDIAN_TO_STUDENT invitation", async () => {
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

    const mockInvitation = {
      id: "inv2",
      code: "XYZ789",
      type: "GUARDIAN_TO_STUDENT",
      status: "PENDING",
      guardianId: "guardian1",
      expiresAt: new Date(Date.now() + 100000),
    };

    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      return callback({
        invitation: {
          findUnique: vi.fn().mockResolvedValue(mockInvitation),
          update: vi.fn().mockResolvedValue({ ...mockInvitation, status: "ACCEPTED" }),
        },
        enrollment: { findFirst: vi.fn() },
        guardianStudent: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "gs1",
            guardianId: "guardian1",
            studentId: "student1",
            guardian: { id: "guardian1", name: "Guardian", email: "guardian@example.com" },
          }),
        },
      } as any);
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/XYZ789/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "XYZ789" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.type).toBe("GUARDIAN_CONNECTION");
  });

  it("should enforce rate limiting for accept endpoint", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT" },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60000),
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123/accept", {
      method: "POST",
    });

    const response = await AcceptPOST(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);

    expect(response.status).toBe(429);
  });
});

describe("Invitations API - DELETE /api/invitations/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow creator to cancel invitation", async () => {
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

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      createdById: "teacher1",
    };
    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
    vi.mocked(db.invitation.update).mockResolvedValue({
      ...mockInvitation,
      status: "CANCELLED",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe("CANCELLED");
  });

  it("should return 403 when non-creator tries to cancel", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "other", role: "TEACHER" },
    } as any);

    vi.mocked(db.invitation.findUnique).mockResolvedValue({
      id: "inv1",
      createdById: "teacher1", // Different user
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Forbidden");
  });

  it("should return 409 when trying to cancel accepted invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "teacher1", role: "TEACHER" },
    } as any);

    vi.mocked(db.invitation.findUnique).mockResolvedValue({
      id: "inv1",
      createdById: "teacher1",
      status: "ACCEPTED", // Already accepted
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ code: "ABC123" }),
    } as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Cannot cancel an already accepted invitation");
  });
});
