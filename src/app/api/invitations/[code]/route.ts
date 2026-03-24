import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";

// Rate limit configuration for invitation code validation
const CODE_VALIDATE_LIMIT = {
  maxRequests: 30, // 30 validations per 5 minutes
  windowMs: 5 * 60 * 1000,
};

// Rate limit configuration for invitation acceptance
const CODE_ACCEPT_LIMIT = {
  maxRequests: 10, // 10 accept attempts per hour
  windowMs: 60 * 60 * 1000,
};

type RouteContext = {
  params: Promise<{ code: string }>;
};

/**
 * GET /api/invitations/[code] - Validate invitation code without accepting it
 * Accessible without authentication (for QR code scanning, etc.)
 * Rate limited by IP address to prevent brute force attacks
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { data: null, error: "Invalid invitation code format" },
        { status: 400 }
      );
    }

    // Rate limiting based on IP address for unauthenticated access
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ??
               request.headers.get("x-real-ip") ??
               "unknown";
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const rateLimit = checkRateLimit(`invite_validate:${ip}`, CODE_VALIDATE_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: "Too many validation attempts. Please try again later." },
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

    // Find invitation by code
    const invitation = await db.invitation.findUnique({
      where: { code },
      include: {
        creator: {
          select: { id: true, name: true, email: true, role: true },
        },
        course: {
          select: { id: true, title: true, description: true, imageUrl: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { data: null, error: "Invitation code not found" },
        { status: 404 }
      );
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        {
          data: {
            code: invitation.code,
            type: invitation.type,
            status: "EXPIRED",
            expiresAt: invitation.expiresAt,
          },
          error: "Invitation code has expired",
        },
        { status: 410 }
      );
    }

    // Check if already accepted
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        {
          data: {
            code: invitation.code,
            type: invitation.type,
            status: "ACCEPTED",
          },
          error: "Invitation code has already been used",
        },
        { status: 409 }
      );
    }

    // Check if revoked
    if (invitation.status === "REVOKED") {
      return NextResponse.json(
        {
          data: {
            code: invitation.code,
            type: invitation.type,
            status: "REVOKED",
          },
          error: "Invitation code has been revoked",
        },
        { status: 410 }
      );
    }

    // Return invitation details for validation
    // For security, limit the information returned for unauthenticated requests
    const session = await getSession();
    const isAuthenticated = !!session?.user;

    return NextResponse.json(
      {
        data: {
          id: isAuthenticated ? invitation.id : undefined,
          code: invitation.code,
          type: invitation.type,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          // Only include full details if authenticated
          ...(isAuthenticated && {
            creator: invitation.creator,
            course: invitation.course,
            organization: invitation.organization,
            studentEmail: invitation.studentEmail,
            guardianEmail: invitation.guardianEmail,
          }),
        },
        error: null,
      },
      {
        headers: {
          "X-RateLimit-Limit": rateLimit.limit.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
        },
      }
    );
  } catch (error) {
    console.error("Error validating invitation code:", error);
    return NextResponse.json(
      { data: null, error: "Failed to validate invitation code" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invitations/[code]/accept - Accept an invitation code
 * Requires authentication
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized. Please sign in to accept this invitation." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    const userRole = session.user.role as UserRole;
    const userOrganizationId = session.user.organizationId;

    if (!userOrganizationId) {
      return NextResponse.json(
        { data: null, error: "User must belong to an organization" },
        { status: 400 }
      );
    }

    // Rate limiting
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const rateLimit = checkRateLimit(`invite_accept:${userId}`, CODE_ACCEPT_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: "Too many accept attempts. Please try again later." },
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

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { data: null, error: "Invalid invitation code format" },
        { status: 400 }
      );
    }

    // Find invitation by code
    const invitation = await db.invitation.findUnique({
      where: { code },
      include: {
        course: true,
        creator: true,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { data: null, error: "Invitation code not found" },
        { status: 404 }
      );
    }

    // Verify organization match
    if (invitation.organizationId !== userOrganizationId) {
      return NextResponse.json(
        { data: null, error: "This invitation is for a different organization" },
        { status: 403 }
      );
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { data: null, error: "Invitation code has expired" },
        { status: 410 }
      );
    }

    // Check if already accepted
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        { data: null, error: "Invitation code has already been used" },
        { status: 409 }
      );
    }

    // Check if revoked
    if (invitation.status === "REVOKED") {
      return NextResponse.json(
        { data: null, error: "Invitation code has been revoked" },
        { status: 410 }
      );
    }

    // Type-specific acceptance logic
    if (invitation.type === "STUDENT_TO_COURSE") {
      // Only students can accept course invitations
      if (userRole !== "STUDENT" && userRole !== "ADMIN") {
        return NextResponse.json(
          { data: null, error: "Only students can accept course invitations" },
          { status: 403 }
        );
      }

      if (!invitation.courseId) {
        return NextResponse.json(
          { data: null, error: "Invalid invitation: missing course" },
          { status: 400 }
        );
      }

      // Check for existing enrollment
      const existingEnrollment = await db.enrollment.findFirst({
        where: {
          userId,
          courseId: invitation.courseId,
          deletedAt: null,
        },
      });

      if (existingEnrollment) {
        return NextResponse.json(
          { data: null, error: "You are already enrolled in this course" },
          { status: 409 }
        );
      }

      // Use transaction to create enrollment and update invitation atomically
      await db.$transaction(async (tx) => {
        // Create enrollment
        await tx.enrollment.create({
          data: {
            userId,
            courseId: invitation.courseId!, // Non-null asserted after check above
            status: "ACTIVE",
          },
        });

        // Update invitation status
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedBy: userId,
          },
        });
      });

      return NextResponse.json(
        {
          data: {
            success: true,
            type: "STUDENT_TO_COURSE",
            course: invitation.course,
          },
          error: null,
        },
        { status: 200 }
      );
    }

    if (invitation.type === "GUARDIAN_TO_STUDENT") {
      // Only the student (whose email matches) can accept the guardian invitation
      if (!invitation.studentEmail) {
        return NextResponse.json(
          { data: null, error: "Invalid invitation: missing student email" },
          { status: 400 }
        );
      }

      // The authenticated user must be the student
      if (userEmail !== invitation.studentEmail) {
        return NextResponse.json(
          { data: null, error: "This invitation is for a different student" },
          { status: 403 }
        );
      }

      // Check if relationship already exists
      const existingRelationship = await db.guardianStudent.findFirst({
        where: {
          guardianId: invitation.creatorId,
          studentId: userId,
          deletedAt: null,
        },
      });

      if (existingRelationship) {
        return NextResponse.json(
          { data: null, error: "Guardian-student relationship already exists" },
          { status: 409 }
        );
      }

      // Use transaction to create relationship and update invitation atomically
      const [guardianStudent] = await db.$transaction(async (tx) => {
        // Create guardian-student relationship
        const relationship = await tx.guardianStudent.create({
          data: {
            guardianId: invitation.creatorId,
            studentId: userId,
            relationship: "parent",
          },
          include: {
            guardian: {
              select: { id: true, name: true, email: true },
            },
            student: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        // Update invitation status
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedBy: userId,
          },
        });

        return [relationship];
      });

      return NextResponse.json(
        {
          data: {
            success: true,
            type: "GUARDIAN_TO_STUDENT",
            relationship: guardianStudent,
          },
          error: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { data: null, error: "Invalid invitation type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error accepting invitation code:", error);
    return NextResponse.json(
      { data: null, error: "Failed to accept invitation code" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invitations/[code] - Revoke an invitation (creator only)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { code } = await context.params;
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    const invitation = await db.invitation.findUnique({
      where: { code },
    });

    if (!invitation) {
      return NextResponse.json(
        { data: null, error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Only creator or admin can revoke
    if (invitation.creatorId !== userId && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only revoke your own invitations" },
        { status: 403 }
      );
    }

    // Only pending invitations can be revoked
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { data: null, error: "Can only revoke pending invitations" },
        { status: 400 }
      );
    }

    const updated = await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED" },
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to revoke invitation" },
      { status: 500 }
    );
  }
}
