import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

interface CoursePatchBody {
  isPublished?: boolean;
  deletedAt?: string | null;
  reason?: string;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseDeletedAt(value: string | null): Date | null {
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function sameDate(left: Date | null, right: Date | null): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Admin access required" },
        { status: 403 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Request body must be an object" },
        { status: 400 }
      );
    }

    const body = payload as CoursePatchBody;
    const hasIsPublished = hasOwn(body, "isPublished");
    const hasDeletedAt = hasOwn(body, "deletedAt");

    if (!hasIsPublished && !hasDeletedAt) {
      return NextResponse.json(
        {
          error: "MISSING_UPDATE_FIELDS",
          message: "At least one of isPublished or deletedAt must be provided",
        },
        { status: 400 }
      );
    }

    if (hasIsPublished && typeof body.isPublished !== "boolean") {
      return NextResponse.json(
        {
          error: "INVALID_IS_PUBLISHED",
          message: "isPublished must be a boolean",
        },
        { status: 400 }
      );
    }

    if (hasDeletedAt && !(typeof body.deletedAt === "string" || body.deletedAt === null)) {
      return NextResponse.json(
        { error: "INVALID_DELETED_AT", message: "deletedAt must be a string date or null" },
        { status: 400 }
      );
    }

    if (body.reason !== undefined && typeof body.reason !== "string") {
      return NextResponse.json(
        { error: "INVALID_REASON", message: "reason must be a string" },
        { status: 400 }
      );
    }

    const { id } = await context.params;

    const course = await db.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        isPublished: true,
        teacherId: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Course not found" },
        { status: 404 }
      );
    }

    const nextDeletedAt = hasDeletedAt
      ? parseDeletedAt((body.deletedAt as string | null) ?? null)
      : undefined;

    if (hasDeletedAt && body.deletedAt !== null && !nextDeletedAt) {
      return NextResponse.json(
        { error: "INVALID_DELETED_AT", message: "deletedAt must be a valid date" },
        { status: 400 }
      );
    }

    if (course.deletedAt && (hasIsPublished || (hasDeletedAt && body.deletedAt !== null))) {
      return NextResponse.json(
        { error: "ALREADY_DELETED", message: "Course already deleted" },
        { status: 400 }
      );
    }

    const reason = body.reason?.trim() || undefined;
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const courseData: { isPublished?: boolean; deletedAt?: Date | null } = {};

    const auditEntries: Array<{
      action: "COURSE_PUBLISHED" | "COURSE_UNPUBLISHED" | "COURSE_DELETED";
      oldValues?: Record<string, unknown>;
      newValues?: Record<string, unknown>;
    }> = [];

    if (hasIsPublished && body.isPublished !== course.isPublished) {
      courseData.isPublished = body.isPublished;
      auditEntries.push({
        action: body.isPublished ? "COURSE_PUBLISHED" : "COURSE_UNPUBLISHED",
        oldValues: { isPublished: course.isPublished },
        newValues: { isPublished: body.isPublished },
      });
    }

    if (hasDeletedAt && !sameDate(course.deletedAt, nextDeletedAt ?? null)) {
      courseData.deletedAt = nextDeletedAt ?? null;

      if (nextDeletedAt) {
        auditEntries.push({
          action: "COURSE_DELETED",
          oldValues: { deletedAt: course.deletedAt?.toISOString() ?? null },
          newValues: { deletedAt: nextDeletedAt.toISOString() },
        });
      }
    }

    const shouldUpdate = Object.keys(courseData).length > 0;

    const updatedCourse = await db.$transaction(async (tx) => {
      const nextCourse = shouldUpdate
        ? await tx.course.update({
            where: { id: course.id },
            data: courseData,
            select: {
              id: true,
              title: true,
              description: true,
              isPublished: true,
              teacherId: true,
              createdAt: true,
              deletedAt: true,
            },
          })
        : course;

      for (const auditEntry of auditEntries) {
        await createAuditLog(
          {
            actorId: session.user.id,
            action: auditEntry.action,
            targetType: "Course",
            targetId: course.id,
            oldValues: auditEntry.oldValues,
            newValues: auditEntry.newValues,
            reason,
            ipAddress,
            userAgent,
          },
          tx
        );
      }

      return nextCourse;
    });

    return NextResponse.json({
      course: updatedCourse,
      updated: shouldUpdate,
    });
  } catch (error) {
    console.error("Error updating admin course:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to update course" },
      { status: 500 }
    );
  }
}
