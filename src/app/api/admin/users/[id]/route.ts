import { NextRequest, NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

const USER_ROLES = ["TEACHER", "STUDENT", "GUARDIAN", "ADMIN"] as const;

interface UserPatchBody {
  role?: string;
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

    const body = payload as UserPatchBody;
    const hasRole = hasOwn(body, "role");
    const hasDeletedAt = hasOwn(body, "deletedAt");

    if (!hasRole && !hasDeletedAt) {
      return NextResponse.json(
        {
          error: "MISSING_UPDATE_FIELDS",
          message: "At least one of role or deletedAt must be provided",
        },
        { status: 400 }
      );
    }

    if (hasRole) {
      if (typeof body.role !== "string") {
        return NextResponse.json(
          { error: "INVALID_ROLE", message: "Invalid role specified" },
          { status: 400 }
        );
      }

      if (!USER_ROLES.includes(body.role as (typeof USER_ROLES)[number])) {
        return NextResponse.json(
          { error: "INVALID_ROLE", message: "Invalid role specified" },
          { status: 400 }
        );
      }
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

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "User not found" },
        { status: 404 }
      );
    }

    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "CANNOT_MODIFY_SELF", message: "Cannot modify your own account" },
        { status: 400 }
      );
    }

    const nextRole = hasRole ? (body.role as (typeof USER_ROLES)[number]) : undefined;
    const nextDeletedAt = hasDeletedAt
      ? parseDeletedAt((body.deletedAt as string | null) ?? null)
      : undefined;

    if (hasDeletedAt && body.deletedAt !== null && !nextDeletedAt) {
      return NextResponse.json(
        { error: "INVALID_DELETED_AT", message: "deletedAt must be a valid date" },
        { status: 400 }
      );
    }

    const willRemainAdmin = (nextRole ?? user.role) === "ADMIN";
    const willRemainActive = (nextDeletedAt ?? user.deletedAt) === null;

    if (user.role === "ADMIN" && (!willRemainAdmin || !willRemainActive)) {
      const remainingAdminCount = await db.user.count({
        where: {
          id: { not: user.id },
          role: "ADMIN",
          deletedAt: null,
        },
      });

      if (remainingAdminCount === 0) {
        return NextResponse.json(
          { error: "LAST_ADMIN", message: "Cannot modify the last active admin" },
          { status: 400 }
        );
      }
    }

    const reason = body.reason?.trim() || undefined;
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const userData: { role?: (typeof USER_ROLES)[number]; deletedAt?: Date | null } = {};

    const auditEntries: Array<{
      action: "USER_ROLE_CHANGED" | "USER_SUSPENDED" | "USER_REACTIVATED";
      oldValues?: Record<string, unknown>;
      newValues?: Record<string, unknown>;
    }> = [];

    if (nextRole && nextRole !== user.role) {
      userData.role = nextRole;
      auditEntries.push({
        action: "USER_ROLE_CHANGED",
        oldValues: { role: user.role },
        newValues: { role: nextRole },
      });
    }

    if (hasDeletedAt && !sameDate(user.deletedAt, nextDeletedAt ?? null)) {
      userData.deletedAt = nextDeletedAt ?? null;

      if (nextDeletedAt) {
        auditEntries.push({
          action: "USER_SUSPENDED",
          oldValues: { deletedAt: user.deletedAt?.toISOString() ?? null },
          newValues: { deletedAt: nextDeletedAt.toISOString() },
        });
      } else {
        auditEntries.push({
          action: "USER_REACTIVATED",
          oldValues: { deletedAt: user.deletedAt?.toISOString() ?? null },
          newValues: { deletedAt: null },
        });
      }
    }

    const shouldUpdate = Object.keys(userData).length > 0;

    const updatedUser = await db.$transaction(async (tx) => {
      const nextUser = shouldUpdate
        ? await tx.user.update({
            where: { id: user.id },
            data: userData,
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              organizationId: true,
              createdAt: true,
              deletedAt: true,
            },
          })
        : user;

      for (const auditEntry of auditEntries) {
        await createAuditLog(
          {
            actorId: session.user.id,
            action: auditEntry.action,
            targetType: "User",
            targetId: user.id,
            oldValues: auditEntry.oldValues,
            newValues: auditEntry.newValues,
            reason,
            ipAddress,
            userAgent,
          },
          tx
        );
      }

      return nextUser;
    });

    return NextResponse.json({
      user: updatedUser,
      updated: shouldUpdate,
    });
  } catch (error) {
    console.error("Error updating admin user:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "Failed to update user" },
      { status: 500 }
    );
  }
}
