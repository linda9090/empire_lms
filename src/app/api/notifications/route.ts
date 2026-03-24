import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";
import {
  consumeNotificationRateLimit,
  getRetryAfterSeconds,
} from "@/lib/notification";

const notificationsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["all", "read", "unread"]).default("all"),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;

    if (searchParams.has("userId")) {
      return NextResponse.json(
        { data: null, error: "Filtering by userId is not allowed" },
        { status: 400 }
      );
    }

    const limitResult = consumeNotificationRateLimit({
      key: `notifications:get:${userId}`,
      limit: 60,
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

    const queryParseResult = notificationsQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    if (!queryParseResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: queryParseResult.error.issues[0]?.message ?? "Invalid query",
        },
        { status: 400 }
      );
    }

    const query = queryParseResult.data;

    const where: Prisma.NotificationWhereInput = {
      userId,
    };

    if (query.status === "read") {
      where.isRead = true;
    } else if (query.status === "unread") {
      where.isRead = false;
    }

    const [notificationsPage, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor
          ? {
              cursor: {
                id: query.cursor,
              },
              skip: 1,
            }
          : {}),
      }),
      db.notification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    const hasMore = notificationsPage.length > query.limit;
    const notifications = hasMore
      ? notificationsPage.slice(0, query.limit)
      : notificationsPage;

    const nextCursor = hasMore ? notifications[notifications.length - 1]?.id ?? null : null;

    return NextResponse.json(
      {
        data: notifications,
        error: null,
        meta: {
          hasMore,
          nextCursor,
          unreadCount,
          remaining: limitResult.remaining,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching notifications:", error);

    return NextResponse.json(
      { data: null, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
