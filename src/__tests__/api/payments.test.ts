import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockConstructEvent = vi.fn();
const mockCheckoutCreate = vi.fn();
const mockCheckoutRetrieve = vi.fn();
const mockRefundCreate = vi.fn();

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/payment-email", () => ({
  sendPaymentReceiptEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    enrollment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    course: {
      findFirst: vi.fn(),
    },
    paymentTransaction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("stripe", () => ({
  default: class {
    constructor() {}

    checkout = {
      sessions: {
        create: mockCheckoutCreate,
        retrieve: mockCheckoutRetrieve,
      },
    };

    refunds = {
      create: mockRefundCreate,
    };

    webhooks = {
      constructEvent: mockConstructEvent,
    };
  },
}));

describe("Payments API - Checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_MODE = "mock";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  });

  it("activates enrollment immediately for free courses", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { POST } = await import("@/app/api/payments/checkout/route");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        role: "STUDENT",
      },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course1",
      title: "Free Course",
      price: 0,
      organizationId: "org1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);
    vi.mocked(db.enrollment.create).mockResolvedValue({
      id: "enroll1",
      userId: "student1",
      courseId: "course1",
      status: "ACTIVE",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.freeCourse).toBe(true);
    expect(payload.data.checkoutUrl).toContain("/student/courses/course1/checkout/success");
    expect(db.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "student1",
          courseId: "course1",
          status: "ACTIVE",
        }),
      })
    );
  });

  it("skips Stripe and activates enrollment in mock mode for paid courses", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { POST } = await import("@/app/api/payments/checkout/route");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        role: "STUDENT",
      },
    } as any);

    vi.mocked(db.course.findFirst).mockResolvedValue({
      id: "course1",
      title: "Paid Course",
      price: 99.99,
      organizationId: "org1",
    } as any);
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(null);
    vi.mocked(db.paymentTransaction.create).mockResolvedValue({
      id: "payment1",
      status: "succeeded",
    } as any);
    vi.mocked(db.enrollment.create).mockResolvedValue({
      id: "enroll1",
      status: "ACTIVE",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.mockMode).toBe(true);
    expect(payload.data.freeCourse).toBe(false);
    expect(db.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "mock",
          status: "succeeded",
        }),
      })
    );
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });
});

describe("Payments API - Webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
  });

  it("returns 400 when Stripe webhook signature verification fails", async () => {
    const { POST } = await import("@/app/api/payments/webhook/route");

    const request = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=123,v1=invalid",
      },
      body: JSON.stringify({ test: true }),
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid signature");
  });
});
