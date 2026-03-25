import type { UserRole } from "@/types";

export type CourseStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED";

interface RoleToken {
  badgeClass: string;
  textClass: string;
  sidebarAccent: string;
}

interface CourseStatusToken {
  badgeClass: string;
  textClass: string;
}

const ROLE_TOKENS: Record<UserRole, RoleToken> = {
  TEACHER: {
    badgeClass: "bg-role-teacher-bg text-role-teacher-text",
    textClass: "text-role-teacher",
    sidebarAccent: "border-role-teacher",
  },
  STUDENT: {
    badgeClass: "bg-role-student-bg text-role-student-text",
    textClass: "text-role-student",
    sidebarAccent: "border-role-student",
  },
  GUARDIAN: {
    badgeClass: "bg-role-guardian-bg text-role-guardian-text",
    textClass: "text-role-guardian",
    sidebarAccent: "border-role-guardian",
  },
  ADMIN: {
    badgeClass: "bg-role-admin-bg text-role-admin-text",
    textClass: "text-role-admin",
    sidebarAccent: "border-role-admin",
  },
};

const COURSE_STATUS_TOKENS: Record<CourseStatus, CourseStatusToken> = {
  PUBLISHED: {
    badgeClass: "bg-status-published/15 text-status-published",
    textClass: "text-status-published",
  },
  DRAFT: {
    badgeClass: "bg-status-draft/15 text-status-draft",
    textClass: "text-status-draft",
  },
  ARCHIVED: {
    badgeClass: "bg-status-archived/15 text-status-archived",
    textClass: "text-status-archived",
  },
};

function normalizeRole(role: string): UserRole {
  const value = role.trim().toUpperCase();

  if (value === "TEACHER") {
    return "TEACHER";
  }

  if (value === "GUARDIAN") {
    return "GUARDIAN";
  }

  if (value === "ADMIN") {
    return "ADMIN";
  }

  return "STUDENT";
}

export function getRoleToken(role: string): RoleToken {
  return ROLE_TOKENS[normalizeRole(role)];
}

export function getCourseStatusToken(status: CourseStatus): CourseStatusToken {
  return COURSE_STATUS_TOKENS[status];
}
