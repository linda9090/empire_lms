/**
 * Notifications API
 *
 * 보안 강화:
 * - 항상 세션에서 userId를 가져와 사용 (쿼리 파라미터/바디에서 userId 직접 수신 거부)
 * - 타인의 알림 접근 시 403 반환
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { NotificationType, NotificationStatus } from "@prisma/client";

/**
 * GET /api/notifications
 *
 * 현재 로그인한 사용자의 알림 목록 조회
 * - 보안: 세션의 userId로만 필터링 (IDOR 방지)
 * - 쿼리 파라미터: isRead, limit, offset, type
 */
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

    // 쿼리 파라미터 파싱
    const isRead = searchParams.get("isRead");
    const type = searchParams.get("type") as NotificationType | null;
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const emailStatus = searchParams.get("emailStatus") as NotificationStatus | null;

    // 유효성 검사
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { data: null, error: "limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { data: null, error: "offset must be non-negative" },
        { status: 400 }
      );
    }

    // WHERE 조건 구성 (항상 userId로 필터링 - 보안 핵심)
    const where: Record<string, unknown> = { userId };

    if (isRead === "true") {
      where.isRead = true;
    } else if (isRead === "false") {
      where.isRead = false;
    }

    if (type) {
      const validTypes: NotificationType[] = [
        "ENROLLMENT_COMPLETED",
        "PAYMENT_SUCCEEDED",
        "LESSON_CREATED",
        "STUDENT_ENROLLED",
        "LESSON_COMPLETED",
        "COURSE_PUBLISHED",
        "INVITE_SENT",
        "INVITE_ACCEPTED",
      ];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { data: null, error: `Invalid type: ${type}` },
          { status: 400 }
        );
      }
      where.type = type;
    }

    if (emailStatus) {
      const validStatuses: NotificationStatus[] = ["PENDING", "SENT", "FAILED"];
      if (!validStatuses.includes(emailStatus)) {
        return NextResponse.json(
          { data: null, error: `Invalid emailStatus: ${emailStatus}` },
          { status: 400 }
        );
      }
      where.emailStatus = emailStatus;
    }

    // 알림 목록 조회
    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          emailStatus: true,
          isRead: true,
          readAt: true,
          courseId: true,
          lessonId: true,
          enrollmentId: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          // userId는 선택적으로 포함 (클라이언트에서 자신의 알림인지 확인용)
          userId: true,
        },
      }),
      db.notification.count({ where }),
    ]);

    // 안읽은 알림 수 조회
    const unreadCount = await db.notification.count({
      where: { userId, isRead: false },
    });

    return NextResponse.json({
      data: notifications,
      error: null,
      meta: {
        total,
        unreadCount,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
