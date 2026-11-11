import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleAiRequest } from "../_core";
import { APIConnectionError, APIError } from "../_claude";
import type { streamTutorText, TutorRunResult } from "../_tutor";
import type { runResourceSearch, ResourceSearchResult } from "../_search";

const URL_AI = "https://adaptiva.app/api/ai";
const ENV = { ANTHROPIC_API_KEY: "sk-test" };
const BALANCE_AFTER_DEDUCT = 80;
const BALANCE_AFTER_REFUND = 100;

type DeductResult = { success: boolean; remainingPoints: number; session: unknown };
type TutorOpts = Parameters<typeof streamTutorText>[0];
type SearchOpts = Parameters<typeof runResourceSearch>[0];

function harness(opts: {
  stream?: (o: TutorOpts) => Promise<TutorRunResult>;
  search?: (o: SearchOpts) => Promise<ResourceSearchResult>;
  deduct?: () => Promise<DeductResult>;
} = {}) {
  const deductCalls: number[] = [];
  const refundCalls: number[] = [];
  const streamCalls: TutorOpts[] = [];
  const searchCalls: SearchOpts[] = [];
  const deps = {
    gateway: {
      complete: async () => {
        throw new Error("gateway must not be used for this kind");
      },
    },
    deduct: async (_r: Request, _e: unknown, cost: number) => {
      deductCalls.push(cost);
      return opts.deduct
        ? opts.deduct()
        : { success: true, remainingPoints: BALANCE_AFTER_DEDUCT, session: { userId: "u1" } };
    },
    refund: async (_r: Request, _e: unknown, amount: number) => {
      refundCalls.push(amount);
      return { success: true, remainingPoints: BALANCE_AFTER_REFUND };
    },
    tutor: {
      stream: (async (o: TutorOpts) => {
        streamCalls.push(o);
        if (opts.stream) return opts.stream(o);
        o.onDelta("Halo");
        o.onDelta(" dunia");
        return { stopReason: "end_turn", refusalCategory: null };
      }) as typeof streamTutorText,
    },
    search: {
      run: (async (o: SearchOpts) => {
        searchCalls.push(o);
        if (opts.search) return opts.search(o);
        return {
          text: "Sumber belajar",
          sources: [{ url: "https://example.com/a", title: "A" }],
          stopReason: "end_turn",
          refusalCategory: null,
        };
      }) as typeof runResourceSearch,
    },
  };
  return { deps, deductCalls, refundCalls, streamCalls, searchCalls };
}

function post(body: unknown): Request {
  return new Request(URL_AI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function frames(text: string): unknown[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

const TUTOR = {
  task: "tutor.chat",
  system: "Kamu tutor.",
  messages: [{ role: "user", content: "Apa itu fotosintesis?" }],
};
const SEARCH = { task: "resources.search", prompt: "Cari sumber fotosintesis" };

let originalConsoleError: typeof console.error;
beforeEach(() => {
  originalConsoleError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe("tutor.chat route", () => {
  it("answers 400 unsupported_request for an invalid tutor body without taking points", async () => {
    const h = harness();
    const res = await handleAiRequest(
      post({ task: "tutor.chat", system: "s", messages: [{ role: "assistant", content: "hi" }] }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_request" });
    expect(h.deductCalls).toEqual([]);
    expect(h.streamCalls).toEqual([]);
  });

  it("streams delta frames then done with the post-deduct balance header", async () => {
    const h = harness();
    const res = await handleAiRequest(post(TUTOR), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_DEDUCT));
    expect(frames(await res.text())).toEqual([
      { type: "delta", text: "Halo" },
      { type: "delta", text: " dunia" },
      { type: "done" },
    ]);
    expect(h.deductCalls).toEqual([2]);
    expect(h.refundCalls).toEqual([]);
    expect(h.streamCalls).toHaveLength(1);
    const call = h.streamCalls[0];
    expect(call.apiKey).toBe("sk-test");
    expect(call.model).toBe("claude-haiku-5-5");
    expect(call.effort).toBe("low");
    expect(call.maxTokens).toBe(8192);
    expect(call.system).toBe("Kamu tutor.");
    expect(call.messages).toEqual([{ role: "user", content: "Apa itu fotosintesis?" }]);
  });

  it("sends an error frame and refunds exactly once when the stream fails before output", async () => {
    const h = harness({
      stream: async () => {
        throw new APIConnectionError({ message: "Connection error." });
      },
    });
    const res = await handleAiRequest(post(TUTOR), ENV, h.deps);
    expect(res.status).toBe(200);
    const out = frames(await res.text()) as { type: string; error?: string; message?: string }[];
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("error");
    expect(out[0].error).toBe("ai_upstream_network_error");
    expect(out[0].message).toContain("Poin Anda telah dikembalikan.");
    expect(h.refundCalls).toEqual([2]);
  });

  it("maps an APIError before output to ai_generation_failed and refunds once", async () => {
    const h = harness({
      stream: async () => {
        throw APIError.generate(500, { error: { message: "boom" } }, undefined, new Headers());
      },
    });
    const res = await handleAiRequest(post(TUTOR), ENV, h.deps);
    const out = frames(await res.text()) as { type: string; error?: string; message?: string }[];
    expect(out).toHaveLength(1);
    expect(out[0].error).toBe("ai_generation_failed");
    expect(out[0].message).toContain("Poin Anda telah dikembalikan.");
    expect(h.refundCalls).toEqual([2]);
  });

  it("answers 401 JSON without a session", async () => {
    const h = harness({ deduct: async () => ({ success: false, remainingPoints: 0, session: null }) });
    const res = await handleAiRequest(post(TUTOR), ENV, h.deps);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as { error: string }).error).toBe("unauthorized");
    expect(h.streamCalls).toEqual([]);
  });

  it("answers 429 JSON when points are insufficient", async () => {
    const h = harness({
      deduct: async () => ({ success: false, remainingPoints: 1, session: { userId: "u1" } }),
    });
    const res = await handleAiRequest(post(TUTOR), ENV, h.deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as { error: string }).error).toBe("insufficient_points");
    expect(h.streamCalls).toEqual([]);
  });
});

describe("resources.search route", () => {
  it("answers 200 with text and sources and the post-deduct balance header", async () => {
    const h = harness();
    const res = await handleAiRequest(post(SEARCH), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-adaptiva-points")).toBe(String(BALANCE_AFTER_DEDUCT));
    expect(await res.json()).toEqual({
      text: "Sumber belajar",
      sources: [{ url: "https://example.com/a", title: "A" }],
    });
    expect(h.deductCalls).toEqual([5]);
    expect(h.searchCalls).toEqual([
      {
        apiKey: "sk-test",
        model: "claude-sonnet-5-5",
        effort: "medium",
        maxTokens: 16384,
        prompt: "Cari sumber fotosintesis",
      },
    ]);
  });

  it("maps an APIError to 400 ai_generation_failed and refunds once", async () => {
    const h = harness({
      search: async () => {
        throw APIError.generate(400, { error: { message: "bad search" } }, undefined, new Headers());
      },
    });
    const res = await handleAiRequest(post(SEARCH), ENV, h.deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; refunded: boolean };
    expect(body.error).toBe("ai_generation_failed");
    expect(body.refunded).toBe(true);
    expect(h.refundCalls).toEqual([5]);
  });

  it("answers 400 ai_generation_blocked on a refusal without a refund", async () => {
    const h = harness({
      search: async () => ({
        text: "",
        sources: [],
        stopReason: "refusal",
        refusalCategory: "cyber",
      }),
    });
    const res = await handleAiRequest(post(SEARCH), ENV, h.deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("ai_generation_blocked");
    expect(body.message).toContain("cyber");
    expect(h.refundCalls).toEqual([]);
  });

  it("answers 400 unsupported_request for an empty prompt without taking points", async () => {
    const h = harness();
    const res = await handleAiRequest(post({ task: "resources.search", prompt: " " }), ENV, h.deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_request" });
    expect(h.deductCalls).toEqual([]);
    expect(h.searchCalls).toEqual([]);
  });
});
