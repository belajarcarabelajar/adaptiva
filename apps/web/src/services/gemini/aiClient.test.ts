import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAiTask, callWithRetries } from "./core";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("callAiTask request", () => {
  it("POSTs task, prompt and system as JSON to /api/ai on the page origin with credentials", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { text: "hasil" }));

    await callAiTask("curriculum.outline", { prompt: "buat silabus", system: "kamu dosen" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.origin).toBe(window.location.origin);
    expect(parsedUrl.pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      task: "curriculum.outline",
      prompt: "buat silabus",
      system: "kamu dosen",
    });
  });

  it("sends only task and prompt when no system is given", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { text: "x" }));

    await callAiTask("module.summary", { prompt: "materi" });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      task: "module.summary",
      prompt: "materi",
    });
  });
});

describe("callAiTask response", () => {
  it("returns the text field of a 200 response", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { text: '{"moduleMaterial":"isi"}' }));

    await expect(callAiTask("module.summary", { prompt: "p" })).resolves.toBe('{"moduleMaterial":"isi"}');
  });

  const errorCases: { name: string; response: () => Response; expected: string }[] = [
    {
      name: "401 unauthorized",
      response: () => jsonResponse(401, { error: "unauthorized", message: "Sign in required." }),
      expected: "401 unauthorized: Sign in required.",
    },
    {
      name: "429 insufficient_points",
      response: () => jsonResponse(429, { error: "insufficient_points", message: "Poin tidak cukup." }),
      expected: "429 insufficient_points: Poin tidak cukup.",
    },
    {
      name: "400 ai_generation_failed",
      response: () =>
        jsonResponse(400, { error: "ai_generation_failed", message: "Layanan AI sedang sibuk. Poin Anda telah dikembalikan." }),
      expected: "400 ai_generation_failed: Layanan AI sedang sibuk. Poin Anda telah dikembalikan.",
    },
    {
      name: "400 ai_generation_blocked",
      response: () => jsonResponse(400, { error: "ai_generation_blocked", message: "Konten ditolak: kategori kebijakan." }),
      expected: "400 ai_generation_blocked: Konten ditolak: kategori kebijakan.",
    },
    {
      name: "400 ai_upstream_network_error",
      response: () =>
        jsonResponse(400, { error: "ai_upstream_network_error", message: "Gagal terhubung. Poin Anda telah dikembalikan." }),
      expected: "400 ai_upstream_network_error: Gagal terhubung. Poin Anda telah dikembalikan.",
    },
    {
      name: "400 without a message",
      response: () => jsonResponse(400, { error: "unknown_task" }),
      expected: "400 unknown_task: ",
    },
    {
      name: "502 with a non-JSON body",
      response: () => new Response("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" }),
      expected: "502 Bad Gateway: ",
    },
  ];

  it.each(errorCases)("throws '<status> <error>: <message>' for $name", async ({ response, expected }) => {
    fetchMock.mockImplementation(async () => response());

    const error = await callAiTask("curriculum.outline", { prompt: "p" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(expected);
  });
});

describe("callWithRetries over callAiTask", () => {
  const mappedCases: { name: string; response: () => Response; expected: string }[] = [
    {
      name: "401",
      response: () => jsonResponse(401, { error: "unauthorized" }),
      expected: "unauthorized: Sign in required to use AI features.",
    },
    {
      name: "429",
      response: () => jsonResponse(429, { error: "insufficient_points", message: "x" }),
      expected: "insufficient_points: Poin Anda tidak cukup untuk melakukan aksi ini.",
    },
    {
      name: "ai_generation_failed",
      response: () =>
        jsonResponse(400, { error: "ai_generation_failed", message: "Layanan AI sedang sibuk. Poin Anda telah dikembalikan." }),
      expected: "ai_generation_failed: Layanan AI sedang sibuk. Poin Anda telah dikembalikan.",
    },
    {
      name: "ai_generation_blocked",
      response: () => jsonResponse(400, { error: "ai_generation_blocked", message: "Konten ditolak." }),
      expected: "ai_generation_blocked: Konten ditolak.",
    },
    {
      name: "ai_upstream_network_error",
      response: () =>
        jsonResponse(400, { error: "ai_upstream_network_error", message: "Poin Anda gagal dikembalikan, silakan hubungi admin." }),
      expected: "ai_upstream_network_error: Poin Anda gagal dikembalikan, silakan hubungi admin.",
    },
  ];

  it.each(mappedCases)("maps $name once, without retrying", async ({ response, expected }) => {
    fetchMock.mockImplementation(async () => response());

    await expect(callWithRetries(() => callAiTask("curriculum.outline", { prompt: "p" }), "t")).rejects.toThrow(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 502 three times and rethrows the original error", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("oops", { status: 502, statusText: "Bad Gateway" }));

    const outcome = callWithRetries(() => callAiTask("curriculum.outline", { prompt: "p" }), "t").then(
      () => null,
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();

    expect(((await outcome) as Error).message).toBe("502 Bad Gateway: ");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
