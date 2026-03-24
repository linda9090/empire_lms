import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { UserRole } from "@/types";

interface RouteContext {
  params: Promise<{ code: string }>;
}

// GET /api/invitations/[code] - Verify invitation code validity
// SECURITY: Requires authentication to prevent information leakage
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();

    // Authentication required - prevents unauthenticated information disclosure
    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const params = await context.params;
    const code = params.code;

    // Validate code format (6 characters)
    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { data: null, error: "Invalid code format" },
        { status: 400 }
      );
    }

    // Rate limiting for brute force protection
    const clientIp = getClientIp(request);
    const userId = session.user.id;
    const rateLimit = checkRateLimit(
      `${clientIp}:${userId}:verify`,
      RATE_LIMIT_CONFIGS.invitationVerify
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: "Too many verification attempts. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_CONFIGS.invitationVerify.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
            "Retry-After": Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // Find invitation
    const invitation = await db.invitation.findUnique({
      where: { code },
      include: {
        course: {
          select: { id: true, title: true, teacherId: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    // Code not found - return generic error to prevent enumeration
    if (!invitation) {
      return NextResponse.json(
        {
          data: null,
          error: "Invalid or expired invitation code",
        },
        {
          status: 404,
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
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
          data: null,
          error: "Invitation code has expired",
        },
        {
          status: 410, // 410 Gone
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Check if already used
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        {
          data: null,
          error: "Invitation code has already been used",
        },
        {
          status: 409, // 409 Conflict
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Check if cancelled
    if (invitation.status === "CANCELLED") {
      return NextResponse.json(
        {
          data: null,
          error: "Invitation has been cancelled",
        },
        {
          status: 410,
          headers: {
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Return invitation details
    // For security, only return necessary information
    const userRole = session.user.role as UserRole;

    // Check if user is eligible to accept this invitation
    let canAccept = false;
    let acceptReason: string | null = null;

    if (invitation.type === "STUDENT_TO_COURSE") {
      // Only STUDENT or ADMIN can accept course invitations
      if (userRole === "STUDENT" || userRole === "ADMIN") {
        canAccept = true;
      } else {
        acceptReason = "Only students can accept course invitations";
      }

      // Verify student email matches if specified
      if (invitation.studentEmail && session.user.email !== invitation.studentEmail) {
        canAccept = false;
        acceptReason = "This invitation is for a different email address";
      }
    } else if (invitation.type === "GUARDIAN_TO_STUDENT") {
      // Only STUDENT can accept guardian invitations (to connect to their guardian)
      // Or the GUARDIAN who created it can view it
      if (userRole === "STUDENT" || userRole === "ADMIN" || invitation.createdById === userId) {
        canAccept = true;
      } else {
        acceptReason = "This invitation is not for you";
      }
    }

    return NextResponse.json(
      {
        data: {
          id: invitation.id,
          type: invitation.type,
          status: invitation.status,
          canAccept,
          acceptReason,
          course: invitation.course,
          createdBy: invitation.createdBy,
          expiresAt: invitation.expiresAt,
        },
        error: null,
      },
      {
        headers: {
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
        },
      }
    );
  } catch (error) {
    console.error("Error verifying invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to verify invitation" },
      { status: 500 }
    );
  }
}

// DELETE /api/invitations/[code] - Cancel an invitation (creator only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const params = await context.params;
    const code = params.code;
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

    // Only creator or admin can cancel
    if (invitation.createdById !== userId && userRole !== "ADMIN") {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only cancel your own invitations" },
        { status: 403 }
      );
    }

    // Cannot cancel already accepted invitations
    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        { data: null, error: "Cannot cancel an already accepted invitation" },
        { status: 409 }
      );
    }

    // Cancel invitation
    const updated = await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (error) {
    console.error("Error cancelling invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}
