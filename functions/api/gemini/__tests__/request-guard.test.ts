import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import * as proxy from "../[[path]]";

const { onRequest } = proxy;
const resolveCost = (action: string) => (proxy as any).resolveCost(action);
import * as sharedAuth from "../../auth/_shared";

mock.module("../../auth/_shared", () => ({
  deductUserPoints: mock(),
  refundUserPoints: mock(),
  getAllowedOrigin: mock().mockReturnValue("*"),
}));

const ORIGIN = "https://adaptiva.app/api/gemini";
const GENERATE_PATH = "v1beta/models/gemini-2.5-flash:generateContent";
const MAX_BODY = 1048576;

type Init = {
  method?: string;
  path?: string;
  search?: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeContext(init: Init = {}) {
  const path = init.path ?? GENERATE_PATH;
  const method = init.method ?? "POST";
  const hasBody = method !== "GET" && method !== "HEAD";
  return {
    env: { GEMINI_API_KEY: "test-api-key" },
    params: { path: path.split("/") },
    request: new Request(`${ORIGIN}/${path}${init.search ?? ""}`, {
      method,
      headers: new Headers({
        "content-type": "application/json",
        ...(init.headers ?? {}),
      }),
      body: hasBody
        ? (init.body ??
          JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] }))
        : undefined,
    }),
  };
}

function okUpstream(): Response {
  return new Response(
    JSON.stringify({ candidates: [{ finishReason: "STOP" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Gemini proxy request guard", () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: ReturnType<typeof mock>;
  let deductMock: any;
  let refundMock: any;

  beforeEach(() => {
    deductMock = sharedAuth.deductUserPoints as any;
    refundMock = sharedAuth.refundUserPoints as any;
    deductMock.mockClear();
    refundMock.mockClear();
    deductMock.mockResolvedValue({
      success: true,
      remainingPoints: 95,
      session: {},
    });
    refundMock.mockResolvedValue({ success: true, remainingPoints: 100 });
    originalFetch = global.fetch;
    fetchMock = mock(() => Promise.resolve(okUpstream()));
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Resets the per-test mock functions. It does not undo mock.module, so the
    // Functions suite runs with `bun test --isolate` (see test:functions).
    mock.restore();
  });

  describe("resolveCost", () => {
    it("returns the table cost for a known action", () => {
      expect(resolveCost("quiz")).toBe(10);
      expect(resolveCost("default")).toBe(5);
    });

    it("returns null for prototype names and unknown actions", () => {
      for (const name of ["constructor", "__proto__", "toString", "nope"]) {
        expect(resolveCost(name)).toBeNull();
      }
    });
  });

  for (const action of ["constructor", "__proto__", "toString", "nope"]) {
    it(`rejects action "${action}" with 400 before deducting or fetching`, async () => {
      const res = await onRequest(
        makeContext({ headers: { "x-adaptiva-action": action } }) as any,
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "unknown_action" });
      expect(deductMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("allows the default action header and charges 5 points", async () => {
    const res = await onRequest(
      makeContext({ headers: { "x-adaptiva-action": "default" } }) as any,
    );
    expect(res.status).toBe(200);
    expect(deductMock).toHaveBeenCalledTimes(1);
    expect(deductMock.mock.calls[0][2]).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not refund when the deduction itself threw", async () => {
    deductMock.mockRejectedValue(new Error("kv unavailable"));
    const res = await onRequest(makeContext() as any);
    expect(res.status).toBe(502);
    expect(refundMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refunds the charged cost exactly once when the upstream call fails", async () => {
    fetchMock.mockImplementation(() => {
      throw new Error("fetch exploded synchronously");
    });
    const res = await onRequest(
      makeContext({ headers: { "x-adaptiva-action": "quiz" } }) as any,
    );
    expect(res.status).not.toBe(200);
    const refunded = refundMock.mock.calls.reduce(
      (sum: number, call: any[]) => sum + call[2],
      0,
    );
    expect(refunded).toBe(10);
  });

  it("treats a missing action header as default", async () => {
    const res = await onRequest(makeContext() as any);
    expect(res.status).toBe(200);
    expect(deductMock.mock.calls[0][2]).toBe(5);
  });

  it("rejects GET with 405", async () => {
    const res = await onRequest(makeContext({ method: "GET" }) as any);
    expect(res.status).toBe(405);
    expect((await res.json()).error).toBe("method_not_allowed");
    expect(deductMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const badRequests: Array<[string, Init]> = [
    ["another model", { path: "v1beta/models/gemini-2.5-pro:generateContent" }],
    ["the files API", { path: "v1beta/files" }],
    ["a key query parameter", { search: "?key=x" }],
    [
      "an extra query parameter next to alt=sse",
      {
        path: "v1beta/models/gemini-2.5-flash:streamGenerateContent",
        search: "?alt=sse&key=x",
      },
    ],
  ];
  for (const [label, init] of badRequests) {
    it(`rejects ${label} with 400 unsupported_request`, async () => {
      const res = await onRequest(makeContext(init) as any);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_request");
      expect(deductMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("forwards streamGenerateContent with alt=sse", async () => {
    const sse = 'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n';
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const res = await onRequest(
      makeContext({
        path: "v1beta/models/gemini-2.5-flash:streamGenerateContent",
        search: "?alt=sse",
        headers: { "x-adaptiva-action": "tutor" },
      }) as any,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(sse);
    expect(res.headers.get("x-adaptiva-points")).toBe("95");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as any[])[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    );
  });

  it("rejects a buffered body larger than 1 MiB with 413", async () => {
    const res = await onRequest(
      makeContext({ body: "x".repeat(MAX_BODY + 1) }) as any,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("payload_too_large");
    expect(deductMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a declared content-length larger than 1 MiB with 413", async () => {
    const res = await onRequest(
      makeContext({ headers: { "content-length": String(MAX_BODY + 1) } }) as any,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("payload_too_large");
    expect(deductMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only the allowed headers upstream", async () => {
    const res = await onRequest(
      makeContext({
        headers: {
          cookie: "adaptiva_sess=x",
          authorization: "Bearer y",
          "x-goog-api-key": "dummy",
          "x-goog-api-client": "google-genai-sdk/1.0",
          "x-adaptiva-action": "quiz",
        },
      }) as any,
    );
    expect(res.status).toBe(200);
    const headers = (fetchMock.mock.calls[0] as any[])[1].headers as Headers;
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-adaptiva-action")).toBeNull();
    expect(headers.get("x-goog-api-key")).toBe("test-api-key");
    expect(headers.get("x-goog-api-client")).toBe("google-genai-sdk/1.0");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("advertises only POST and OPTIONS on preflight", async () => {
    const res = await onRequest({
      env: { GEMINI_API_KEY: "test-api-key" },
      params: {},
      request: new Request(ORIGIN, { method: "OPTIONS" }),
    } as any);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });
});
