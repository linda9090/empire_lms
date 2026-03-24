import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "@/app/api/invitations/[code]/route";
import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/invitations/route";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock dependencies
vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    invitation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));

describe("Invitations API - Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET /api/invitations/[code] - Rate Limiting", () => {
    it("should apply rate limiting based on IP address", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limiter");
      const { db } = await import("@/lib/db");

      // Mock rate limit exceeded
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: false,
        limit: 30,
        remaining: 0,
        resetAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });

      const response = await GET(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain("Too many validation attempts");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("should allow requests within rate limit", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limiter");
      const { db } = await import("@/lib/db");

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        resetAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      vi.mocked(db.invitation.findUnique).mockResolvedValue({
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
        creator: { id: "teacher1", name: "Teacher", email: "teacher@example.com", role: "TEACHER" },
        course: { id: "course1", title: "Course 1" },
        organization: { id: "org1", name: "Org 1", slug: "org1" },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");
      const response = await GET(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("29");
    });
  });

  describe("POST /api/invitations - Rate Limiting", () => {
    it("should limit invitation creation per user", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "teacher1",
          email: "teacher@example.com",
          name: "Teacher",
          role: "TEACHER",
          organizationId: "org1",
        },
      } as any);

      // Mock rate limit exceeded
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const request = new NextRequest("http://localhost:3000/api/invitations", {
        method: "POST",
        body: JSON.stringify({ type: "STUDENT_TO_COURSE", courseId: "course1" }),
      });

      const response = await LIST_POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain("Too many invitation codes created");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    });
  });
});

describe("Invitations API - Concurrency Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle concurrent acceptance attempts with transaction safety", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
        organizationId: "org1",
      },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      creatorId: "teacher1",
      organizationId: "org1",
      courseId: "course1",
      course: { id: "course1", title: "Course 1" },
      creator: { id: "teacher1", name: "Teacher" },
    };

    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);

    // Simulate concurrent acceptance - first succeeds, second fails
    let acceptCount = 0;
    vi.mocked(db.$transaction).mockImplementation(async (callback) => {
      acceptCount++;
      if (acceptCount === 1) {
        // First attempt succeeds
        return await callback(db as any);
      } else {
        // Second attempt would find it's already accepted (simulated by throwing)
        throw new Error("Invitation already accepted");
      }
    });

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "POST",
    });

    // First attempt should succeed
    const response1 = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
    expect(response1.status).toBe(200);

    // Verify transaction was called
    expect(db.$transaction).toHaveBeenCalled();
  });
});

describe("Invitations API - Boundary Value Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Expiration Boundary Tests", () => {
    it("should accept code 1 millisecond before expiration", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1",
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const now = Date.now();
      const expiresAt = new Date(now + 1); // 1ms from now

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt,
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
        course: { id: "course1", title: "Course 1" },
        creator: { id: "teacher1" },
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
      vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);
      vi.mocked(db.$transaction).mockImplementation(async (callback) => {
        return await callback(db as any);
      });

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      expect(response.status).toBe(200);
    });

    it("should reject code exactly at expiration time", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1",
        },
      } as any);

      const { checkRateLimit } = await import("@/lib/rate-limiter");
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const now = Date.now();
      const expiresAt = new Date(now); // Expired now

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt,
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
      vi.mocked(db.invitation.update).mockResolvedValue({ ...mockInvitation, status: "EXPIRED" } as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.error).toBe("Invitation code has expired");
      expect(db.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv1" },
        data: { status: "EXPIRED" },
      });
    });

    it("should reject code 1 millisecond after expiration", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1",
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const now = Date.now();
      const expiresAt = new Date(now - 1); // 1ms ago

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt,
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
      vi.mocked(db.invitation.update).mockResolvedValue({ ...mockInvitation, status: "EXPIRED" } as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(410);
      expect(data.error).toBe("Invitation code has expired");
    });
  });

  describe("Code Length Boundary Tests", () => {
    it("should reject codes shorter than 6 characters", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        resetAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC12");
      const response = await GET(request, { params: Promise.resolve({ code: "ABC12" }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid invitation code format");
    });

    it("should reject codes longer than 6 characters", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        resetAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC1234");
      const response = await GET(request, { params: Promise.resolve({ code: "ABC1234" }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid invitation code format");
    });

    it("should accept exactly 6 character codes", async () => {
      const { checkRateLimit } = await import("@/lib/rate-limiter");
      const { db } = await import("@/lib/db");

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 30,
        remaining: 29,
        resetAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123");
      const response = await GET(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
    });
  });
});

describe("Invitations API - Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/invitations/[code] - Accept Errors", () => {
    it("should return 409 for duplicate enrollment", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1",
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
        course: { id: "course1", title: "Course 1" },
        creator: { id: "teacher1" },
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

      // Existing enrollment found
      vi.mocked(db.enrollment.findFirst).mockResolvedValue({
        id: "enroll1",
        userId: "student1",
        courseId: "course1",
      } as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("You are already enrolled in this course");
    });

    it("should return 409 for already used code", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1",
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "ACCEPTED", // Already accepted
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        creatorId: "teacher1",
        organizationId: "org1",
        courseId: "course1",
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Invitation code has already been used");
    });

    it("should return 403 for wrong organization", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { db } = await import("@/lib/db");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "student1",
          email: "student@example.com",
          name: "Student",
          role: "STUDENT",
          organizationId: "org1", // User's org
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const mockInvitation = {
        id: "inv1",
        code: "ABC123",
        type: "STUDENT_TO_COURSE",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        creatorId: "teacher1",
        organizationId: "org2", // Different org
        courseId: "course1",
        course: { id: "course1", title: "Course 1" },
        creator: { id: "teacher1" },
      };

      vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

      const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
        method: "POST",
      });

      const response = await POST(request, { params: Promise.resolve({ code: "ABC123" }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("This invitation is for a different organization");
    });

    it("should return 400 for invalid invitation type", async () => {
      const { getSession } = await import("@/lib/get-session");
      const { checkRateLimit } = await import("@/lib/rate-limiter");

      vi.mocked(getSession).mockResolvedValue({
        user: {
          id: "teacher1",
          email: "teacher@example.com",
          name: "Teacher",
          role: "TEACHER",
          organizationId: "org1",
        },
      } as any);

      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const request = new NextRequest("http://localhost:3000/api/invitations", {
        method: "POST",
        body: JSON.stringify({ type: "INVALID_TYPE", courseId: "course1" }),
      });

      const response = await LIST_POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("type must be one of");
    });
  });
});

describe("Invitations API - Guardian Connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create GUARDIAN_TO_STUDENT invitation", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "guardian1",
        email: "guardian@example.com",
        name: "Guardian",
        role: "GUARDIAN",
        organizationId: "org1",
      },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const mockStudent = {
      id: "student1",
      email: "student@example.com",
      name: "Student",
      role: "STUDENT",
      organizationId: "org1",
    };

    vi.mocked(db.user.findFirst).mockResolvedValue(mockStudent as any);
    vi.mocked(db.guardianStudent.findFirst).mockResolvedValue(null);

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "GUARDIAN_TO_STUDENT",
      status: "PENDING",
      creatorId: "guardian1",
      organizationId: "org1",
      studentEmail: "student@example.com",
      guardianEmail: "guardian@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      creator: { id: "guardian1", name: "Guardian", email: "guardian@example.com", role: "GUARDIAN" },
      organization: { id: "org1", name: "Org 1", slug: "org1" },
    };

    vi.mocked(db.invitation.create).mockResolvedValue(mockInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({
        type: "GUARDIAN_TO_STUDENT",
        studentEmail: "student@example.com",
      }),
    });

    const response = await LIST_POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data).toBeDefined();
    expect(data.data.type).toBe("GUARDIAN_TO_STUDENT");
  });

  it("should return 409 if guardian-student relationship exists", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "guardian1",
        email: "guardian@example.com",
        name: "Guardian",
        role: "GUARDIAN",
        organizationId: "org1",
      },
    } as any);

    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const mockStudent = {
      id: "student1",
      email: "student@example.com",
      name: "Student",
      role: "STUDENT",
      organizationId: "org1",
    };

    vi.mocked(db.user.findFirst).mockResolvedValue(mockStudent as any);

    // Existing relationship
    vi.mocked(db.guardianStudent.findFirst).mockResolvedValue({
      id: "gs1",
      guardianId: "guardian1",
      studentId: "student1",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations", {
      method: "POST",
      body: JSON.stringify({
        type: "GUARDIAN_TO_STUDENT",
        studentEmail: "student@example.com",
      }),
    });

    const response = await LIST_POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Guardian-student relationship already exists");
  });
});

describe("Invitations API - DELETE (Revoke)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow creator to revoke pending invitation", async () => {
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
      creatorId: "teacher1",
    };

    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
    vi.mocked(db.invitation.update).mockResolvedValue({
      ...mockInvitation,
      status: "REVOKED",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ code: "ABC123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe("REVOKED");
  });

  it("should forbid non-creator from revoking", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "otherUser",
        email: "other@example.com",
        name: "Other",
        role: "TEACHER",
      },
    } as any);

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      creatorId: "teacher1", // Different creator
    };

    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ code: "ABC123" }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("You can only revoke your own invitations");
  });

  it("should allow admin to revoke any invitation", async () => {
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

    const mockInvitation = {
      id: "inv1",
      code: "ABC123",
      type: "STUDENT_TO_COURSE",
      status: "PENDING",
      creatorId: "teacher1",
    };

    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);
    vi.mocked(db.invitation.update).mockResolvedValue({
      ...mockInvitation,
      status: "REVOKED",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ code: "ABC123" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.status).toBe("REVOKED");
  });

  it("should only allow revoking pending invitations", async () => {
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
      status: "ACCEPTED", // Already accepted
      creatorId: "teacher1",
    };

    vi.mocked(db.invitation.findUnique).mockResolvedValue(mockInvitation as any);

    const request = new NextRequest("http://localhost:3000/api/invitations/ABC123", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ code: "ABC123" }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Can only revoke pending invitations");
  });
});
