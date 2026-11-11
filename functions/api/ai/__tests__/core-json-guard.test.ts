import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleAiRequest } from "../_core";
import type { CompleteResult } from "../_claude";
import type { ResourceSearchResult, runResourceSearch } from "../_search";

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
let errorCalls: unknown[][];
beforeEach(() => {
  originalError = console.error;
  errorCalls = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };
});
afterEach(() => {
  console.error = originalError;
});

async function expectRefundedFailure(res: Response) {
  expect(res.status).toBe(400);
  expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_REFUND));
  const body = (await res.json()) as ErrorBody;
  expect(body.error).toBe("ai_generation_failed");
  expect(body.message).toBe(`Jawaban AI tidak lengkap. ${REFUNDED}`);
  expect(body.refunded).toBe(true);
  expect(body.remainingPoints).toBe(BALANCE_AFTER_REFUND);
}

describe("JSON task output guard", () => {
  it("answers 400 and refunds once for truncated JSON cut at max_tokens", async () => {
    const truncated = '{"questions":[{"q":"RAHASIA_TERPOTONG';
    const h = harness({ complete: async () => ({ text: truncated, stopReason: "max_tokens", refusalCategory: null }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    await expectRefundedFailure(res);
    expect(h.refundCalls).toEqual([10]);
    expect(errorCalls).toEqual([
      ["Claude JSON output unusable", { task: "quiz.questions", stopReason: "max_tokens" }],
    ]);
    expect(JSON.stringify(errorCalls)).not.toContain("RAHASIA_TERPOTONG");
  });

  it("answers 400 and refunds once for invalid JSON at end_turn", async () => {
    const h = harness({ complete: async () => ({ text: "Berikut kuisnya: {", stopReason: "end_turn", refusalCategory: null }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    await expectRefundedFailure(res);
    expect(h.refundCalls).toEqual([10]);
  });

  it("answers 200 with the text and keeps the charge for valid JSON at end_turn", async () => {
    const h = harness({ complete: async () => ({ text: '{"questions":[]}', stopReason: "end_turn", refusalCategory: null }) });
    const res = await handleAiRequest(post(JSON_TASK), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_DEDUCT));
    expect(await res.json()).toEqual({ text: '{"questions":[]}' });
    expect(h.refundCalls).toEqual([]);
  });

  it("leaves a search task cut at max_tokens with text as a 200 without refund", async () => {
    const h = harness({
      search: async () => ({ text: "## Sumber\n- sebagian", sources: [], stopReason: "max_tokens", refusalCategory: null }),
    });
    const res = await handleAiRequest(post(SEARCH_TASK), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "## Sumber\n- sebagian", sources: [] });
    expect(h.refundCalls).toEqual([]);
  });
});
