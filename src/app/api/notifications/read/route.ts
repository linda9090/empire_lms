import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import {
  consumeNotificationRateLimit,
  getRetryAfterSeconds,
} from "@/lib/notification";

const markReadSchema = z
  .object({
    notificationId: z.string().trim().min(1).optional(),
    notificationIds: z.array(z.string().trim().min(1)).max(100).optional(),
    markAll: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const hasSingleId = Boolean(value.notificationId);
    const hasManyIds = Boolean(value.notificationIds && value.notificationIds.length > 0);

    if (value.markAll && (hasSingleId || hasManyIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "markAll cannot be combined with notificationId(s)",
      });
      return;
    }

    if (!value.markAll && !hasSingleId && !hasManyIds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "notificationId, notificationIds, or markAll=true is required",
      });
    }
  });

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const limitResult = consumeNotificationRateLimit({
      key: `notifications:read:${userId}`,
      limit: 30,
      windowMs: 60_000,
    });

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: "Too many requests",
          meta: {
            retryAfter: getRetryAfterSeconds(limitResult.resetAt),
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const parseResult = markReadSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: parseResult.error.issues[0]?.message ?? "Invalid request body",
        },
        { status: 400 }
      );
    }

    const payload = parseResult.data;

    if (payload.markAll) {
      const result = await db.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return NextResponse.json({
        data: {
          updatedCount: result.count,
          markAll: true,
        },
        error: null,
      });
    }

    const requestedIds = Array.from(
      new Set(
        [payload.notificationId, ...(payload.notificationIds ?? [])]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );

    if (requestedIds.length === 0) {
      return NextResponse.json(
        { data: null, error: "No notifications to update" },
        { status: 400 }
      );
    }

    const targets = await db.notification.findMany({
      where: {
        id: {
          in: requestedIds,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (targets.length !== requestedIds.length) {
      return NextResponse.json(
        { data: null, error: "Notification not found" },
        { status: 404 }
      );
    }

    const hasForeignNotification = targets.some(
      (notification) => notification.userId !== userId
    );

    if (hasForeignNotification) {
      return NextResponse.json(
        {
          data: null,
          error: "Forbidden: You can only update your own notifications",
        },
        { status: 403 }
      );
    }

    const result = await db.notification.updateMany({
      where: {
        id: {
          in: requestedIds,
        },
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      data: {
        updatedCount: result.count,
        markAll: false,
      },
      error: null,
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);

    return NextResponse.json(
      { data: null, error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
