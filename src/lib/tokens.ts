import type { UserRole } from "@/types";

export interface RoleToken {
  label: string;
  primary: string;
  primaryForeground: string;
  badgeBg: string;
  badgeFg: string;
  sidebarAccent: string;
  navActive: string;
  navInactive: string;
  chartFill: string;
}

const ROLE_TOKENS: Record<UserRole, RoleToken> = {
  TEACHER: {
    label: "선생님",
    primary: "text-role-teacher",
    primaryForeground: "text-role-teacher-foreground",
    badgeBg: "bg-role-teacher/10",
    badgeFg: "text-role-teacher",
    sidebarAccent: "border-l-4 border-role-teacher",
    navActive: "bg-role-teacher/10 text-role-teacher font-medium",
    navInactive: "text-muted-foreground hover:bg-muted hover:text-foreground",
    chartFill: "var(--chart-bar-fill)",
  },
  STUDENT: {
    label: "수강생",
    primary: "text-role-student",
    primaryForeground: "text-role-student-foreground",
    badgeBg: "bg-role-student/10",
    badgeFg: "text-role-student",
    sidebarAccent: "border-l-4 border-role-student",
    navActive: "bg-role-student/10 text-role-student font-medium",
    navInactive: "text-muted-foreground hover:bg-muted hover:text-foreground",
    chartFill: "var(--chart-bar-fill)",
  },
  GUARDIAN: {
    label: "보호자",
    primary: "text-role-guardian",
    primaryForeground: "text-role-guardian-foreground",
    badgeBg: "bg-role-guardian/10",
    badgeFg: "text-role-guardian",
    sidebarAccent: "border-l-4 border-role-guardian",
    navActive: "bg-role-guardian/10 text-role-guardian font-medium",
    navInactive: "text-muted-foreground hover:bg-muted hover:text-foreground",
    chartFill: "var(--chart-bar-fill)",
  },
  ADMIN: {
    label: "관리자",
    primary: "text-role-admin",
    primaryForeground: "text-role-admin-foreground",
    badgeBg: "bg-role-admin/10",
    badgeFg: "text-role-admin",
    sidebarAccent: "border-l-4 border-role-admin",
    navActive: "bg-role-admin/10 text-role-admin font-medium",
    navInactive: "text-muted-foreground hover:bg-muted hover:text-foreground",
    chartFill: "var(--chart-bar-fill)",
  },
};

export type CourseStatus = "PUBLISHED" | "DRAFT";

export interface CourseStatusToken {
  label: string;
  badgeClass: string;
}

const COURSE_STATUS_TOKENS: Record<CourseStatus, CourseStatusToken> = {
  PUBLISHED: {
    label: "Published",
    badgeClass:
      "border border-role-admin/30 bg-role-admin/10 text-role-admin",
  },
  DRAFT: {
    label: "Draft",
    badgeClass: "border border-border bg-muted text-muted-foreground",
  },
};

export function getRoleToken(role: UserRole): RoleToken {
  return ROLE_TOKENS[role];
}

export function getCourseStatusToken(
  isPublished: boolean
): CourseStatusToken {
  return isPublished
    ? COURSE_STATUS_TOKENS.PUBLISHED
    : COURSE_STATUS_TOKENS.DRAFT;
}
