import { db } from "./db";
import type { AuditAction } from "@prisma/client";
import type { AdminAuth } from "./admin-auth";

/**
 * Creates an audit log entry for admin actions.
 * This is called AFTER the action is successfully completed.
 *
 * @param auth - Admin context from requireAdmin()
 * @param action - Type of action performed
 * @param targetType - Type of target entity ("user", "course", "payment")
 * @param targetId - ID of the target entity
 * @param oldValue - JSON string of previous state (optional)
 * @param newValue - JSON string of new state (optional)
 */
export async function createAuditLog(params: {
  auth: AdminAuth;
  action: AuditAction;
  targetType: string;
  targetId: string;
  oldValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  const { auth, action, targetType, targetId, oldValue, newValue } = params;

  await db.auditLog.create({
    data: {
      adminId: auth.admin.id,
      action,
      targetType,
      targetId,
      oldValue,
      newValue,
      ipAddress: auth.ipAddress,
      userAgent: auth.userAgent,
    },
  });
}

/**
 * Helper to serialize objects for audit log storage
 */
export function serializeForAudit(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Target type constants for type safety
 */
export const AuditTargetType = {
  USER: "user",
  COURSE: "course",
  PAYMENT: "payment",
  ENROLLMENT: "enrollment",
} as const;
