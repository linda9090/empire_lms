/**
 * POST /api/notifications/read
 *
 * 알림 읽음 처리
 * - 단일 알림 또는 전체 읽음 처리 지원
 * - 보안: 자신의 알림만 읽음 처리 가능 (타인 알림 403)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";

interface ReadRequestBody {
  notificationId?: string;
  readAll?: boolean;
}

/**
 * POST /api/notifications/read
 *
 * Body:
 * - notificationId: 특정 알림 읽음 처리 (string)
 * - readAll: 전체 알림 읽음 처리 (boolean)
 *
 * 보안 검증:
 * - notificationId가 있는 경우 해당 알림의 userId와 세션 userId 비교
 */
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
    const body = await request.json() as ReadRequestBody;
    const { notificationId, readAll } = body;

    // 전체 읽음 처리
    if (readAll === true) {
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
        },
        error: null,
      });
    }

    // 단일 알림 읽음 처리
    if (notificationId) {
      // 유효성 검사
      if (typeof notificationId !== "string") {
        return NextResponse.json(
          { data: null, error: "notificationId must be a string" },
          { status: 400 }
        );
      }

      // 먼저 알림 존재 여부와 소유자 확인 (보안 핵심)
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, userId: true, isRead: true, readAt: true },
      });

      if (!notification) {
        return NextResponse.json(
          { data: null, error: "Notification not found" },
          { status: 404 }
        );
      }

      // 소유자 확인 (IDOR 방지)
      if (notification.userId !== userId) {
        console.warn(`[Security] User ${userId} attempted to mark notification ${notificationId} as read (owned by ${notification.userId})`);
        return NextResponse.json(
          { data: null, error: "Forbidden: You can only mark your own notifications as read" },
          { status: 403 }
        );
      }

      // 이미 읽음 상태인 경우
      if (notification.isRead) {
        return NextResponse.json(
          { data: { ...notification }, error: null },
          { status: 200 }
        );
      }

      // 읽음 처리
      const updatedNotification = await db.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        data: updatedNotification,
        error: null,
      });
    }

    // 파라미터가 없는 경우
    return NextResponse.json(
      { data: null, error: "Either notificationId or readAll must be provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return NextResponse.json(
      { data: null, error: "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
