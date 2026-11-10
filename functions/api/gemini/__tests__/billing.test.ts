import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { onRequest } from "../[[path]]";
import * as sharedAuth from "../../auth/_shared";

mock.module("../../auth/_shared", () => ({
  deductUserPoints: mock(),
  refundUserPoints: mock(),
  getAllowedOrigin: mock().mockReturnValue("*"),
}));

const ORIGIN = "https://adaptiva.app/api/gemini";
const GENERATE_PATH = "v1beta/models/gemini-2.5-flash:generateContent";
const STREAM_PATH = "v1beta/models/gemini-2.5-flash:streamGenerateContent";

// Owner decision F1: the server caps output per action. Values are the spec,
// documented next to ACTION_POINT_COSTS.
const EXPECTED_CAPS: Record<string, number> = {
  curriculum: 16384,
  module: 32768,
  quiz: 16384,
  exam: 32768,
  flashcard: 16384,
  tutor: 8192,
  default: 16384,
};

function makeContext(
  opts: { action?: string; body?: string; path?: string; search?: string } = {},
) {
  const path = opts.path ?? GENERATE_PATH;
  return {
    env: { GEMINI_API_KEY: "test-api-key" },
    params: { path: path.split("/") },
    request: new Request(`${ORIGIN}/${path}${opts.search ?? ""}`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-adaptiva-action": opts.action ?? "default",
      }),
      body:
        opts.body ??
        JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] }),
    }),
  };
}

function upstreamJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Gemini proxy billing rules", () => {
  let originalFetch: typeof global.fetch;
  let originalConsoleError: typeof console.error;
  let fetchMock: ReturnType<typeof mock>;
  let errorSpy: ReturnType<typeof mock>;
  let deductMock: any;
  let refundMock: any;

  beforeEach(() => {
    deductMock = sharedAuth.deductUserPoints as any;
    refundMock = sharedAuth.refundUserPoints as any;
    deductMock.mockClear();
    refundMock.mockClear();
    deductMock.mockResolvedValue({ success: true, remainingPoints: 95, session: {} });
    refundMock.mockResolvedValue({ success: true, remainingPoints: 100 });
    originalFetch = global.fetch;
    fetchMock = mock(() =>
      Promise.resolve(upstreamJson({ candidates: [{ finishReason: "STOP" }] })),
    );
    global.fetch = fetchMock as any;
    originalConsoleError = console.error;
    errorSpy = mock();
    console.error = errorSpy as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    mock.restore();
  });

  async function upstreamBody(): Promise<any> {
    const init = (fetchMock.mock.calls[0] as any[])[1] as RequestInit;
    return JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer));
  }

  describe("output token cap", () => {
    for (const [action, cap] of Object.entries(EXPECTED_CAPS)) {
      it(`forces maxOutputTokens ${cap} for action "${action}" when the client sets none`, async () => {
        const res = await onRequest(makeContext({ action }) as any);
        expect(res.status).toBe(200);
        const body = await upstreamBody();
        expect(body.generationConfig.maxOutputTokens).toBe(cap);
        expect(body.contents).toEqual([{ parts: [{ text: "Hello" }] }]);
      });
    }

    it("lowers a larger client value to the action cap", async () => {
      await onRequest(
        makeContext({
          action: "tutor",
          body: JSON.stringify({
            contents: [],
            generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
          }),
        }) as any,
      );
      const body = await upstreamBody();
      expect(body.generationConfig).toEqual({ maxOutputTokens: 8192, temperature: 0.2 });
    });

    it("keeps a smaller client value and the other generation fields", async () => {
      await onRequest(
        makeContext({
          action: "quiz",
          body: JSON.stringify({
            contents: [],
            generationConfig: { maxOutputTokens: 1000, responseMimeType: "application/json" },
          }),
        }) as any,
      );
      const body = await upstreamBody();
      expect(body.generationConfig).toEqual({
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
      });
    });

    for (const bad of ["9999999", -5, 0, null, 1.5e9]) {
      it(`replaces an invalid client value ${JSON.stringify(bad)} with the cap`, async () => {
        await onRequest(
          makeContext({
            action: "flashcard",
            body: JSON.stringify({ contents: [], generationConfig: { maxOutputTokens: bad } }),
          }) as any,
        );
        const body = await upstreamBody();
        expect(body.generationConfig.maxOutputTokens).toBe(16384);
      });
    }

    it("caps the streaming endpoint too", async () => {
      await onRequest(
        makeContext({ action: "tutor", path: STREAM_PATH, search: "?alt=sse" }) as any,
      );
      const body = await upstreamBody();
      expect(body.generationConfig.maxOutputTokens).toBe(8192);
    });

    for (const [label, raw] of [
      ["a non-JSON body", "not json"],
      ["a JSON array body", "[1,2]"],
      ["a non-object generationConfig", JSON.stringify({ contents: [], generationConfig: 7 })],
    ] as const) {
      it(`rejects ${label} with 400 before deducting or fetching`, async () => {
        const res = await onRequest(makeContext({ body: raw }) as any);
        expect(res.status).toBe(400);
        expect(((await res.json()) as any).error).toBe("unsupported_request");
        expect(deductMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  });

  describe("responses Google bills are not refunded", () => {
    const billed: Array<[string, unknown]> = [
      ["finishReason SAFETY", { candidates: [{ finishReason: "SAFETY" }], usageMetadata: { promptTokenCount: 7 } }],
      ["finishReason RECITATION", { candidates: [{ finishReason: "RECITATION" }] }],
      ["a blocked prompt", { promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 7 } }],
      ["an empty candidate list", { candidates: [] }],
    ];
    for (const [label, payload] of billed) {
      it(`reports ${label} as blocked and keeps the charge`, async () => {
        fetchMock.mockImplementation(() => Promise.resolve(upstreamJson(payload)));
        const res = await onRequest(makeContext() as any);
        expect(res.status).toBe(400);
        expect(res.headers.get("x-adaptiva-points")).toBe("95");
        const json = (await res.json()) as any;
        expect(json.error).toBe("ai_generation_blocked");
        expect(json.refunded).toBe(false);
        expect(json.remainingPoints).toBe(95);
        expect(json.message).not.toContain("telah dikembalikan");
        expect(refundMock).not.toHaveBeenCalled();
      });
    }

    it("still passes MAX_TOKENS output through as a billed success", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(upstreamJson({ candidates: [{ finishReason: "MAX_TOKENS" }] })),
      );
      const res = await onRequest(makeContext() as any);
      expect(res.status).toBe(200);
      expect(refundMock).not.toHaveBeenCalled();
    });

    it("refunds a 2xx body that is a Google error object", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(upstreamJson({ error: { message: "Internal" } })),
      );
      const res = await onRequest(makeContext() as any);
      expect(res.status).toBe(400);
      expect(refundMock).toHaveBeenCalledTimes(1);
      expect(((await res.json()) as any).refunded).toBe(true);
    });
  });

  describe("refund failures are surfaced", () => {
    function failUpstream() {
      fetchMock.mockImplementation(() =>
        Promise.resolve(upstreamJson({ error: { message: "Bad Request" } }, 400)),
      );
    }

    it("reports the true balance and logs when the refund reports failure", async () => {
      failUpstream();
      refundMock.mockResolvedValue({ success: false, remainingPoints: 0 });
      const res = await onRequest(makeContext() as any);
      expect(res.status).toBe(400);
      expect(res.headers.get("x-adaptiva-points")).toBe("95");
      const json = (await res.json()) as any;
      expect(json.refunded).toBe(false);
      expect(json.remainingPoints).toBe(95);
      expect(json.message).not.toContain("telah dikembalikan");
      const logged = errorSpy.mock.calls.find((c: any[]) => c[0] === "Points refund failed");
      expect(logged).toBeDefined();
      expect(logged![1]).toMatchObject({ action: "default", points: 5 });
    });

    it("refunds once and surfaces a refund that throws", async () => {
      failUpstream();
      refundMock.mockRejectedValue(new Error("KV PUT failed: 429 Too Many Requests"));
      const res = await onRequest(makeContext() as any);
      expect(refundMock).toHaveBeenCalledTimes(1);
      expect(res.headers.get("x-adaptiva-points")).toBe("95");
      const json = (await res.json()) as any;
      expect(json.refunded).toBe(false);
      expect(errorSpy.mock.calls.some((c: any[]) => c[0] === "Points refund failed")).toBe(true);
    });

    it("reports a network failure refund that fails as not refunded", async () => {
      fetchMock.mockImplementation(() => Promise.reject(new Error("down")));
      refundMock.mockResolvedValue({ success: false, remainingPoints: 0 });
      const res = await onRequest(makeContext() as any);
      expect(res.headers.get("x-adaptiva-points")).toBe("95");
      const json = (await res.json()) as any;
      expect(json.error).toBe("ai_upstream_network_error");
      expect(json.refunded).toBe(false);
      expect(json.message).not.toContain("telah dikembalikan");
    }, 15000);

    it("marks a successful refund as refunded with the ledger balance", async () => {
      failUpstream();
      const res = await onRequest(makeContext() as any);
      expect(res.headers.get("x-adaptiva-points")).toBe("100");
      const json = (await res.json()) as any;
      expect(json.refunded).toBe(true);
      expect(json.remainingPoints).toBe(100);
    });
  });
});
