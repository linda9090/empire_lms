import { describe, it, expect } from "vitest";

// Simple inline validation schema (mirrors lib/validations/auth.ts)
type ValidationResult = {
  success: boolean;
  errors?: string[];
};

function validateLogin(email: string, password: string): ValidationResult {
  const errors: string[] = [];

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errors.push("Email is required");
  } else if (!emailRegex.test(email)) {
    errors.push("Invalid email format");
  }

  // Password validation
  if (!password) {
    errors.push("Password is required");
  } else if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

describe("Login Validation", () => {
  describe("Email validation", () => {
    it("should accept valid email format", () => {
      const result = validateLogin("user@example.com", "password123");
      expect(result.success).toBe(true);
    });

    it("should reject invalid email format", () => {
      const result = validateLogin("invalid-email", "password123");
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Invalid email format");
    });

    it("should reject missing email", () => {
      const result = validateLogin("", "password123");
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Email is required");
    });
  });

  describe("Password validation", () => {
    it("should accept password with minimum length", () => {
      const result = validateLogin("user@example.com", "12345678");
      expect(result.success).toBe(true);
    });

    it("should reject password shorter than 8 characters", () => {
      const result = validateLogin("user@example.com", "short");
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters");
    });

    it("should reject missing password", () => {
      const result = validateLogin("user@example.com", "");
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Password is required");
    });
  });

  describe("Full credential validation", () => {
    it("should pass with valid credentials", () => {
      const result = validateLogin("teacher@example.com", "SecurePass123");
      expect(result.success).toBe(true);
    });

    it("should fail with both fields invalid", () => {
      const result = validateLogin("not-an-email", "123");
      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });
});
