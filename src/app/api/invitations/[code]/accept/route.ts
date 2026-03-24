import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import type { UserRole } from "@/types";

interface RouteContext {
  params: Promise<{ code: string }>;
}

// POST /api/invitations/[code]/accept - Accept an invitation
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();

    // Authentication required
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
    const userEmail = session.user.email;

    // Validate code format
    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { data: null, error: "Invalid code format" },
        { status: 400 }
      );
    }

    // Rate limiting for accept attempts
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(
      `${clientIp}:${userId}:accept`,
      RATE_LIMIT_CONFIGS.invitationAccept
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: "Too many accept attempts. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_CONFIGS.invitationAccept.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // Find and lock the invitation
      const invitation = await tx.invitation.findUnique({
        where: { code },
        include: {
          course: true,
        },
      });

      if (!invitation) {
        return { error: "Invalid invitation code", status: 404 };
      }

      // Check if expired
      if (invitation.expiresAt < new Date()) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
        return { error: "Invitation has expired", status: 410 };
      }

      // Check if already used
      if (invitation.status === "ACCEPTED") {
        return { error: "Invitation has already been used", status: 409 };
      }

      // Check if cancelled
      if (invitation.status === "CANCELLED") {
        return { error: "Invitation has been cancelled", status: 410 };
      }

      // Handle STUDENT_TO_COURSE invitations
      if (invitation.type === "STUDENT_TO_COURSE") {
        // Only students or admins can accept
        if (userRole !== "STUDENT" && userRole !== "ADMIN") {
          return { error: "Only students can accept course invitations", status: 403 };
        }

        // Verify email if specified
        if (invitation.studentEmail && userEmail !== invitation.studentEmail) {
          return { error: "This invitation is for a different email address", status: 403 };
        }

        // Check if already enrolled
        const existingEnrollment = await tx.enrollment.findFirst({
          where: {
            userId,
            courseId: invitation.courseId!,
            deletedAt: null,
          },
        });

        if (existingEnrollment) {
          return { error: "Already enrolled in this course", status: 409 };
        }

        // Create enrollment and update invitation in transaction
        const [enrollment] = await Promise.all([
          tx.enrollment.create({
            data: {
              userId,
              courseId: invitation.courseId!,
              status: "ACTIVE",
            },
            include: {
              course: {
                select: { id: true, title: true },
              },
            },
          }),
          tx.invitation.update({
            where: { id: invitation.id },
            data: {
              status: "ACCEPTED",
              acceptedById: userId,
              acceptedAt: new Date(),
            },
          }),
        ]);

        return {
          data: {
            type: "ENROLLMENT",
            enrollment,
          },
          status: 201,
        };
      }

      // Handle GUARDIAN_TO_STUDENT invitations
      if (invitation.type === "GUARDIAN_TO_STUDENT") {
        // Students accept to connect to their guardian
        if (userRole !== "STUDENT" && userRole !== "ADMIN") {
          return { error: "Only students can accept guardian connection invitations", status: 403 };
        }

        const guardianId = invitation.guardianId!;

        // Check if connection already exists
        const existingConnection = await tx.guardianStudent.findFirst({
          where: {
            guardianId,
            studentId: userId,
          },
        });

        if (existingConnection) {
          return { error: "Already connected to this guardian", status: 409 };
        }

        // Create guardian-student relationship and update invitation
        const [connection] = await Promise.all([
          tx.guardianStudent.create({
            data: {
              guardianId,
              studentId: userId,
            },
            include: {
              guardian: {
                select: { id: true, name: true, email: true },
              },
            },
          }),
          tx.invitation.update({
            where: { id: invitation.id },
            data: {
              status: "ACCEPTED",
              acceptedById: userId,
              acceptedAt: new Date(),
            },
          }),
        ]);

        return {
          data: {
            type: "GUARDIAN_CONNECTION",
            connection,
          },
          status: 201,
        };
      }

      return { error: "Invalid invitation type", status: 400 };
    });

    if ("error" in result) {
      return NextResponse.json(
        { data: null, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { data: result.data, error: null },
      { status: result.status }
    );
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { data: null, error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
