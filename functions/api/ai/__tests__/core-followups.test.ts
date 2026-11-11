import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleAiRequest } from "../_core";
import { createClaudeGateway, type CompleteResult } from "../_claude";
import { runResourceSearch, type ResourceSearchResult } from "../_search";
import { resolveTask } from "../_tasks";

const URL_AI = "https://adaptiva.app/api/ai";
const ENV = { ANTHROPIC_API_KEY: "sk-test" };
const BALANCE_AFTER_DEDUCT = 80;
const BALANCE_AFTER_REFUND = 100;
const REFUNDED = "Poin Anda telah dikembalikan.";

function harness(opts: {
  complete?: () => Promise<CompleteResult>;
  search?: () => Promise<ResourceSearchResult>;
}) {
  const refundCalls: number[] = [];
  const deps = {
    gateway: {
      complete: async () =>
        opts.complete
          ? opts.complete()
          : { text: '{"ok":true}', stopReason: "end_turn", refusalCategory: null },
    },
    deduct: async () => ({
      success: true,
      remainingPoints: BALANCE_AFTER_DEDUCT,
      session: { userId: "u1" },
    }),
    refund: async (_r: Request, _e: unknown, amount: number) => {
      refundCalls.push(amount);
      return { success: true, remainingPoints: BALANCE_AFTER_REFUND };
    },
    search: {
      run: (async () =>
        opts.search
          ? opts.search()
          : { text: "x", sources: [], stopReason: "end_turn", refusalCategory: null }) as typeof runResourceSearch,
    },
  };
  return { deps, refundCalls };
}

function post(body: unknown): Request {
  return new Request(URL_AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const JSON_TASK = { task: "quiz.questions", prompt: "Buat kuis" }; // costs 10
const SEARCH_TASK = { task: "resources.search", prompt: "Cari sumber" }; // costs 5

type ErrorBody = { error: string; message: string; refunded: boolean; remainingPoints?: number };

let originalError: typeof console.error;
let originalLog: typeof console.log;
let logCalls: unknown[][];
beforeEach(() => {
  originalError = console.error;
  originalLog = console.log;
  console.error = () => {};
  logCalls = [];
  console.log = (...args: unknown[]) => {
    logCalls.push(args);
  };
});
afterEach(() => {
  console.error = originalError;
  console.log = originalLog;
});

describe("D2 empty output", () => {
  it("answers 400 ai_generation_failed and refunds once for an empty json result", async () => {
    const h = harness({ complete: async () => ({ text: "  \n", stopReason: "end_turn", refusalCategory: null }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_REFUND));
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_failed");
    expect(body.refunded).toBe(true);
    expect(body.remainingPoints).toBe(BALANCE_AFTER_REFUND);
    expect(body.message.endsWith(REFUNDED)).toBe(true);
    expect(h.refundCalls).toEqual([10]);
  });

  it("answers 400 ai_generation_failed and refunds once for an empty search result", async () => {
    const h = harness({
      search: async () => ({ text: "", sources: [{ url: "https://a", title: "A" }], stopReason: "end_turn", refusalCategory: null }),
    });
    const res = await handleAiRequest(post(SEARCH_TASK), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_REFUND));
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_failed");
    expect(body.refunded).toBe(true);
    expect(body.message.endsWith(REFUNDED)).toBe(true);
    expect(h.refundCalls).toEqual([5]);
  });
});

describe("D1 refusal refund by category", () => {
  it("keeps the charge for a billed category refused before output", async () => {
    const h = harness({ complete: async () => ({ text: "", stopReason: "refusal", refusalCategory: "bio" }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.refunded).toBe(false);
    expect(h.refundCalls).toEqual([]);
  });

  it("refunds once for a non-billed category refused before output", async () => {
    const h = harness({ complete: async () => ({ text: "", stopReason: "refusal", refusalCategory: "cyber" }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_REFUND));
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.refunded).toBe(true);
    expect(body.message).toContain("cyber");
    expect(body.message).toContain(REFUNDED);
    expect(h.refundCalls).toEqual([10]);
  });

  it("refunds once for a pre-output refusal with no category", async () => {
    const h = harness({ search: async () => ({ text: "", sources: [], stopReason: "refusal", refusalCategory: null }) });
    const res = await handleAiRequest(post(SEARCH_TASK), ENV, h.deps);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.refunded).toBe(true);
    expect(h.refundCalls).toEqual([5]);
  });

  it("keeps the charge for a refusal that came after partial text", async () => {
    const h = harness({ complete: async () => ({ text: '{"quest', stopReason: "refusal", refusalCategory: "cyber" }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.refunded).toBe(false);
    expect(h.refundCalls).toEqual([]);
  });
});

describe("D9 usage log", () => {
  it("logs task, model and token counts after a successful call, never the prompt or text", async () => {
    const h = harness({
      complete: async () => ({
        text: '{"questions":[]}',
        stopReason: "end_turn",
        refusalCategory: null,
        usage: { input_tokens: 120, output_tokens: 34 },
      }),
    });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(logCalls).toEqual([
      [
        "Claude usage",
        {
          task: "quiz.questions",
          model: "claude-haiku-5-5",
          input_tokens: 120,
          output_tokens: 34,
          web_search_requests: undefined,
        },
      ],
    ]);
    expect(JSON.stringify(logCalls)).not.toContain("Buat kuis");
  });
});

// A minimal Messages API SSE stream whose final usage the SDK accumulates.
function sse(text: string): Response {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_t", type: "message", role: "assistant", model: "m", content: [],
        stop_reason: null, stop_sequence: null, stop_details: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null, stop_details: null },
      usage: { output_tokens: 42, server_tool_use: { web_search_requests: 2 } },
    },
    { type: "message_stop" },
  ];
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("D9 usage populated from the final message", () => {
  it("createClaudeGateway().complete returns the message usage", async () => {
    const gateway = createClaudeGateway("sk-test", (async () => sse('{"a":1}')) as unknown as typeof fetch);
    const result = await gateway.complete(resolveTask("quiz.questions")!, { prompt: "p" });
    expect(result.usage?.input_tokens).toBe(12);
    expect(result.usage?.output_tokens).toBe(42);
  });

  it("runResourceSearch returns the message usage with web search requests", async () => {
    const result = await runResourceSearch({
      apiKey: "sk-test",
      fetchImpl: (async () => sse("hasil")) as unknown as typeof fetch,
      model: "claude-sonnet-5-5",
      effort: "medium",
      maxTokens: 100,
      prompt: "p",
    });
    expect(result.usage?.input_tokens).toBe(12);
    expect(result.usage?.output_tokens).toBe(42);
    expect(result.usage?.server_tool_use?.web_search_requests).toBe(2);
  });
});
