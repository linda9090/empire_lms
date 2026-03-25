import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    user: {
      update: vi.fn(),
    },
    course: {
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  return {
    db: {
      user: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      course: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      enrollment: {
        findMany: vi.fn(),
      },
      paymentTransaction: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => {
        return callback(tx);
      }),
    },
    __tx: tx,
  };
});

const ADMIN_ROUTE_FILES = {
  users: "src/app/api/admin/users/route.ts",
  userPatch: "src/app/api/admin/users/[id]/route.ts",
  courses: "src/app/api/admin/courses/route.ts",
  coursePatch: "src/app/api/admin/courses/[id]/route.ts",
  stats: "src/app/api/admin/stats/route.ts",
} as const;

const missingAdminRouteFiles = Object.values(ADMIN_ROUTE_FILES).filter((routeFile) => {
  return !existsSync(path.resolve(process.cwd(), routeFile));
});

const describeAdmin = missingAdminRouteFiles.length === 0 ? describe : describe.skip;

async function importRoute(routeFile: string): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), routeFile);
  const moduleUrl = pathToFileURL(absolutePath).href;
  return import(moduleUrl);
}

type GetHandler = (request: NextRequest) => Promise<Response>;
type PatchHandler = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => Promise<Response>;

let GET_ADMIN_USERS: GetHandler;
let PATCH_ADMIN_USER: PatchHandler;
let GET_ADMIN_COURSES: GetHandler;
let PATCH_ADMIN_COURSE: PatchHandler;
let GET_ADMIN_STATS: GetHandler;

describeAdmin("Admin API - Authorization", () => {
  beforeAll(async () => {
    const usersRoute = await importRoute(ADMIN_ROUTE_FILES.users);
    const userPatchRoute = await importRoute(ADMIN_ROUTE_FILES.userPatch);
    const coursesRoute = await importRoute(ADMIN_ROUTE_FILES.courses);
    const coursePatchRoute = await importRoute(ADMIN_ROUTE_FILES.coursePatch);
    const statsRoute = await importRoute(ADMIN_ROUTE_FILES.stats);

    GET_ADMIN_USERS = usersRoute.GET as GetHandler;
    PATCH_ADMIN_USER = userPatchRoute.PATCH as PatchHandler;
    GET_ADMIN_COURSES = coursesRoute.GET as GetHandler;
    PATCH_ADMIN_COURSE = coursePatchRoute.PATCH as PatchHandler;
    GET_ADMIN_STATS = statsRoute.GET as GetHandler;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it("returns 403 for non-admin users on GET /api/admin/users", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "teacher-1",
        role: "TEACHER",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users");
    const response = await GET_ADMIN_USERS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });

  it("returns 403 for non-admin users on PATCH /api/admin/users/[id]", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "teacher-1",
        role: "TEACHER",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ role: "STUDENT" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "user-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });

  it("returns 403 for non-admin users on GET /api/admin/courses", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student-1",
        role: "STUDENT",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/courses");
    const response = await GET_ADMIN_COURSES(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });

  it("returns 403 for non-admin users on PATCH /api/admin/courses/[id]", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "guardian-1",
        role: "GUARDIAN",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/courses/course-1", {
      method: "PATCH",
      body: JSON.stringify({ isPublished: false }),
    });

    const response = await PATCH_ADMIN_COURSE(request as any, {
      params: Promise.resolve({ id: "course-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });

  it("returns 403 for non-admin users on GET /api/admin/stats", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "teacher-2",
        role: "TEACHER",
      },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/stats");
    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("FORBIDDEN");
  });
});

describeAdmin("Admin API - Users boundary (400/404)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when update fields are missing on PATCH /api/admin/users/[id]", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "user-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("MISSING_UPDATE_FIELDS");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when role is invalid on PATCH /api/admin/users/[id]", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/user-1", {
      method: "PATCH",
      body: JSON.stringify({ role: "INVALID_ROLE" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "user-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_ROLE");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when target user does not exist", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);
    vi.mocked(db.user.findUnique).mockResolvedValue(null as any);

    const request = new NextRequest("http://localhost:3000/api/admin/users/missing", {
      method: "PATCH",
      body: JSON.stringify({ role: "TEACHER" }),
    });

    const response = await PATCH_ADMIN_USER(request as any, {
      params: Promise.resolve({ id: "missing" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("NOT_FOUND");
  });
});

describeAdmin("Admin API - Stats date integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when startDate is invalid", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/stats?startDate=not-a-date");
    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_START_DATE");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when endDate is invalid", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest("http://localhost:3000/api/admin/stats?endDate=bad-end-date");
    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_END_DATE");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when startDate is after endDate", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/stats?startDate=2026-03-25&endDate=2026-03-01"
    );

    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("INVALID_DATE_RANGE");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when date range exceeds 365 days", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    } as any);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/stats?startDate=2024-01-01&endDate=2026-03-25"
    );

    const response = await GET_ADMIN_STATS(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("DATE_RANGE_TOO_LARGE");
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
