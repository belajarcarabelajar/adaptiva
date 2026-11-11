import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// A value getAllowedOrigin would never derive from the request, so seeing it
// in a header proves the header came from getAllowedOrigin.
const ALLOWED_ORIGIN = "https://allowed.adaptiva.test";
const URL_AI = "https://adaptiva.app/api/ai";
const BALANCE_AFTER_DEDUCT = 77;

const deductCalls: number[] = [];
const refundCalls: number[] = [];

mock.module("../../auth/_shared", () => ({
  getAllowedOrigin: () => ALLOWED_ORIGIN,
  deductUserPoints: async (_request: Request, _env: unknown, cost: number) => {
    deductCalls.push(cost);
    return { success: true, remainingPoints: BALANCE_AFTER_DEDUCT, session: { userId: "u1" } };
  },
  refundUserPoints: async (_request: Request, _env: unknown, amount: number) => {
    refundCalls.push(amount);
    return { success: true, remainingPoints: BALANCE_AFTER_DEDUCT + amount };
  },
}));

const { onRequest } = await import("../index");

// A Messages API SSE stream in the documented event order, one text block.
function claudeSse(text: string, model: string): Response {
  const events: any[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null, stop_details: null },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  ];
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "request-id": "req_test" },
  });
}

const realFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function stubFetch(respond: (url: string, body: any) => Response) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const raw = request ? await request.text() : init?.body;
    fetchCalls.push(url);
    return respond(url, raw ? JSON.parse(String(raw)) : undefined);
  }) as unknown as typeof fetch;
}

function call(request: Request, env: Record<string, unknown>) {
  return onRequest({ request, env } as any);
}

function post(body: unknown): Request {
  return new Request(URL_AI, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://adaptiva.app" },
    body: JSON.stringify(body),
  });
}

function expectCors(res: Response) {
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
  expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
}

beforeEach(() => {
  deductCalls.length = 0;
  refundCalls.length = 0;
  fetchCalls = [];
  stubFetch(() => {
    throw new Error("unexpected network call");
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("onRequest /api/ai", () => {
  it("answers a preflight OPTIONS with 204 and the CORS headers", async () => {
    const res = await call(
      new Request(URL_AI, { method: "OPTIONS", headers: { origin: "https://adaptiva.app" } }),
      { ANTHROPIC_API_KEY: "sk-test" },
    );
    expect(res.status).toBe(204);
    expectCors(res);
    expect(deductCalls).toEqual([]);
  });

  it("returns a 500 JSON error with CORS headers when ANTHROPIC_API_KEY is missing", async () => {
    const res = await call(post({ task: "quiz.explanation", prompt: "Jelaskan" }), {});
    expect(res.status).toBe(500);
    expectCors(res);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ANTHROPIC_API_KEY");
    expect(deductCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it("rejects an unknown task with 400 unknown_task before taking points", async () => {
    const res = await call(post({ task: "nope.task", prompt: "x" }), { ANTHROPIC_API_KEY: "sk-test" });
    expect(res.status).toBe(400);
    expectCors(res);
    expect(await res.json()).toEqual({ error: "unknown_task" });
    expect(deductCalls).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it("returns 200 {text} with the points header for a valid json task", async () => {
    stubFetch((_url, body) => claudeSse('{"explanation":"karena"}', body.model));
    const res = await call(post({ task: "quiz.explanation", prompt: "Jelaskan" }), {
      ANTHROPIC_API_KEY: "sk-test",
    });
    expect(res.status).toBe(200);
    expectCors(res);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_DEDUCT));
    expect(await res.json()).toEqual({ text: '{"explanation":"karena"}' });
    expect(deductCalls).toHaveLength(1);
    expect(refundCalls).toEqual([]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("api.anthropic.com");
  });
});
