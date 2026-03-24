import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as GET_COURSES, POST as POST_COURSE } from "@/app/api/courses/route";
import { GET as GET_ENROLLMENTS, POST as POST_ENROLLMENT } from "@/app/api/enrollments/route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/get-session";

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    enrollment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

type UserRole = "TEACHER" | "STUDENT" | "ADMIN" | "GUARDIAN";

type TestUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
};

type CourseRecord = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  isPublished: boolean;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: Date;
  deletedAt: Date | null;
};

type EnrollmentRecord = {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: Date;
  deletedAt: Date | null;
  course: CourseRecord;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
};

const DEFAULT_ORG = {
  id: "org-qa-1",
  name: "QA Org",
  slug: "qa-org",
};

let currentSession: { user: TestUser } | null;
let courseSeq: number;
let enrollmentSeq: number;
let courses: CourseRecord[];
let enrollments: EnrollmentRecord[];
let knownUsers: Map<string, TestUser>;

function setSession(user: TestUser | null) {
  if (!user) {
    currentSession = null;
    return;
  }

  knownUsers.set(user.id, user);
  currentSession = { user };
}

async function expectApiContract(response: Response, status: number) {
  const body = await response.json();

  expect(response.status).toBe(status);
  expect(body).toHaveProperty("data");
  expect(body).toHaveProperty("error");

  return body;
}

beforeEach(() => {
  vi.clearAllMocks();

  currentSession = null;
  courseSeq = 1;
  enrollmentSeq = 1;
  courses = [];
  enrollments = [];
  knownUsers = new Map<string, TestUser>();

  vi.mocked(getSession).mockImplementation(async () => currentSession as any);

  vi.mocked(db.course.create).mockImplementation(async (args: any) => {
    const created: CourseRecord = {
      id: `course-${courseSeq++}`,
      title: args.data.title,
      description: args.data.description ?? null,
      imageUrl: args.data.imageUrl ?? null,
      price: args.data.price ?? null,
      isPublished: args.data.isPublished ?? false,
      organizationId: args.data.organizationId,
      organization: { ...DEFAULT_ORG, id: args.data.organizationId },
      createdAt: new Date(),
      deletedAt: null,
    };

    courses.push(created);
    return created as any;
  });

  vi.mocked(db.course.findFirst).mockImplementation(async (args: any) => {
    const where = args?.where ?? {};

    return (
      courses.find((course) => {
        if (where.id !== undefined && course.id !== where.id) {
          return false;
        }

        if (where.deletedAt === null && course.deletedAt !== null) {
          return false;
        }

        return true;
      }) ?? null
    ) as any;
  });

  vi.mocked(db.course.findMany).mockImplementation(async (args: any) => {
    const where = args?.where ?? {};

    const filtered = courses.filter((course) => {
      if (where.isPublished === true && !course.isPublished) {
        return false;
      }

      if (where.deletedAt === null && course.deletedAt !== null) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) as any;
  });

  vi.mocked(db.enrollment.findFirst).mockImplementation(async (args: any) => {
    const where = args?.where ?? {};

    return (
      enrollments.find((enrollment) => {
        if (where.userId !== undefined && enrollment.userId !== where.userId) {
          return false;
        }

        if (where.courseId !== undefined && enrollment.courseId !== where.courseId) {
          return false;
        }

        if (where.deletedAt === null && enrollment.deletedAt !== null) {
          return false;
        }

        return true;
      }) ?? null
    ) as any;
  });

  vi.mocked(db.enrollment.create).mockImplementation(async (args: any) => {
    const course = courses.find((item) => item.id === args.data.courseId && item.deletedAt === null);

    if (!course) {
      throw new Error("Test mock invariant: course not found for enrollment");
    }

    const user =
      knownUsers.get(args.data.userId) ??
      ({
        id: args.data.userId,
        email: `${args.data.userId}@example.com`,
        name: args.data.userId,
        role: "STUDENT",
      } as TestUser);

    const created: EnrollmentRecord = {
      id: `enrollment-${enrollmentSeq++}`,
      userId: args.data.userId,
      courseId: args.data.courseId,
      enrolledAt: new Date(),
      deletedAt: null,
      course,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };

    enrollments.push(created);
    return created as any;
  });

  vi.mocked(db.enrollment.findMany).mockImplementation(async (args: any) => {
    const where = args?.where ?? {};

    const filtered = enrollments.filter((enrollment) => {
      if (where.userId !== undefined && enrollment.userId !== where.userId) {
        return false;
      }

      if (where.courseId !== undefined && enrollment.courseId !== where.courseId) {
        return false;
      }

      if (where.deletedAt === null && enrollment.deletedAt !== null) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => b.enrolledAt.getTime() - a.enrolledAt.getTime()) as any;
  });
});

describe("Issue #5 Integration + API Contract", () => {
  it("validates teacher create -> student enroll -> student list flow", async () => {
    setSession({
      id: "teacher-1",
      email: "teacher1@example.com",
      name: "Teacher 1",
      role: "TEACHER",
      organizationId: DEFAULT_ORG.id,
    });

    const createCourseResponse = await POST_COURSE(
      new NextRequest("http://localhost:3000/api/courses", {
        method: "POST",
        body: JSON.stringify({
          title: "Global LMS 101",
          description: "Issue #5 integration scenario",
          isPublished: true,
        }),
      }) as any
    );

    const createdCourseBody = await expectApiContract(createCourseResponse, 201);
    expect(createdCourseBody.error).toBeNull();
    expect(createdCourseBody.data.title).toBe("Global LMS 101");

    const courseId = createdCourseBody.data.id as string;

    setSession({
      id: "student-1",
      email: "student1@example.com",
      name: "Student 1",
      role: "STUDENT",
    });

    const enrollResponse = await POST_ENROLLMENT(
      new NextRequest("http://localhost:3000/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      }) as any
    );

    const enrollBody = await expectApiContract(enrollResponse, 201);
    expect(enrollBody.error).toBeNull();
    expect(enrollBody.data.courseId).toBe(courseId);

    const listEnrollmentsResponse = await GET_ENROLLMENTS(
      new NextRequest("http://localhost:3000/api/enrollments") as any
    );

    const enrollmentListBody = await expectApiContract(listEnrollmentsResponse, 200);
    expect(enrollmentListBody.error).toBeNull();
    expect(enrollmentListBody.data).toHaveLength(1);
    expect(enrollmentListBody.data[0].courseId).toBe(courseId);

    setSession(null);

    const listPublishedCoursesResponse = await GET_COURSES(
      new NextRequest("http://localhost:3000/api/courses?published=true") as any
    );

    const publishedCoursesBody = await expectApiContract(listPublishedCoursesResponse, 200);
    expect(publishedCoursesBody.error).toBeNull();
    expect(publishedCoursesBody.data).toHaveLength(1);
    expect(publishedCoursesBody.data[0].id).toBe(courseId);
  });

  it("enforces role boundary contract: student cannot create course", async () => {
    setSession({
      id: "student-2",
      email: "student2@example.com",
      name: "Student 2",
      role: "STUDENT",
    });

    const response = await POST_COURSE(
      new NextRequest("http://localhost:3000/api/courses", {
        method: "POST",
        body: JSON.stringify({ title: "Unauthorized Create" }),
      }) as any
    );

    const body = await expectApiContract(response, 403);
    expect(body.data).toBeNull();
    expect(body.error).toContain("Forbidden");
  });

  it("enforces exception contract: duplicate enrollment=409 and missing course=404", async () => {
    setSession({
      id: "teacher-2",
      email: "teacher2@example.com",
      name: "Teacher 2",
      role: "TEACHER",
      organizationId: DEFAULT_ORG.id,
    });

    const createdCourseResponse = await POST_COURSE(
      new NextRequest("http://localhost:3000/api/courses", {
        method: "POST",
        body: JSON.stringify({ title: "Course For Duplicate Check", isPublished: true }),
      }) as any
    );

    const createdCourseBody = await expectApiContract(createdCourseResponse, 201);
    const createdCourseId = createdCourseBody.data.id as string;

    setSession({
      id: "student-3",
      email: "student3@example.com",
      name: "Student 3",
      role: "STUDENT",
    });

    const firstEnrollResponse = await POST_ENROLLMENT(
      new NextRequest("http://localhost:3000/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId: createdCourseId }),
      }) as any
    );

    await expectApiContract(firstEnrollResponse, 201);

    const duplicateEnrollResponse = await POST_ENROLLMENT(
      new NextRequest("http://localhost:3000/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId: createdCourseId }),
      }) as any
    );

    const duplicateBody = await expectApiContract(duplicateEnrollResponse, 409);
    expect(duplicateBody.data).toBeNull();
    expect(duplicateBody.error).toBe("Already enrolled in this course");

    const missingCourseResponse = await POST_ENROLLMENT(
      new NextRequest("http://localhost:3000/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId: "course-missing" }),
      }) as any
    );

    const missingBody = await expectApiContract(missingCourseResponse, 404);
    expect(missingBody.data).toBeNull();
    expect(missingBody.error).toBe("Course not found");
  });

  it("returns 401 contract for unauthenticated enrollment list", async () => {
    setSession(null);

    const response = await GET_ENROLLMENTS(
      new NextRequest("http://localhost:3000/api/enrollments") as any
    );

    const body = await expectApiContract(response, 401);
    expect(body.data).toBeNull();
    expect(body.error).toBe("Unauthorized");
  });
});
