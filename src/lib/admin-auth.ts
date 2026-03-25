import { NextResponse } from "next/server";
import { getSession } from "./get-session";
import type { UserRole } from "@/types";

/**
 * Admin authentication response with full user context
 */
export interface AdminAuth {
  admin: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Verifies ADMIN role directly in the route handler.
 * This is a defense-in-depth approach - DO NOT rely solely on middleware.
 *
 * @returns AdminAuth if authorized, null otherwise
 * @throws NextResponse with appropriate status code if unauthorized
 *
 * Status Code Guide:
 * - 401: No session (not logged in)
 * - 403: Logged in but not ADMIN (forbidden)
 * - 500: Server error during verification
 */
export async function requireAdmin(
  request: Request
): Promise<AdminAuth | never> {
  try {
    const session = await getSession();

    // 401: No session (not logged in)
    if (!session?.user) {
      throw new AuthError("Unauthorized", 401);
    }

    const userRole = session.user.role as UserRole;

    // 403: Logged in but not ADMIN (forbidden)
    if (userRole !== "ADMIN") {
      throw new AuthError("Forbidden: Admin access required", 403);
    }

    // Extract IP and User-Agent for audit logging
    const headers = request.headers as Headers;
    const ipAddress = headers.get("x-forwarded-for")?.split(",")[0].trim()
      || headers.get("x-real-ip")
      || undefined;
    const userAgent = headers.get("user-agent") || undefined;

    return {
      admin: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: userRole,
      },
      ipAddress,
      userAgent,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    // 500: Server error during verification
    throw new AuthError("Authentication verification failed", 500);
  }
}

/**
 * Custom error for auth failures with status codes
 */
class AuthError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Helper to convert AuthError to NextResponse
 * Use this in catch blocks of API routes
 */
export function authErrorToResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { data: null, error: error.message },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { data: null, error: "Internal server error" },
    { status: 500 }
  );
}
