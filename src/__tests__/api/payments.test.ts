/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as CheckoutPOST } from "@/app/api/payments/checkout/route";
import { POST as WebhookPOST } from "@/app/api/payments/webhook/route";
import { POST as RefundPOST } from "@/app/api/payments/refund/route";

vi.mock("@/lib/get-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: {
      findUnique: vi.fn(),
    },
    enrollment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    paymentTransaction: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/payment", () => ({
  getPaymentProvider: vi.fn(),
  getStripeProvider: vi.fn(),
}));

describe("Payments API - Checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_MODE = "mock";
  });

  it("should enroll in free course immediately", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { getPaymentProvider } = await import("@/lib/payment");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
        organizationId: "org1",
      },
      sessionToken: "token123",
    } as any);

    const mockCourse = {
      id: "course1",
      title: "Free Course",
      price: 0,
      isPublished: true,
    };
    vi.mocked(db.course.findUnique).mockResolvedValue(mockCourse as any);
    vi.mocked(db.enrollment.findUnique).mockResolvedValue(null);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      courseId: "course1",
      status: "ACTIVE",
    };
    vi.mocked(db.enrollment.create).mockResolvedValue(mockEnrollment as any);

    const mockProvider = {
      createPayment: vi.fn().mockResolvedValue({
        id: "mock_payment",
        amount: 0,
        currency: "usd",
        status: "succeeded",
        provider: "mock",
      }),
    };
    vi.mocked(getPaymentProvider).mockReturnValue(mockProvider as any);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await CheckoutPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.enrollment).toEqual(mockEnrollment);
    expect(data.data.checkoutUrl).toBeNull();
    expect(data.data.message).toBe("Free course enrolled successfully");
  });

  it("should create checkout session for paid course", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { getPaymentProvider } = await import("@/lib/payment");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
        organizationId: "org1",
      },
      sessionToken: "token123",
    } as any);

    const mockCourse = {
      id: "course1",
      title: "Paid Course",
      price: 99.99,
      isPublished: true,
    };
    vi.mocked(db.course.findUnique).mockResolvedValue(mockCourse as any);
    vi.mocked(db.enrollment.findUnique).mockResolvedValue(null);

    const mockProvider = {
      createPayment: vi.fn().mockResolvedValue({
        id: "cs_test_123",
        amount: 99.99,
        currency: "usd",
        status: "pending",
        provider: "stripe",
        checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
      }),
    };
    vi.mocked(getPaymentProvider).mockReturnValue(mockProvider as any);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await CheckoutPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
    expect(data.data.amount).toBe(99.99);
  });

  it("should return 409 when already enrolled", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue({
      user: { id: "student1", role: "STUDENT", organizationId: "org1" },
      sessionToken: "token123",
    } as any);

    const mockCourse = { id: "course1", price: 50, isPublished: true };
    vi.mocked(db.course.findUnique).mockResolvedValue(mockCourse as any);

    const existingEnrollment = { id: "enroll1", userId: "student1", courseId: "course1" };
    vi.mocked(db.enrollment.findUnique).mockResolvedValue(existingEnrollment as any);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await CheckoutPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Already enrolled in this course");
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ courseId: "course1" }),
    });
    const response = await CheckoutPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });
});

describe("Payments API - Webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("should return 400 when signature is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    const response = await WebhookPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No signature provided");
  });

  it("should return 400 when webhook signature is invalid", async () => {
    const { getStripeProvider } = await import("@/lib/payment");

    const mockStripeProvider = {
      constructWebhookEvent: vi.fn().mockImplementation(() => {
        throw new Error("Invalid signature");
      }),
    };
    vi.mocked(getStripeProvider).mockReturnValue(mockStripeProvider as any);

    const request = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
      headers: {
        "stripe-signature": "invalid_signature",
      },
    });
    const response = await WebhookPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid signature");
  });

  it("should handle checkout.session.completed event", async () => {
    const { getStripeProvider } = await import("@/lib/payment");
    const { db } = await import("@/lib/db");

    const mockEvent = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          payment_intent: "pi_test_123",
          metadata: {
            userId: "student1",
            courseId: "course1",
          },
        },
      },
    };

    const mockStripeProvider = {
      constructWebhookEvent: vi.fn().mockReturnValue(mockEvent),
    };
    vi.mocked(getStripeProvider).mockReturnValue(mockStripeProvider as any);

    vi.mocked(db.enrollment.findUnique).mockResolvedValue(null);
    vi.mocked(db.enrollment.create).mockResolvedValue({ id: "enroll1" } as any);
    vi.mocked(db.paymentTransaction.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(db.$transaction).mockResolvedValue([{ id: "enroll1" }, { count: 1 }] as any);

    const request = new NextRequest("http://localhost:3000/api/payments/webhook", {
      method: "POST",
      body: JSON.stringify(mockEvent),
      headers: {
        "stripe-signature": "valid_signature",
      },
    });
    const response = await WebhookPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);
  });
});

describe("Payments API - Refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/get-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/payments/refund", {
      method: "POST",
      body: JSON.stringify({ paymentId: "pi_test_123" }),
    });
    const response = await RefundPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 when non-admin user attempts refund", async () => {
    const { getSession } = await import("@/lib/get-session");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "student1",
        email: "student@example.com",
        name: "Student",
        role: "STUDENT",
      },
      sessionToken: "token123",
    } as any);

    const request = new NextRequest("http://localhost:3000/api/payments/refund", {
      method: "POST",
      body: JSON.stringify({ paymentId: "pi_test_123" }),
    });
    const response = await RefundPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden: Admin access required");
  });

  it("should process refund for admin", async () => {
    const { getSession } = await import("@/lib/get-session");
    const { db } = await import("@/lib/db");
    const { getPaymentProvider } = await import("@/lib/payment");

    vi.mocked(getSession).mockResolvedValue({
      user: {
        id: "admin1",
        email: "admin@example.com",
        name: "Admin",
        role: "ADMIN",
      },
      sessionToken: "token123",
    } as any);

    const metadataObj = { courseId: "course1" };
    const mockPaymentTransaction = {
      id: "payment1",
      userId: "student1",
      providerPaymentId: "pi_test_123",
      status: "succeeded",
      metadata: JSON.stringify(metadataObj),
    };
    vi.mocked(db.paymentTransaction.findFirst).mockResolvedValue(mockPaymentTransaction as any);

    const mockEnrollment = {
      id: "enroll1",
      userId: "student1",
      courseId: "course1",
    };
    vi.mocked(db.enrollment.findFirst).mockResolvedValue(mockEnrollment as any);

    const mockProvider = {
      processRefund: vi.fn().mockResolvedValue({
        id: "re_test_123",
        amount: 99.99,
        status: "succeeded",
      }),
    };
    vi.mocked(getPaymentProvider).mockReturnValue(mockProvider as any);

    vi.mocked(db.paymentTransaction.update).mockResolvedValue({} as any);
    vi.mocked(db.enrollment.update).mockResolvedValue({} as any);

    const request = new NextRequest("http://localhost:3000/api/payments/refund", {
      method: "POST",
      body: JSON.stringify({ paymentId: "pi_test_123", reason: "requested_by_customer" }),
    });
    const response = await RefundPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.refundId).toBe("re_test_123");
    expect(data.data.amount).toBe(99.99);
  });
});
