import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { onRequest } from "../[[path]]";
import * as sharedAuth from "../../auth/_shared";

// Mock the dependencies from auth/_shared
mock.module("../../auth/_shared", () => ({
  deductUserPoints: mock(),
  refundUserPoints: mock(),
  getAllowedOrigin: mock().mockReturnValue("*"),
}));

describe("Gemini Proxy [[path]].ts", () => {
  let mockEnv: any;
  let mockContext: any;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    mockEnv = {
      GEMINI_API_KEY: "test-api-key",
      SESSIONS: {
        get: mock(),
        put: mock(),
        delete: mock(),
      },
    };

    mockContext = {
      env: mockEnv,
      params: { path: ["v1beta", "models", "gemini-1.5-flash:generateContent"] },
      request: new Request("https://adaptiva.app/api/gemini/v1beta/models/gemini-1.5-flash:generateContent?key=value", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          "x-adaptiva-action": "default",
        }),
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] }),
      }),
    };

    originalFetch = global.fetch;
    global.fetch = mock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.restore();
  });

  it("should handle OPTIONS request correctly", async () => {
    mockContext.request = new Request("https://adaptiva.app/api/gemini", {
      method: "OPTIONS",
    });

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
  });

  it("should return 500 if GEMINI_API_KEY is not configured", async () => {
    mockEnv.GEMINI_API_KEY = "";

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ error: "GEMINI_API_KEY is not configured on this Pages project." });
  });

  it("should return 401 if user is unauthorized", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: false, remainingPoints: 0, session: null });

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: "unauthorized", message: "Sign in with Google required to use AI features." });
  });

  it("should return 429 if user has insufficient points", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: false, remainingPoints: 2, session: {} as any });

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe("insufficient_points");
    expect(json.remainingPoints).toBe(2);
    expect(json.requiredPoints).toBe(5);
  });

  it("should successfully proxy the request and return AI response", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 95, session: {} as any });

    const mockUpstreamResponse = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi there" }] }, finishReason: "STOP" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    (global.fetch as any).mockResolvedValue(mockUpstreamResponse);

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-adaptiva-points")).toBe("95");

    const json = await response.json();
    expect(json).toEqual({ candidates: [{ content: { parts: [{ text: "Hi there" }] }, finishReason: "STOP" }] });

    expect((global.fetch as any).mock.calls.length).toBe(1);
    const fetchArgs = (global.fetch as any).mock.calls[0];
    expect(fetchArgs[0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=value");
    expect((fetchArgs[1]?.headers as Headers).get("x-goog-api-key")).toBe("test-api-key");
  });

  it("should handle network error and refund points", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 95, session: {} as any });
    (sharedAuth.refundUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 100 });

    (global.fetch as any).mockRejectedValue(new Error("Network Failure"));

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(400); // Because AI upstream network error is 400

    const json = await response.json();
    expect(json.error).toBe("ai_upstream_network_error");

    expect((global.fetch as any).mock.calls.length).toBe(3); // 3 retries
    expect(sharedAuth.refundUserPoints).toHaveBeenCalled();
  });

  it("should handle API HTTP error and refund points", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 95, session: {} as any });
    (sharedAuth.refundUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 100 });

    const mockUpstreamResponse = new Response(JSON.stringify({ error: { message: "Bad Request" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    (global.fetch as any).mockResolvedValue(mockUpstreamResponse);

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe("ai_generation_failed");
    expect(json.message).toBe("Bad Request");

    expect(sharedAuth.refundUserPoints).toHaveBeenCalled();
  });

  it("should block if AI generation finishReason is SAFETY", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 95, session: {} as any });
    (sharedAuth.refundUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 100 });

    const mockUpstreamResponse = new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    (global.fetch as any).mockResolvedValue(mockUpstreamResponse);

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe("ai_generation_blocked");
    expect(json.message).toContain("AI terhenti dengan alasan: SAFETY");

    expect(sharedAuth.refundUserPoints).toHaveBeenCalled();
  });

  it("should retry transient error statuses", async () => {
    (sharedAuth.deductUserPoints as any).mockResolvedValue({ success: true, remainingPoints: 95, session: {} as any });

    const mockFailResponse = new Response(null, { status: 503 });
    const mockSuccessResponse = new Response(JSON.stringify({ candidates: [{ finishReason: "STOP" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    (global.fetch as any)
      .mockResolvedValueOnce(mockFailResponse)
      .mockResolvedValueOnce(mockSuccessResponse);

    const response = await onRequest(mockContext as any);
    expect(response.status).toBe(200);
    expect((global.fetch as any).mock.calls.length).toBe(2);
  });
});
