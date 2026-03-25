import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, authErrorToResponse } from "@/lib/admin-auth";
import { createAuditLog, serializeForAudit, AuditTargetType } from "@/lib/audit-log";
import type { AuditAction } from "@prisma/client";
import type { UserRole } from "@/types";

// Schema for PATCH body
const updateUserSchema = z.object({
  role: z.enum(["TEACHER", "STUDENT", "GUARDIAN", "ADMIN"]).optional(),
  isSuspended: z.boolean().optional(),
});

type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * GET /api/admin/users/[id] - Get a single user by ID
 *
 * @requires ADMIN role
 * @returns 404 if user not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // verify: session.user.role !== "ADMIN"
    const auth = await requireAdmin(request);
    const { id } = await params;

    // Validate ID format
    if (!id || id.length < 20) {
      return NextResponse.json(
        { data: null, error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        organizationId: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: {
          select: {
            coursesTeaching: true,
            enrollments: true,
          },
        },
      },
    });

    // 404: User not found
    if (!user) {
      return NextResponse.json(
        { data: null, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: user, error: null });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

/**
 * PATCH /api/admin/users/[id] - Update user role or suspension status
 *
 * Body:
 * - role: "TEACHER" | "STUDENT" | "GUARDIAN" | "ADMIN"
 * - isSuspended: boolean (sets deletedAt if true, clears if false)
 *
 * Status Codes:
 * - 400: Invalid request body or ID format
 * - 403: Not ADMIN
 * - 404: User not found
 * - 200: Successfully updated
 *
 * @requires ADMIN role
 * @audit All changes are logged
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // verify: session.user.role !== "ADMIN"
    const auth = await requireAdmin(request);
    const { id } = await params;

    // Validate ID format
    if (!id || id.length < 20) {
      return NextResponse.json(
        { data: null, error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateUserSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          data: null,
          error: "Invalid request body",
          details: result.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input: UpdateUserInput = result.data;

    // At least one field must be provided
    if (input.role === undefined && input.isSuspended === undefined) {
      return NextResponse.json(
        { data: null, error: "At least one field (role or isSuspended) must be provided" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, deletedAt: true },
    });

    // 404: User not found
    if (!existingUser) {
      return NextResponse.json(
        { data: null, error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent self-modification (admins can't change their own role/suspension)
    if (id === auth.admin.id) {
      return NextResponse.json(
        { data: null, error: "Cannot modify your own account" },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: { role?: UserRole; deletedAt?: Date | null } = {};
    let auditAction: AuditAction | null = null;

    if (input.role !== undefined && input.role !== existingUser.role) {
      updateData.role = input.role;
      auditAction = "USER_ROLE_CHANGED";
    }

    if (input.isSuspended !== undefined) {
      if (input.isSuspended && !existingUser.deletedAt) {
        updateData.deletedAt = new Date();
        auditAction = auditAction || "USER_SUSPENDED";
      } else if (!input.isSuspended && existingUser.deletedAt) {
        updateData.deletedAt = null;
        auditAction = auditAction || "USER_UNSUSPENDED";
      }
    }

    // No changes needed
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { data: existingUser, error: null },
        { status: 200 }
      );
    }

    // Perform update
    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    // Create audit log
    if (auditAction === "USER_ROLE_CHANGED") {
      await createAuditLog({
        auth,
        action: "USER_ROLE_CHANGED",
        targetType: AuditTargetType.USER,
        targetId: id,
        oldValue: serializeForAudit({
          role: existingUser.role,
          deletedAt: existingUser.deletedAt,
        }),
        newValue: serializeForAudit({
          role: updatedUser.role,
          deletedAt: updatedUser.deletedAt,
        }),
      });
    } else if (auditAction) {
      await createAuditLog({
        auth,
        action: auditAction,
        targetType: AuditTargetType.USER,
        targetId: id,
        oldValue: serializeForAudit({
          role: existingUser.role,
          deletedAt: existingUser.deletedAt,
        }),
        newValue: serializeForAudit({
          role: updatedUser.role,
          deletedAt: updatedUser.deletedAt,
        }),
      });
    }

    return NextResponse.json({ data: updatedUser, error: null });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
