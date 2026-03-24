import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserRole } from "@/types";

// Import actual implementation from middleware
import {
  isPublicPath,
  getAllowedRoles,
  evaluateAuthorization,
} from "@/middleware";

describe("Middleware - RBAC Logic", () => {
  describe("Public path detection", () => {
    it("should identify root as public", () => {
      expect(isPublicPath("/")).toBe(true);
    });

    it("should identify login as public", () => {
      expect(isPublicPath("/login")).toBe(true);
    });

    it("should identify register as public", () => {
      expect(isPublicPath("/register")).toBe(true);
    });

    it("should identify api/auth as public", () => {
      expect(isPublicPath("/api/auth")).toBe(true);
      expect(isPublicPath("/api/auth/session")).toBe(true);
    });

    it("should identify unauthorized as public", () => {
      expect(isPublicPath("/unauthorized")).toBe(true);
    });

    it("should not identify protected paths as public", () => {
      expect(isPublicPath("/dashboard")).toBe(false);
      expect(isPublicPath("/teacher/courses")).toBe(false);
      expect(isPublicPath("/student/dashboard")).toBe(false);
    });
  });

  describe("Role-based path requirements", () => {
    it("should require TEACHER role for teacher paths", () => {
      expect(getAllowedRoles("/teacher")).toEqual(["TEACHER", "ADMIN"]);
      expect(getAllowedRoles("/teacher/dashboard")).toEqual(["TEACHER", "ADMIN"]);
      expect(getAllowedRoles("/teacher/courses")).toEqual(["TEACHER", "ADMIN"]);
    });

    it("should require STUDENT role for student paths", () => {
      expect(getAllowedRoles("/student")).toEqual(["STUDENT", "ADMIN"]);
      expect(getAllowedRoles("/student/dashboard")).toEqual(["STUDENT", "ADMIN"]);
      expect(getAllowedRoles("/student/courses")).toEqual(["STUDENT", "ADMIN"]);
    });

    it("should require GUARDIAN role for guardian paths", () => {
      expect(getAllowedRoles("/guardian")).toEqual(["GUARDIAN", "ADMIN"]);
      expect(getAllowedRoles("/guardian/dashboard")).toEqual(["GUARDIAN", "ADMIN"]);
    });

    it("should require ADMIN role for admin paths", () => {
      expect(getAllowedRoles("/admin")).toEqual(["ADMIN"]);
      expect(getAllowedRoles("/admin/dashboard")).toEqual(["ADMIN"]);
      expect(getAllowedRoles("/admin/users")).toEqual(["ADMIN"]);
    });

    it("should return null for paths without role requirement", () => {
      expect(getAllowedRoles("/dashboard")).toBeNull();
      expect(getAllowedRoles("/api")).toBeNull();
      expect(getAllowedRoles("/some-other-path")).toBeNull();
    });
  });

  describe("Authorization decision matrix", () => {
    it("should allow access to public paths without session", () => {
      expect(evaluateAuthorization("/", null, null)).toBe("allow");
      expect(evaluateAuthorization("/login", null, null)).toBe("allow");
      expect(evaluateAuthorization("/unauthorized", null, null)).toBe("allow");
    });

    it("should redirect to login for protected paths without session", () => {
      expect(evaluateAuthorization("/teacher/courses", null, null)).toBe("login");
      expect(evaluateAuthorization("/student/dashboard", null, null)).toBe("login");
    });

    it("should allow authorized roles to access their paths", () => {
      expect(evaluateAuthorization("/teacher/dashboard", "session123", "TEACHER")).toBe("allow");
      expect(evaluateAuthorization("/student/courses", "session123", "STUDENT")).toBe("allow");
      expect(evaluateAuthorization("/guardian/dashboard", "session123", "GUARDIAN")).toBe("allow");
      expect(evaluateAuthorization("/admin/users", "session123", "ADMIN")).toBe("allow");
    });

    it("should deny access when role is required but missing", () => {
      expect(evaluateAuthorization("/teacher/dashboard", "session123", null)).toBe("unauthorized");
      expect(evaluateAuthorization("/student/courses", "session123", null)).toBe("unauthorized");
    });

    it("should deny access with wrong role", () => {
      expect(evaluateAuthorization("/teacher/dashboard", "session123", "STUDENT")).toBe("unauthorized");
      expect(evaluateAuthorization("/student/courses", "session123", "TEACHER")).toBe("unauthorized");
      expect(evaluateAuthorization("/admin/users", "session123", "TEACHER")).toBe("unauthorized");
    });

    it("should allow ADMIN to access all role-protected paths", () => {
      expect(evaluateAuthorization("/teacher/dashboard", "session123", "ADMIN")).toBe("allow");
      expect(evaluateAuthorization("/student/courses", "session123", "ADMIN")).toBe("allow");
      expect(evaluateAuthorization("/guardian/dashboard", "session123", "ADMIN")).toBe("allow");
      expect(evaluateAuthorization("/admin/users", "session123", "ADMIN")).toBe("allow");
    });

    it("should allow access to paths without role requirements", () => {
      expect(evaluateAuthorization("/dashboard", "session123", "STUDENT")).toBe("allow");
      expect(evaluateAuthorization("/api/some-endpoint", "session123", "TEACHER")).toBe("allow");
    });
  });
});
