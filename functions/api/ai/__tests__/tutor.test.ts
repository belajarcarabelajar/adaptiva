import { describe, it, expect } from "bun:test";
import { validateTutorBody, streamTutorText, createTutorSseResponse } from "../_tutor";

// A Messages API SSE stream in the documented event order.
function sseResponse(chunks: string[], stopReason: string): Response {
  const events: any[] = [
    {
      type: "message_start",
      message: {
        id: "msg_tutor",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...chunks.map((text) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    })),
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null },
      usage: { output_tokens: 20 },
    },
    { type: "message_stop" },
  ];
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "request-id": "req_tutor" },
  });
}

function recordingFetch(respond: () => Response) {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = (async (input: any, init?: any) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const rawBody = request ? await request.text() : init?.body;
    calls.push({ url, body: rawBody ? JSON.parse(String(rawBody)) : undefined });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

async function readFrames(response: Response): Promise<any[]> {
  const raw = await response.text();
  return raw
    .split("\n\n")
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      expect(frame.startsWith("data: ")).toBe(true);
      return JSON.parse(frame.slice("data: ".length));
    });
}

describe("validateTutorBody", () => {
  const ok = { system: "Kamu tutor.", messages: [{ role: "user", content: "Halo" }] };

  it("accepts a system prompt and a conversation ending with the user", () => {
    const conversation = {
      system: "Kamu tutor.",
      messages: [
        { role: "user", content: "Apa itu fotosintesis?" },
        { role: "assistant", content: "Proses tumbuhan membuat makanan." },
        { role: "user", content: "Lebih rinci?" },
      ],
    };
    expect(validateTutorBody(conversation)).toEqual(conversation);
  });

  it("returns only system and messages, dropping other fields", () => {
    expect(validateTutorBody({ ...ok, task: "tutor.chat", extra: 1 })).toEqual(ok);
  });

  it("rejects bodies that are not objects", () => {
    expect(validateTutorBody(null)).toBeNull();
    expect(validateTutorBody("x")).toBeNull();
    expect(validateTutorBody([ok])).toBeNull();
  });

  it("rejects an empty or missing system prompt", () => {
    expect(validateTutorBody({ ...ok, system: "" })).toBeNull();
    expect(validateTutorBody({ messages: ok.messages })).toBeNull();
    expect(validateTutorBody({ ...ok, system: 5 })).toBeNull();
  });

  it("rejects zero turns and more than 40 turns", () => {
    expect(validateTutorBody({ ...ok, messages: [] })).toBeNull();
    const turns = Array.from({ length: 41 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `t${i}`,
    }));
    expect(validateTutorBody({ ...ok, messages: turns })).toBeNull();
    expect(validateTutorBody({ ...ok, messages: turns.slice(0, 39) })).not.toBeNull();
  });

  it("rejects a conversation whose last turn is the assistant", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    expect(validateTutorBody({ ...ok, messages })).toBeNull();
  });

  it("rejects unknown roles, empty content and content over 8000 characters", () => {
    expect(validateTutorBody({ ...ok, messages: [{ role: "system", content: "x" }] })).toBeNull();
    expect(validateTutorBody({ ...ok, messages: [{ role: "user", content: "" }] })).toBeNull();
    expect(validateTutorBody({ ...ok, messages: [{ role: "user", content: 7 }] })).toBeNull();
    expect(validateTutorBody({ ...ok, messages: ["Halo"] })).toBeNull();
    expect(
      validateTutorBody({ ...ok, messages: [{ role: "user", content: "a".repeat(8001) }] }),
    ).toBeNull();
    expect(
      validateTutorBody({ ...ok, messages: [{ role: "user", content: "a".repeat(8000) }] }),
    ).not.toBeNull();
  });
});

describe("streamTutorText", () => {
  it("streams Haiku text deltas and reports the stop reason", async () => {
    const { calls, fetchImpl } = recordingFetch(() => sseResponse(["Halo ", "dunia"], "end_turn"));
    const deltas: string[] = [];
    const messages = [{ role: "user" as const, content: "Sapa aku" }];

    const result = await streamTutorText({
      apiKey: "sk-test",
      fetchImpl,
      model: "claude-haiku-5-5",
      effort: "low",
      maxTokens: 2048,
      system: "Kamu tutor.",
      messages,
      onDelta: (text) => deltas.push(text),
    });

    expect(deltas).toEqual(["Halo ", "dunia"]);
    expect(result).toEqual({ stopReason: "end_turn", refusalCategory: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toEndWith("/v1/messages");
    const body = calls[0].body;
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(2048);
    expect(body.system).toBe("Kamu tutor.");
    expect(body.messages).toEqual(messages);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.stream).toBe(true);
    expect("fallbacks" in body).toBe(false);
    expect("temperature" in body).toBe(false);
    expect("thinking" in body).toBe(false);
  });
});

describe("createTutorSseResponse", () => {
  const unusedHook = async () => {
    throw new Error("hook must not be called");
  };

  it("writes one delta frame per chunk and a done frame", async () => {
    const response = createTutorSseResponse(
      async (onDelta) => {
        onDelta("Halo ");
        onDelta('"dunia"\n');
        return { stopReason: "end_turn", refusalCategory: null };
      },
      { onErrorBeforeOutput: unusedHook, headers: { "x-adaptiva-points": "41" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-adaptiva-points")).toBe("41");
    expect(await readFrames(response)).toEqual([
      { type: "delta", text: "Halo " },
      { type: "delta", text: '"dunia"\n' },
      { type: "done" },
    ]);
  });

  it("calls the hook once and emits its error when the run fails before output", async () => {
    const failure = new Error("upstream down");
    const seen: unknown[] = [];
    const response = createTutorSseResponse(
      async () => {
        throw failure;
      },
      {
        onErrorBeforeOutput: async (err) => {
          seen.push(err);
          return { error: "ai_upstream_network_error", message: "Gagal. Poin Anda telah dikembalikan." };
        },
      },
    );

    expect(await readFrames(response)).toEqual([
      {
        type: "error",
        error: "ai_upstream_network_error",
        message: "Gagal. Poin Anda telah dikembalikan.",
      },
    ]);
    expect(seen).toEqual([failure]);
  });

  it("emits ai_generation_failed without the hook when the run fails after output", async () => {
    let hookCalls = 0;
    const response = createTutorSseResponse(
      async (onDelta) => {
        onDelta("Sebagian");
        throw new Error("connection reset");
      },
      {
        onErrorBeforeOutput: async () => {
          hookCalls += 1;
          return { error: "x", message: "y" };
        },
      },
    );

    expect(await readFrames(response)).toEqual([
      { type: "delta", text: "Sebagian" },
      { type: "error", error: "ai_generation_failed", message: "Respons AI terputus." },
    ]);
    expect(hookCalls).toBe(0);
  });

  it("emits ai_generation_blocked naming the category on a refusal", async () => {
    const response = createTutorSseResponse(
      async () => ({ stopReason: "refusal", refusalCategory: "cyber" }),
      { onErrorBeforeOutput: unusedHook },
    );

    const frames = await readFrames(response);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe("error");
    expect(frames[0].error).toBe("ai_generation_blocked");
    expect(frames[0].message).toContain("cyber");
  });
});
