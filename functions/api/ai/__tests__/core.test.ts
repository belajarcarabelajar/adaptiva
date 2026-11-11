import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleAiRequest, MAX_BODY_BYTES } from "../_core";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  type CompleteInput,
  type CompleteResult,
} from "../_claude";
import type { TaskSpec } from "../_tasks";

const URL_AI = "https://adaptiva.app/api/ai";
const ENV = { ANTHROPIC_API_KEY: "sk-test" };
const BALANCE_AFTER_DEDUCT = 80;
const BALANCE_AFTER_REFUND = 100;

type DeductResult = { success: boolean; remainingPoints: number; session: unknown };
type RefundResult = { success: boolean; remainingPoints: number };

function harness(opts: {
  complete?: (spec: TaskSpec, input: CompleteInput) => Promise<CompleteResult>;
  deduct?: () => Promise<DeductResult>;
  refund?: () => Promise<RefundResult>;
} = {}) {
  const gatewayCalls: { spec: TaskSpec; input: CompleteInput }[] = [];
  const deductCalls: number[] = [];
  const refundCalls: number[] = [];
  const deps = {
    gateway: {
      complete: async (spec: TaskSpec, input: CompleteInput) => {
        gatewayCalls.push({ spec, input });
        return opts.complete
          ? opts.complete(spec, input)
          : { text: '{"ok":true}', stopReason: "end_turn", refusalCategory: null };
      },
    },
    deduct: async (_request: Request, _env: unknown, cost: number) => {
      deductCalls.push(cost);
      return opts.deduct
        ? opts.deduct()
        : { success: true, remainingPoints: BALANCE_AFTER_DEDUCT, session: { userId: "u1" } };
    },
    refund: async (_request: Request, _env: unknown, amount: number) => {
      refundCalls.push(amount);
      return opts.refund
        ? opts.refund()
        : { success: true, remainingPoints: BALANCE_AFTER_REFUND };
    },
  };
  return { deps, gatewayCalls, deductCalls, refundCalls };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_AI, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = { task: "curriculum.sevenDayPlan", prompt: "Buat rencana 7 hari" };

let originalConsoleError: typeof console.error;
beforeEach(() => {
  originalConsoleError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe("handleAiRequest validation (no points taken)", () => {
  it("answers 500 when ANTHROPIC_API_KEY is missing", async () => {
    const h = harness();
    const res = await handleAiRequest(post(VALID), {}, h.deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "ANTHROPIC_API_KEY is not configured on this Pages project.",
    });
    expect(h.deductCalls).toEqual([]);
    expect(h.gatewayCalls).toEqual([]);
  });

  it("answers 405 method_not_allowed for GET", async () => {
    const h = harness();
    const res = await handleAiRequest(new Request(URL_AI, { method: "GET" }), ENV, h.deps);
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "method_not_allowed" });
    expect(h.deductCalls).toEqual([]);
  });

  it("answers 413 for a declared content-length over 1 MiB", async () => {
    const h = harness();
    const res = await handleAiRequest(
      post(VALID, { "content-length": String(MAX_BODY_BYTES + 1) }),
      ENV,
      h.deps,
    );
    expect(MAX_BODY_BYTES).toBe(1048576);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(h.deductCalls).toEqual([]);
  });

  it("answers 413 for a buffered body over 1 MiB", async () => {
    const h = harness();
    const big = JSON.stringify({ ...VALID, prompt: "x".repeat(MAX_BODY_BYTES) });
    const request = new Request(URL_AI, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Blob([big]).stream(),
    });
    const res = await handleAiRequest(request, ENV, h.deps);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
    expect(h.deductCalls).toEqual([]);
  });

  const BAD_REQUESTS: [string, unknown, string][] = [
    ["a body that is not JSON", "{not json", "unsupported_request"],
    ["a JSON array body", "[1,2]", "unsupported_request"],
    ["a JSON null body", "null", "unsupported_request"],
    ["an unknown task", { task: "curriculum.everything", prompt: "x" }, "unknown_task"],
    ["an Object.prototype task name", { task: "constructor", prompt: "x" }, "unknown_task"],
    ["a missing task", { prompt: "x" }, "unknown_task"],
    ["a non-string task", { task: 7, prompt: "x" }, "unknown_task"],
    ["an empty prompt", { task: "curriculum.outline", prompt: "" }, "unsupported_request"],
    ["a whitespace prompt", { task: "curriculum.outline", prompt: "   " }, "unsupported_request"],
    ["a missing prompt", { task: "curriculum.outline" }, "unsupported_request"],
    ["a non-string prompt", { task: "curriculum.outline", prompt: 42 }, "unsupported_request"],
    ["a non-string system", { task: "curriculum.outline", prompt: "x", system: 5 }, "unsupported_request"],
  ];

  for (const [label, body, error] of BAD_REQUESTS) {
    it(`answers 400 ${error} for ${label}`, async () => {
      const h = harness();
      const res = await handleAiRequest(post(body), ENV, h.deps);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
      expect(h.deductCalls).toEqual([]);
      expect(h.gatewayCalls).toEqual([]);
    });
  }
});

describe("handleAiRequest points gate", () => {
  it("answers 401 unauthorized without a session and never calls Claude", async () => {
    const h = harness({
      deduct: async () => ({ success: false, remainingPoints: 0, session: null }),
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "unauthorized",
      message: "Sign in with Google required to use AI features.",
    });
    expect(h.gatewayCalls).toEqual([]);
    expect(h.refundCalls).toEqual([]);
  });

  it("answers 429 insufficient_points with the balance and the cost", async () => {
    const h = harness({
      deduct: async () => ({ success: false, remainingPoints: 3, session: { userId: "u1" } }),
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "insufficient_points",
      message: "Poin Anda tidak cukup (3 Poin). Membutuhkan 20 Poin.",
      remainingPoints: 3,
      requiredPoints: 20,
    });
    expect(h.gatewayCalls).toEqual([]);
    expect(h.refundCalls).toEqual([]);
  });

  const COSTS: [string, number][] = [
    ["curriculum.outline", 20],
    ["curriculum.sevenDayPlan", 20],
    ["module.summary", 5],
    ["exam.questions", 15],
    ["quiz.questions", 10],
    ["quiz.explanation", 10],
    ["flashcard.cards", 5],
  ];
  for (const [task, cost] of COSTS) {
    it(`deducts ${cost} points for ${task}`, async () => {
      const h = harness();
      const res = await handleAiRequest(post({ task, prompt: "x" }), ENV, h.deps);
      expect(res.status).toBe(200);
      expect(h.deductCalls).toEqual([cost]);
    });
  }
});

describe("handleAiRequest success", () => {
  it("returns {text} with the balance header and passes prompt and system", async () => {
    const h = harness({
      complete: async () => ({ text: '{"day1":{}}', stopReason: "end_turn", refusalCategory: null }),
    });
    const res = await handleAiRequest(
      post({ ...VALID, system: "Kamu perencana belajar." }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-adaptiva-points")).toBe("80");
    expect(await res.json()).toEqual({ text: '{"day1":{}}' });
    expect(h.gatewayCalls).toHaveLength(1);
    expect(h.gatewayCalls[0].input).toEqual({
      prompt: "Buat rencana 7 hari",
      system: "Kamu perencana belajar.",
    });
    expect(h.refundCalls).toEqual([]);
  });

  it("ignores model, effort, max_tokens and schema sent by the client", async () => {
    const h = harness();
    const res = await handleAiRequest(
      post({
        task: "flashcard.cards",
        prompt: "x",
        model: "claude-opus-5-5",
        effort: "max",
        max_tokens: 128000,
        schema: { type: "object" },
      }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
    const { spec } = h.gatewayCalls[0];
    expect(spec.model).toBe("claude-haiku-5-5");
    expect(spec.effort).toBe("low");
    expect(spec.maxTokens).toBe(16384);
    expect(spec.schema).toHaveProperty("properties.flashcards");
    expect(h.deductCalls).toEqual([5]);
  });

  it("rejects truncated max_tokens JSON with ai_generation_failed and refunds the charge", async () => {
    const h = harness({
      complete: async () => ({ text: '{"questions":[{"quest', stopReason: "max_tokens", refusalCategory: null }),
    });
    const res = await handleAiRequest(post({ task: "quiz.questions", prompt: "x" }), ENV, h.deps);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ai_generation_failed");
    expect(h.refundCalls).toEqual([10]);
  });
});

describe("handleAiRequest Claude failures", () => {
  function apiError(status: number, message?: string) {
    const body = message
      ? { type: "error", error: { type: "invalid_request_error", message } }
      : undefined;
    return APIError.generate(status, body, undefined, new Headers());
  }

  it("maps an APIError to 400 ai_generation_failed with the upstream message and refunds once", async () => {
    const h = harness({ complete: async () => { throw apiError(400, "schema is too complex"); } });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe("100");
    expect(await res.json()).toEqual({
      error: "ai_generation_failed",
      message: "schema is too complex",
      refunded: true,
      remainingPoints: 100,
    });
    expect(h.refundCalls).toEqual([20]);
  });

  it("falls back to the generic message with the refund note when the APIError has none", async () => {
    const h = harness({ complete: async () => { throw apiError(500); } });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("ai_generation_failed");
    expect(body.message).toBe("Layanan AI mengalami kendala (500). Poin Anda telah dikembalikan.");
    expect(h.refundCalls).toEqual([20]);
  });

  it("reports refunded:false and the post-deduct balance when the refund fails on an APIError", async () => {
    const h = harness({
      complete: async () => { throw apiError(529); },
      refund: async () => ({ success: false, remainingPoints: 0 }),
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe("80");
    const body = await res.json();
    expect(body).toMatchObject({ error: "ai_generation_failed", refunded: false, remainingPoints: 80 });
    expect(body.message).toBe(
      "Layanan AI mengalami kendala (529). Poin Anda gagal dikembalikan, silakan hubungi admin.",
    );
    expect(h.refundCalls).toEqual([20]);
  });

  for (const [label, make] of [
    ["APIConnectionError", () => new APIConnectionError({ message: "Connection error." })],
    ["APIConnectionTimeoutError", () => new APIConnectionTimeoutError()],
  ] as const) {
    it(`maps ${label} to 400 ai_upstream_network_error and refunds once`, async () => {
      const err = make();
      const h = harness({ complete: async () => { throw err; } });
      const res = await handleAiRequest(post(VALID), ENV, h.deps);
      expect(res.status).toBe(400);
      expect(res.headers.get("x-adaptiva-points")).toBe("100");
      expect(await res.json()).toEqual({
        error: "ai_upstream_network_error",
        message: "Gagal terhubung ke layanan AI. Poin Anda telah dikembalikan.",
        detail: String(err),
        refunded: true,
        remainingPoints: 100,
      });
      expect(h.refundCalls).toEqual([20]);
    });
  }

  it("reports the failed-refund note when the refund throws on a network error", async () => {
    const h = harness({
      complete: async () => { throw new APIConnectionError({ message: "Connection error." }); },
      refund: async () => { throw new Error("KV down"); },
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe("80");
    expect(await res.json()).toMatchObject({
      error: "ai_upstream_network_error",
      message: "Gagal terhubung ke layanan AI. Poin Anda gagal dikembalikan, silakan hubungi admin.",
      refunded: false,
      remainingPoints: 80,
    });
    expect(h.refundCalls).toEqual([20]);
  });

  it("maps a refusal to 400 ai_generation_blocked naming the category, without a refund", async () => {
    const h = harness({
      complete: async () => ({ text: "Maaf.", stopReason: "refusal", refusalCategory: "cyber" }),
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-adaptiva-points")).toBe("80");
    expect(await res.json()).toEqual({
      error: "ai_generation_blocked",
      message:
        "AI terhenti dengan alasan: cyber. Poin tidak dikembalikan karena layanan AI tetap menagih permintaan ini.",
      refunded: false,
      remainingPoints: 80,
    });
    expect(h.refundCalls).toEqual([]);
  });

  it("names the refusal itself when no category is given", async () => {
    const h = harness({
      complete: async () => ({ text: "", stopReason: "refusal", refusalCategory: null }),
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    const body = await res.json();
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.message).toContain("AI terhenti dengan alasan: refusal.");
    // A pre-output refusal with no category is not billed, so it is refunded (D1).
    expect(h.refundCalls).toEqual([20]);
  });

  it("answers 502 Proxy error and refunds once on an unexpected throw after the deduction", async () => {
    const h = harness({ complete: async () => { throw new Error("boom"); } });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(502);
    expect(res.headers.get("x-adaptiva-points")).toBe("100");
    expect(await res.json()).toEqual({
      error: "Proxy error",
      message: "Gagal memproses permintaan AI. Poin Anda telah dikembalikan.",
      detail: "boom",
      refunded: true,
    });
    expect(h.refundCalls).toEqual([20]);
  });

  it("answers 502 with the failed-refund note when the refund throws after an unexpected error", async () => {
    const h = harness({
      complete: async () => { throw new Error("boom"); },
      refund: async () => { throw new Error("KV down"); },
    });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "Proxy error",
      message: "Gagal memproses permintaan AI. Poin Anda gagal dikembalikan, silakan hubungi admin.",
      refunded: false,
    });
    expect(h.refundCalls).toEqual([20]);
  });

  it("answers 502 without a refund when the deduction itself throws", async () => {
    const h = harness({ deduct: async () => { throw new Error("KV down"); } });
    const res = await handleAiRequest(post(VALID), ENV, h.deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Proxy error",
      message: "Gagal memproses permintaan AI.",
      detail: "KV down",
      refunded: false,
    });
    expect(h.refundCalls).toEqual([]);
    expect(h.gatewayCalls).toEqual([]);
  });
});
