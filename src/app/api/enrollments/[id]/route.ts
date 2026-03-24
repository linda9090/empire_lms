import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import type { UserRole } from "@/types";
import { EnrollmentStatus } from "@prisma/client";

// GET /api/enrollments/[id] - Get a single enrollment by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    const enrollment = await db.enrollment.findFirst({
      where: { id, deletedAt: null },
      include: {
        course: {
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
            _count: {
              select: { sections: true, enrollments: true },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { data: null, error: "Enrollment not found" },
        { status: 404 }
      );
    }

    // Authorization: Users can only see their own enrollments, admins can see all
    if (userRole !== "ADMIN" && enrollment.userId !== userId) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only view your own enrollments" },
        { status: 403 }
      );
    }

    return NextResponse.json({ data: enrollment, error: null });
  } catch (error) {
    console.error("Error fetching enrollment:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch enrollment" },
      { status: 500 }
    );
  }
}

// PATCH /api/enrollments/[id] - Update enrollment status (e.g., cancel, complete)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    // Check if enrollment exists
    const existingEnrollment = await db.enrollment.findFirst({
      where: { id, deletedAt: null },
      include: { course: true },
    });

    if (!existingEnrollment) {
      return NextResponse.json(
        { data: null, error: "Enrollment not found" },
        { status: 404 }
      );
    }

    // Authorization: Users can update their own enrollments, admins can update any
    const isOwner = existingEnrollment.userId === userId;
    if (userRole !== "ADMIN" && !isOwner) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only update your own enrollments" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status, completedAt, cancelledAt } = body;

    // Update enrollment
    type EnrollmentUpdateData = {
      status?: EnrollmentStatus;
      completedAt?: Date | null;
      cancelledAt?: Date | null;
    };
    const updateData: EnrollmentUpdateData = {};
    if (status !== undefined) {
      // Valid status values: 'active', 'completed', 'cancelled', 'dropped'
      const validStatuses = ["active", "completed", "cancelled", "dropped"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { data: null, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      // Convert lowercase to Prisma enum uppercase
      const statusMap: Record<string, EnrollmentStatus> = {
        active: EnrollmentStatus.ACTIVE,
        completed: EnrollmentStatus.COMPLETED,
        cancelled: EnrollmentStatus.CANCELLED,
        dropped: EnrollmentStatus.DROPPED,
      };
      updateData.status = statusMap[status];

      // Auto-set timestamps based on status
      if (status === "completed" && !completedAt) {
        updateData.completedAt = new Date();
      }
      if (status === "cancelled" && !cancelledAt) {
        updateData.cancelledAt = new Date();
      }
    }
    if (completedAt !== undefined) {
      updateData.completedAt = completedAt ? new Date(completedAt) : null;
    }
    if (cancelledAt !== undefined) {
      updateData.cancelledAt = cancelledAt ? new Date(cancelledAt) : null;
    }

    const enrollment = await db.enrollment.update({
      where: { id },
      data: updateData,
      include: {
        course: {
          include: {
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return NextResponse.json({ data: enrollment, error: null });
  } catch (error) {
    console.error("Error updating enrollment:", error);
    return NextResponse.json(
      { data: null, error: "Failed to update enrollment" },
      { status: 500 }
    );
  }
}

// DELETE /api/enrollments/[id] - Soft delete/cancel an enrollment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role as UserRole;

    // Check if enrollment exists
    const existingEnrollment = await db.enrollment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existingEnrollment) {
      return NextResponse.json(
        { data: null, error: "Enrollment not found" },
        { status: 404 }
      );
    }

    // Authorization: Users can delete their own enrollments, admins can delete any
    const isOwner = existingEnrollment.userId === userId;
    if (userRole !== "ADMIN" && !isOwner) {
      return NextResponse.json(
        { data: null, error: "Forbidden: You can only cancel your own enrollments" },
        { status: 403 }
      );
    }

    // Soft delete - sets deletedAt and cancelledAt
    await db.enrollment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        cancelledAt: new Date(),
        status: EnrollmentStatus.CANCELLED,
      },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error("Error deleting enrollment:", error);
    return NextResponse.json(
      { data: null, error: "Failed to cancel enrollment" },
      { status: 500 }
    );
  }
}
