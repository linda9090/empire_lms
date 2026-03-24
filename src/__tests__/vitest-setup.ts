import { vi } from "vitest";

// Mock better-auth/cookies
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(() => null),
}));

// Mock Next.js server modules
class MockNextRequest extends Request {
  nextUrl: { searchParams: URLSearchParams; pathname: string };

  constructor(input: string | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input.toString();
    super(url, init);
    const parsedUrl = new URL(url);
    this.nextUrl = {
      searchParams: parsedUrl.searchParams,
      pathname: parsedUrl.pathname,
    };
  }
}

vi.mock("next/server", () => ({
  NextRequest: MockNextRequest,
  NextResponse: {
    json: (body: unknown, init?: number | ResponseInit) => {
      const status = typeof init === "number" ? init : init?.status || 200;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response;
    },
    redirect: (url: string | URL) =>
      new Response(null, {
        status: 307,
        headers: { Location: url.toString() },
      }) as unknown as Response,
  },
}));
