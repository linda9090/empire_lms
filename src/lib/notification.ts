import {
  NotificationEmailStatus,
  NotificationEventType,
  Prisma,
  UserRole,
  type Notification,
} from "@prisma/client";
import { z } from "zod/v4";
import { db } from "@/lib/db";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RETRY_SCHEDULE_MINUTES = [5, 30, 120] as const;
const MAX_IDEMPOTENCY_KEY_LENGTH = 191;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const globalForNotificationRateLimit = globalThis as typeof globalThis & {
  notificationRateLimitStore?: Map<string, RateLimitBucket>;
};

const notificationRateLimitStore =
  globalForNotificationRateLimit.notificationRateLimitStore ?? new Map<string, RateLimitBucket>();

if (process.env.NODE_ENV !== "production") {
  globalForNotificationRateLimit.notificationRateLimitStore = notificationRateLimitStore;
}

const notificationRecipientSchema = z.object({
  userId: z.string().trim().min(1, "recipient.userId is required"),
  email: z.string().trim().email().optional().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
  role: z.nativeEnum(UserRole).optional().nullable(),
});

const notificationMetadataSchema = z.union([z.record(z.string(), z.unknown()), z.string()]);

const createNotificationSchema = z.object({
  recipient: notificationRecipientSchema,
  eventType: z.nativeEnum(NotificationEventType),
  title: z.string().trim().min(1, "title is required").max(140),
  message: z.string().trim().min(1, "message is required").max(4000),
  linkUrl: z.string().trim().url().max(2048).optional().nullable(),
  metadata: notificationMetadataSchema.optional().nullable(),
  courseId: z.string().trim().min(1).optional().nullable(),
  lessonId: z.string().trim().min(1).optional().nullable(),
  idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH).optional(),
  sendEmail: z.boolean().optional(),
});

const retryFailedNotificationEmailsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export type NotificationRecipient = z.infer<typeof notificationRecipientSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type RetryFailedNotificationEmailsInput = z.infer<typeof retryFailedNotificationEmailsSchema>;

export type RetryNotificationResult = {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
};

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializeMetadata(
  metadata: z.infer<typeof notificationMetadataSchema> | undefined | null
): string | null {
  if (metadata === undefined || metadata === null) {
    return null;
  }

  if (typeof metadata === "string") {
    const trimmed = metadata.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return JSON.stringify(metadata);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  return false;
}

function computeNextRetryAt(retryCount: number): Date | null {
  const index = retryCount - 1;
  if (index < 0 || index >= DEFAULT_RETRY_SCHEDULE_MINUTES.length) {
    return null;
  }

  const minutes = DEFAULT_RETRY_SCHEDULE_MINUTES[index];
  return new Date(Date.now() + minutes * 60_000);
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }

  return "Unknown email sending error";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildNotificationEmailHtml(
  title: string,
  message: string,
  linkUrl?: string | null
): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");
  const ctaHtml = linkUrl
    ? `<p style="margin-top:20px;"><a href="${escapeHtml(linkUrl)}" style="color:#ffffff;background:#0f766e;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block;">알림 확인하기</a></p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:20px;">
      <h2 style="font-size:20px;margin-bottom:12px;">${safeTitle}</h2>
      <p style="margin:0 0 10px 0;">${safeMessage}</p>
      ${ctaHtml}
      <p style="margin-top:24px;font-size:12px;color:#6b7280;">Empire LMS 알림 메일입니다.</p>
    </div>
  `;
}

async function sendNotificationEmailViaResend(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Empire LMS <notifications@empire-lms.com>";

  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Resend request failed (${response.status}): ${responseBody.slice(0, 500)}`
    );
  }
}

async function markEmailAsSkipped(notificationId: string, reason: string): Promise<Notification> {
  return db.notification.update({
    where: { id: notificationId },
    data: {
      emailStatus: NotificationEmailStatus.SKIPPED,
      emailError: reason,
      emailLastAttemptAt: new Date(),
      nextEmailRetryAt: null,
    },
  });
}

async function markEmailSuccess(notificationId: string): Promise<Notification> {
  const now = new Date();

  return db.notification.update({
    where: { id: notificationId },
    data: {
      emailStatus: NotificationEmailStatus.SENT,
      emailError: null,
      emailSentAt: now,
      emailLastAttemptAt: now,
      nextEmailRetryAt: null,
    },
  });
}

async function markEmailFailure(
  notificationId: string,
  currentRetryCount: number,
  errorMessage: string
): Promise<Notification> {
  const nextRetryCount = currentRetryCount + 1;
  const nextRetryAt = computeNextRetryAt(nextRetryCount);

  return db.notification.update({
    where: { id: notificationId },
    data: {
      emailStatus: nextRetryAt
        ? NotificationEmailStatus.RETRY_PENDING
        : NotificationEmailStatus.FAILED,
      emailError: errorMessage,
      emailRetryCount: nextRetryCount,
      emailLastAttemptAt: new Date(),
      nextEmailRetryAt: nextRetryAt,
    },
  });
}

async function deliverNotificationEmail(input: {
  notificationId: string;
  email: string | null | undefined;
  title: string;
  message: string;
  linkUrl?: string | null;
  retryCount: number;
}): Promise<Notification> {
  const normalizedEmail = normalizeOptionalString(input.email);

  if (!normalizedEmail) {
    return markEmailAsSkipped(input.notificationId, "No recipient email address");
  }

  try {
    await sendNotificationEmailViaResend({
      to: normalizedEmail,
      subject: `[Empire LMS] ${input.title}`,
      html: buildNotificationEmailHtml(input.title, input.message, input.linkUrl),
    });

    return markEmailSuccess(input.notificationId);
  } catch (error) {
    return markEmailFailure(
      input.notificationId,
      input.retryCount,
      sanitizeErrorMessage(error)
    );
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ? trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
    : trimmed;
}

export function buildNotificationIdempotencyKey(
  ...parts: Array<string | number | null | undefined>
): string | undefined {
  const normalized = parts
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .filter((part) => part.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalizeIdempotencyKey(normalized.join(":"));
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const parsed = createNotificationSchema.parse(input);

  const metadata = serializeMetadata(parsed.metadata);
  const shouldSendEmail = parsed.sendEmail ?? true;
  const recipientEmail = normalizeOptionalString(parsed.recipient.email);
  const idempotencyKey = normalizeIdempotencyKey(parsed.idempotencyKey);

  let notification: Notification;

  try {
    notification = await db.notification.create({
      data: {
        userId: parsed.recipient.userId,
        eventType: parsed.eventType,
        title: parsed.title,
        message: parsed.message,
        linkUrl: normalizeOptionalString(parsed.linkUrl),
        metadata,
        idempotencyKey,
        courseId: normalizeOptionalString(parsed.courseId),
        lessonId: normalizeOptionalString(parsed.lessonId),
        emailStatus:
          shouldSendEmail && recipientEmail
            ? NotificationEmailStatus.PENDING
            : NotificationEmailStatus.SKIPPED,
        emailError:
          shouldSendEmail && recipientEmail ? null : "Email disabled or recipient email missing",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error) && idempotencyKey) {
      const existing = await db.notification.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    throw error;
  }

  if (!shouldSendEmail || !recipientEmail) {
    return notification;
  }

  return deliverNotificationEmail({
    notificationId: notification.id,
    email: recipientEmail,
    title: notification.title,
    message: notification.message,
    linkUrl: notification.linkUrl,
    retryCount: notification.emailRetryCount,
  });
}

export async function createNotificationsForRecipients(input: {
  recipients: NotificationRecipient[];
  eventType: NotificationEventType;
  title: string;
  message: string;
  linkUrl?: string | null;
  metadata?: z.infer<typeof notificationMetadataSchema> | null;
  courseId?: string | null;
  lessonId?: string | null;
  idempotencyKeyPrefix?: string;
  sendEmail?: boolean;
}): Promise<Notification[]> {
  const notifications = await Promise.allSettled(
    input.recipients.map((recipient) =>
      createNotification({
        recipient,
        eventType: input.eventType,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl,
        metadata: input.metadata,
        courseId: input.courseId,
        lessonId: input.lessonId,
        idempotencyKey: input.idempotencyKeyPrefix
          ? buildNotificationIdempotencyKey(input.idempotencyKeyPrefix, recipient.userId)
          : undefined,
        sendEmail: input.sendEmail,
      })
    )
  );

  return notifications.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
}

export async function retryFailedNotificationEmails(
  input: RetryFailedNotificationEmailsInput = {}
): Promise<RetryNotificationResult> {
  const parsed = retryFailedNotificationEmailsSchema.parse(input);
  const now = new Date();
  const limit = parsed.limit ?? 25;

  const notifications = await db.notification.findMany({
    where: {
      OR: [
        { emailStatus: NotificationEmailStatus.PENDING },
        {
          emailStatus: NotificationEmailStatus.RETRY_PENDING,
          nextEmailRetryAt: {
            lte: now,
          },
        },
      ],
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
    orderBy: [{ nextEmailRetryAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of notifications) {
    const updated = await deliverNotificationEmail({
      notificationId: notification.id,
      email: notification.user.email,
      title: notification.title,
      message: notification.message,
      linkUrl: notification.linkUrl,
      retryCount: notification.emailRetryCount,
    });

    if (updated.emailStatus === NotificationEmailStatus.SENT) {
      sent += 1;
      continue;
    }

    if (updated.emailStatus === NotificationEmailStatus.RETRY_PENDING) {
      retried += 1;
      continue;
    }

    if (updated.emailStatus === NotificationEmailStatus.SKIPPED) {
      skipped += 1;
      continue;
    }

    failed += 1;
  }

  return {
    processed: notifications.length,
    sent,
    retried,
    failed,
    skipped,
  };
}

export async function getNotificationRecipientsByUserIds(
  userIds: string[]
): Promise<NotificationRecipient[]> {
  const normalizedUserIds = Array.from(
    new Set(userIds.map((id) => id.trim()).filter((id) => id.length > 0))
  );

  if (normalizedUserIds.length === 0) {
    return [];
  }

  const users = await db.user.findMany({
    where: {
      id: {
        in: normalizedUserIds,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  return users.map((user) => ({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }));
}

export function consumeNotificationRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  const bucket = notificationRateLimitStore.get(input.key);

  if (!bucket || bucket.resetAt <= now) {
    notificationRateLimitStore.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(input.limit - 1, 0),
      resetAt: now + input.windowMs,
    };
  }

  if (bucket.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  notificationRateLimitStore.set(input.key, bucket);

  return {
    allowed: true,
    remaining: Math.max(input.limit - bucket.count, 0),
    resetAt: bucket.resetAt,
  };
}

export function getRetryAfterSeconds(resetAtMs: number): number {
  return Math.max(Math.ceil((resetAtMs - Date.now()) / 1000), 1);
}
