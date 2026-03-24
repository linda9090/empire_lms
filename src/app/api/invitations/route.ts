import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import { checkRateLimit, getClientIp, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { UserRole, InvitationType } from "@/types";

// Generate a 6-character invite code (56 billion combinations)
function generateInviteCode(): string {
  return nanoid(6);
}

// Calculate expiration date (7 days from now)
function calculateExpiration(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return expiresAt;
}

// GET /api/invitations - List invitations for the current user
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
    const where: Record<string, unknown> = {};

    // Non-admins can only see their own invitations
    if (userRole !== "ADMIN") {
      where.OR = [
        { createdById: userId },
        { acceptedById: userId },
      ];
    }

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    // Filter by type if provided
    if (type) {
      where.type = type;
    }

    const invitations = await db.invitation.findMany({
      where,
      include: {
        course: {
          select: { id: true, title: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        acceptedBy: {
          select: { id: true, name: true, email: true, role: true },
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

    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // Rate limiting
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(
      `${clientIp}:${userId}:create`,
      RATE_LIMIT_CONFIGS.invitationCreate
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: "Too many invitations created. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_CONFIGS.invitationCreate.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    const body = await request.json();
    const { type, courseId, studentEmail } = body;

    // Validation
    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { data: null, error: "Invitation type is required" },
        { status: 400 }
      );
    }

    const invitationType = type as InvitationType;

    // TEACHER can only create STUDENT_TO_COURSE invitations for their courses
    // GUARDIAN can only create GUARDIAN_TO_STUDENT invitations
    // ADMIN can create any type

    if (invitationType === "STUDENT_TO_COURSE") {
      if (userRole !== "TEACHER" && userRole !== "ADMIN") {
        return NextResponse.json(
          { data: null, error: "Only teachers and admins can create course invitations" },
          { status: 403 }
        );
      }

      if (!courseId || typeof courseId !== "string") {
        return NextResponse.json(
          { data: null, error: "courseId is required for course invitations" },
          { status: 400 }
        );
      }

      // Verify course exists and teacher owns it (or admin)
      const course = await db.course.findFirst({
        where: {
          id: courseId,
          deletedAt: null,
          ...(userRole === "TEACHER" ? { teacherId: userId } : {}),
        },
      });

      if (!course) {
        return NextResponse.json(
          { data: null, error: "Course not found or access denied" },
          { status: 404 }
        );
      }

      // Create STUDENT_TO_COURSE invitation
      const code = generateInviteCode();
      const invitation = await db.invitation.create({
        data: {
          code,
          type: invitationType,
          courseId,
          studentEmail: studentEmail || null,
          createdById: userId,
          expiresAt: calculateExpiration(),
        },
        include: {
          course: {
            select: { id: true, title: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      return NextResponse.json(
        { data: invitation, error: null },
        {
          status: 201,
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    if (invitationType === "GUARDIAN_TO_STUDENT") {
      if (userRole !== "GUARDIAN" && userRole !== "ADMIN") {
        return NextResponse.json(
          { data: null, error: "Only guardians and admins can create guardian invitations" },
          { status: 403 }
        );
      }

      // Create GUARDIAN_TO_STUDENT invitation
      const code = generateInviteCode();
      const invitation = await db.invitation.create({
        data: {
          code,
          type: invitationType,
          guardianId: userId,
          createdById: userId,
          expiresAt: calculateExpiration(),
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      return NextResponse.json(
        { data: invitation, error: null },
        {
          status: 201,
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    return NextResponse.json(
      { data: null, error: "Invalid invitation type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
