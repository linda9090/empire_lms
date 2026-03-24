import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";
type AuthorizationDecision = "allow" | "login" | "unauthorized";

const PUBLIC_PATHS = ["/", "/login", "/register", "/api/auth", "/unauthorized"];
const ROLE_RULES: Array<{ prefix: `/${string}`; allowedRoles: AppRole[] }> = [
  { prefix: "/admin", allowedRoles: ["ADMIN"] },
  { prefix: "/teacher", allowedRoles: ["TEACHER", "ADMIN"] },
  { prefix: "/student", allowedRoles: ["STUDENT", "ADMIN"] },
  { prefix: "/guardian", allowedRoles: ["GUARDIAN", "ADMIN"] },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => matchesPrefix(pathname, path));
}

export function getAllowedRoles(pathname: string): ReadonlyArray<AppRole> | null {
  const rule = ROLE_RULES.find(({ prefix }) => matchesPrefix(pathname, prefix));
  return rule?.allowedRoles ?? null;
}

export function evaluateAuthorization(
  pathname: string,
  sessionToken: string | null,
  role: string | null
): AuthorizationDecision {
  if (isPublicPath(pathname)) {
    return "allow";
  }

  if (!sessionToken) {
    return "login";
  }

  const allowedRoles = getAllowedRoles(pathname);
  if (!allowedRoles) {
    return "allow";
  }

  if (!role) {
    return "unauthorized";
  }

  return allowedRoles.includes(role as AppRole) ? "allow" : "unauthorized";
}

async function getRoleFromSession(request: NextRequest): Promise<string | null> {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) {
    return null;
  }

  try {
    const response = await fetch(new URL("/api/auth/get-session", request.url), {
      headers: {
        cookie,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { user?: { role?: unknown } } | null;
    return typeof payload?.user?.role === "string" ? payload.user.role : null;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

function redirectToUnauthorized(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/unauthorized", request.url));
}

// Next.js 16 renamed middleware to proxy, but this file is intentionally kept
// for checklist compatibility in this round.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = getSessionCookie(request);
  const protectedRoles = getAllowedRoles(pathname);
  const role =
    sessionToken && protectedRoles ? await getRoleFromSession(request) : null;
  const decision = evaluateAuthorization(pathname, sessionToken, role);

  switch (decision) {
    case "allow":
      return NextResponse.next();
    case "login":
      return redirectToLogin(request, pathname);
    case "unauthorized":
      return redirectToUnauthorized(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
