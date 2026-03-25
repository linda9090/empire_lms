import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditAction =
  | "USER_ROLE_CHANGED"
  | "USER_SUSPENDED"
  | "USER_REACTIVATED"
  | "COURSE_PUBLISHED"
  | "COURSE_UNPUBLISHED"
  | "COURSE_DELETED"
  | "PAYMENT_REFUNDED"
  | "ADMIN_LOGIN";

export interface CreateAuditLogParams {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

type AuditDbClient = Pick<typeof db, "$executeRaw">;

function serialize(values?: Record<string, unknown>): string | null {
  return values ? JSON.stringify(values) : null;
}

export async function createAuditLog(
  params: CreateAuditLogParams,
  client: AuditDbClient = db
): Promise<void> {
  await client.$executeRaw(
    Prisma.sql`
      INSERT INTO "audit_logs" (
        "id",
        "actor_id",
        "action",
        "target_type",
        "target_id",
        "old_values",
        "new_values",
        "reason",
        "ip_address",
        "user_agent"
      ) VALUES (
        ${crypto.randomUUID()},
        ${params.actorId},
        ${params.action}::"AuditAction",
        ${params.targetType},
        ${params.targetId},
        ${serialize(params.oldValues)},
        ${serialize(params.newValues)},
        ${params.reason ?? null},
        ${params.ipAddress ?? null},
        ${params.userAgent ?? null}
      )
    `
  );
}
