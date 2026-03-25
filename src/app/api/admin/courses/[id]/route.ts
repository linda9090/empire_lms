import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, authErrorToResponse } from "@/lib/admin-auth";
import { createAuditLog, serializeForAudit, AuditTargetType } from "@/lib/audit-log";
import type { AuditAction } from "@prisma/client";

// Schema for PATCH body
const updateCourseSchema = z.object({
  isPublished: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
});

type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

/**
 * GET /api/admin/courses/[id] - Get a single course by ID
 *
 * @requires ADMIN role
 * @returns 404 if course not found
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
        { data: null, error: "Invalid course ID format" },
        { status: 400 }
      );
    }

    const course = await db.course.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        teacher: {
          select: { id: true, name: true, email: true, role: true },
        },
        _count: {
          select: {
            enrollments: true,
            sections: true,
            activities: true,
          },
        },
      },
    });

    // 404: Course not found
    if (!course) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: course, error: null });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

/**
 * PATCH /api/admin/courses/[id] - Update course published status or soft delete
 *
 * Body:
 * - isPublished: boolean (sets course visibility)
 * - isDeleted: boolean (true = soft delete, false = restore)
 *
 * Status Codes:
 * - 400: Invalid request body or ID format
 * - 403: Not ADMIN
 * - 404: Course not found
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
        { data: null, error: "Invalid course ID format" },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const result = updateCourseSchema.safeParse(body);

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

    const input: UpdateCourseInput = result.data;

    // At least one field must be provided
    if (input.isPublished === undefined && input.isDeleted === undefined) {
      return NextResponse.json(
        { data: null, error: "At least one field (isPublished or isDeleted) must be provided" },
        { status: 400 }
      );
    }

    // Check if course exists
    const existingCourse = await db.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isPublished: true,
        deletedAt: true,
      },
    });

    // 404: Course not found
    if (!existingCourse) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: { isPublished?: boolean; deletedAt?: Date | null } = {};
    let auditAction: AuditAction | null = null;

    if (input.isPublished !== undefined && input.isPublished !== existingCourse.isPublished) {
      updateData.isPublished = input.isPublished;
      // Track unpublish as audit action
      if (!input.isPublished && existingCourse.isPublished) {
        auditAction = "COURSE_UNPUBLISHED";
      }
    }

    if (input.isDeleted !== undefined) {
      if (input.isDeleted && !existingCourse.deletedAt) {
        updateData.deletedAt = new Date();
        auditAction = auditAction || "COURSE_DELETED";
      } else if (!input.isDeleted && existingCourse.deletedAt) {
        updateData.deletedAt = null;
        auditAction = auditAction || "COURSE_RESTORED";
      }
    }

    // No changes needed
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { data: existingCourse, error: null },
        { status: 200 }
      );
    }

    // Perform update
    const updatedCourse = await db.course.update({
      where: { id },
      data: updateData,
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            enrollments: true,
            sections: true,
            activities: true,
          },
        },
      },
    });

    // Create audit log for destructive actions
    if (auditAction) {
      await createAuditLog({
        auth,
        action: auditAction,
        targetType: AuditTargetType.COURSE,
        targetId: id,
        oldValue: serializeForAudit({
          isPublished: existingCourse.isPublished,
          deletedAt: existingCourse.deletedAt,
        }),
        newValue: serializeForAudit({
          isPublished: updatedCourse.isPublished,
          deletedAt: updatedCourse.deletedAt,
        }),
      });
    }

    return NextResponse.json({ data: updatedCourse, error: null });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

/**
 * DELETE /api/admin/courses/[id] - Permanently delete a course
 *
 * WARNING: This is a hard delete and cannot be undone.
 * Consider using PATCH with isDeleted=true for soft delete instead.
 *
 * Status Codes:
 * - 400: Invalid ID format
 * - 403: Not ADMIN
 * - 404: Course not found
 * - 200: Successfully deleted
 *
 * @requires ADMIN role
 * @audit Deletion is logged
 */
export async function DELETE(
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
        { data: null, error: "Invalid course ID format" },
        { status: 400 }
      );
    }

    // Check if course exists
    const existingCourse = await db.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        deletedAt: true,
      },
    });

    // 404: Course not found
    if (!existingCourse) {
      return NextResponse.json(
        { data: null, error: "Course not found" },
        { status: 404 }
      );
    }

    // Store course data for audit before deletion
    const oldValue = serializeForAudit(existingCourse);

    // Perform hard delete
    await db.course.delete({
      where: { id },
    });

    // Create audit log
    await createAuditLog({
      auth,
      action: "COURSE_DELETED",
      targetType: AuditTargetType.COURSE,
      targetId: id,
      oldValue,
      newValue: null, // Deleted, no new value
    });

    return NextResponse.json(
      { data: { id, message: "Course permanently deleted" }, error: null },
      { status: 200 }
    );
  } catch (error) {
    return authErrorToResponse(error);
  }
}
