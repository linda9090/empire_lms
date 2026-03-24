import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import type { UserRole, InvitationType } from "@/types";

// Rate limit configuration for invitation creation
const INVITE_CREATE_LIMIT = {
  maxRequests: 10, // 10 invitations per hour
  windowMs: 60 * 60 * 1000, // 1 hour
};

// GET /api/invitations - List invitations created by the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    // Build where clause based on role
    const where: any = {
      creatorId: userId,
      ...(status && { status }),
      ...(type && { type }),
    };

    // Admins can see all invitations in their organization
    if (userRole === "ADMIN" && session.user.organizationId) {
      delete where.creatorId;
      where.organizationId = session.user.organizationId;
    }

    const invitations = await db.invitation.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true, email: true, role: true },
        },
        course: {
          select: { id: true, title: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: invitations, error: null });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

// POST /api/invitations - Create a new invitation code
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;
    const organizationId = session.user.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { data: null, error: "User must belong to an organization" },
        { status: 400 }
      );
    }

    // Rate limiting check
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const rateLimit = checkRateLimit(`invite_create:${userId}`, INVITE_CREATE_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: "Too many invitation codes created. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": rateLimit.limit.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    const body = await request.json();
    const { type, courseId, studentEmail, guardianEmail } = body as {
      type: InvitationType;
      courseId?: string;
      studentEmail?: string;
      guardianEmail?: string;
    };

    // Validation
    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { data: null, error: "type is required" },
        { status: 400 }
      );
    }

    // Validate type is one of the allowed values
    const validTypes: InvitationType[] = ["STUDENT_TO_COURSE", "GUARDIAN_TO_STUDENT"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { data: null, error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Role-based permission check
    if (type === "STUDENT_TO_COURSE" && userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Only teachers and admins can create course invitations" },
        { status: 403 }
      );
    }

    if (type === "GUARDIAN_TO_STUDENT" && userRole !== "GUARDIAN" && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Only guardians and admins can create guardian-student invitations" },
        { status: 403 }
      );
    }

    // Type-specific validation
    if (type === "STUDENT_TO_COURSE") {
      if (!courseId || typeof courseId !== "string") {
        return NextResponse.json(
          { data: null, error: "courseId is required for STUDENT_TO_COURSE invitations" },
          { status: 400 }
        );
      }

      // Verify course exists and belongs to the organization
      const course = await db.course.findFirst({
        where: {
          id: courseId,
          organizationId,
          deletedAt: null,
        },
      });

      if (!course) {
        return NextResponse.json(
          { data: null, error: "Course not found or access denied" },
          { status: 404 }
        );
      }

      // For teachers, verify they own the course
      if (userRole === "TEACHER" && course.teacherId !== userId) {
        return NextResponse.json(
          { data: null, error: "You can only invite students to your own courses" },
          { status: 403 }
        );
      }
    }

    if (type === "GUARDIAN_TO_STUDENT") {
      if (!studentEmail || typeof studentEmail !== "string") {
        return NextResponse.json(
          { data: null, error: "studentEmail is required for GUARDIAN_TO_STUDENT invitations" },
          { status: 400 }
        );
      }

      // Verify student exists in the organization
      const student = await db.user.findFirst({
        where: {
          email: studentEmail,
          organizationId,
          role: "STUDENT",
          deletedAt: null,
        },
      });

      if (!student) {
        return NextResponse.json(
          { data: null, error: "Student not found in your organization" },
          { status: 404 }
        );
      }

      // Check if relationship already exists
      const existingRelationship = await db.guardianStudent.findFirst({
        where: {
          guardianId: userId,
          studentId: student.id,
          deletedAt: null,
        },
      });

      if (existingRelationship) {
        return NextResponse.json(
          { data: null, error: "Guardian-student relationship already exists" },
          { status: 409 }
        );
      }
    }

    // Generate unique 6-character code
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = nanoid(6);
      const existing = await db.invitation.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { data: null, error: "Failed to generate unique code. Please try again." },
        { status: 500 }
      );
    }

    // Create invitation with 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await db.invitation.create({
      data: {
        code,
        type,
        creatorId: userId,
        organizationId,
        courseId: type === "STUDENT_TO_COURSE" ? courseId : null,
        studentEmail: type === "GUARDIAN_TO_STUDENT" ? studentEmail : null,
        guardianEmail: type === "GUARDIAN_TO_STUDENT" ? session.user.email : null,
        expiresAt,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true, role: true },
        },
        course: {
          select: { id: true, title: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json(
      {
        data: invitation,
        error: null,
      },
      {
        status: 201,
        headers: {
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
        },
      }
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
