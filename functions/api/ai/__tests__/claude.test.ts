import { describe, it, expect } from "bun:test";
import { createClaudeGateway, classifyGatewayError } from "../_claude";
import { resolveTask } from "../_tasks";

type Recorded = { url: string; headers: Headers; body: any };

type Block =
  | { type: "thinking"; thinking: string }
  | { type: "text"; chunks: string[] };

// A Messages API SSE stream in the documented event order.
function sseResponse(opts: {
  model: string;
  blocks: Block[];
  stopReason: string;
  stopDetails?: unknown;
}): Response {
  const events: any[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: opts.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
  ];
  opts.blocks.forEach((block, index) => {
    if (block.type === "thinking") {
      events.push(
        { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } },
        { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } },
        { type: "content_block_delta", index, delta: { type: "signature_delta", signature: "sig-test" } },
        { type: "content_block_stop", index },
      );
    } else {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      for (const chunk of block.chunks) {
        events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: chunk } });
      }
      events.push({ type: "content_block_stop", index });
    }
  });
  events.push(
    {
      type: "message_delta",
      delta: {
        stop_reason: opts.stopReason,
        stop_sequence: null,
        stop_details: opts.stopDetails ?? null,
      },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  );
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "request-id": "req_test" },
  });
}

function recordingFetch(respond: () => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: any, init?: any) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const headers = new Headers(request ? request.headers : init?.headers);
    const rawBody = request ? await request.text() : init?.body;
    calls.push({ url, headers, body: rawBody ? JSON.parse(String(rawBody)) : undefined });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const PLAN_JSON = JSON.stringify({ day1: { task: "Baca", summaryFocus: "Inti" } });

describe("Claude gateway request shape", () => {
  it("sends a Sonnet task with effort, json_schema format and the server-side fallback", async () => {
    const spec = resolveTask("curriculum.sevenDayPlan")!;
    const { calls, fetchImpl } = recordingFetch(() =>
      sseResponse({
        model: "claude-sonnet-5-5",
        blocks: [{ type: "text", chunks: [PLAN_JSON] }],
        stopReason: "end_turn",
      }),
    );
    const gateway = createClaudeGateway("sk-test", fetchImpl);

    await gateway.complete(spec, { prompt: "Buat rencana 7 hari", system: "Kamu tutor." });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(new URL(call.url).pathname).toBe("/v1/messages");
    // SDK 1.3.0 sends the API key as a bearer token (client.js apiKeyAuth).
    expect(call.headers.get("authorization")).toBe("Bearer sk-test");
    expect(call.body.model).toBe("claude-sonnet-5-5");
    expect(call.body.max_tokens).toBe(16384);
    expect(call.body.stream).toBe(true);
    expect(call.body.output_config.effort).toBe("medium");
    expect(call.body.output_config.format).toEqual({ type: "json_schema", schema: spec.schema });
    expect(call.body.messages).toEqual([{ role: "user", content: "Buat rencana 7 hari" }]);
    expect(call.body.system).toBe("Kamu tutor.");
    expect(call.body.fallbacks).toBe("default");
    expect(call.headers.get("anthropic-beta") ?? "").toContain("server-side-fallback-2026-07-01");
    for (const key of ["temperature", "top_p", "top_k", "thinking", "betas"]) {
      expect(Object.hasOwn(call.body, key)).toBe(false);
    }
  });

  it("sends a Haiku task without fallbacks, beta header or sampling parameters", async () => {
    const spec = resolveTask("flashcard.cards")!;
    const { calls, fetchImpl } = recordingFetch(() =>
      sseResponse({
        model: "claude-haiku-5-5",
        blocks: [{ type: "text", chunks: ['{"flashcards":[]}'] }],
        stopReason: "end_turn",
      }),
    );
    const gateway = createClaudeGateway("sk-test", fetchImpl);

    await gateway.complete(spec, { prompt: "Kartu" });

    const call = calls[0];
    expect(new URL(call.url).pathname).toBe("/v1/messages");
    expect(call.body.model).toBe("claude-haiku-5-5");
    expect(call.body.max_tokens).toBe(16384);
    expect(call.body.output_config.effort).toBe("low");
    expect(call.body.output_config.format).toEqual({ type: "json_schema", schema: spec.schema });
    expect(Object.hasOwn(call.body, "fallbacks")).toBe(false);
    expect(Object.hasOwn(call.body, "system")).toBe(false);
    expect(call.headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
    for (const key of ["temperature", "top_p", "top_k", "thinking", "betas"]) {
      expect(Object.hasOwn(call.body, key)).toBe(false);
    }
  });
});

describe("Claude gateway result", () => {
  it("reads the text block that follows a thinking block", async () => {
    const { fetchImpl } = recordingFetch(() =>
      sseResponse({
        model: "claude-sonnet-5-5",
        blocks: [
          { type: "thinking", thinking: "Rencanakan tujuh hari." },
          { type: "text", chunks: ['{"syllabus":"S",', '"moduleTitles":["A"]}'] },
        ],
        stopReason: "end_turn",
      }),
    );
    const gateway = createClaudeGateway("sk-test", fetchImpl);

    const result = await gateway.complete(resolveTask("curriculum.outline")!, { prompt: "x" });

    expect(result.text).toBe('{"syllabus":"S","moduleTitles":["A"]}');
    expect(result.stopReason).toBe("end_turn");
    expect(result.refusalCategory ?? null).toBeNull();
  });

  for (const [label, taskId, model] of [
    ["Sonnet", "module.summary", "claude-sonnet-5-5"],
    ["Haiku", "quiz.questions", "claude-haiku-5-5"],
  ] as const) {
    it(`surfaces a ${label} refusal with its category`, async () => {
      const { fetchImpl } = recordingFetch(() =>
        sseResponse({
          model,
          blocks: [{ type: "text", chunks: ["Maaf, saya tidak bisa membantu."] }],
          stopReason: "refusal",
          stopDetails: { type: "refusal", category: "cyber", explanation: null },
        }),
      );
      const gateway = createClaudeGateway("sk-test", fetchImpl);

      const result = await gateway.complete(resolveTask(taskId)!, { prompt: "x" });

      expect(result.stopReason).toBe("refusal");
      expect(result.refusalCategory).toBe("cyber");
    });

    it(`returns truncated ${label} text as is on max_tokens`, async () => {
      const { fetchImpl } = recordingFetch(() =>
        sseResponse({
          model,
          blocks: [{ type: "text", chunks: ['{"questions":[{"quest'] }],
          stopReason: "max_tokens",
        }),
      );
      const gateway = createClaudeGateway("sk-test", fetchImpl);

      const result = await gateway.complete(resolveTask(taskId)!, { prompt: "x" });

      expect(result.text).toBe('{"questions":[{"quest');
      expect(result.stopReason).toBe("max_tokens");
    });
  }
});

describe("classifyGatewayError", () => {
  it("classifies an API error response as api with its status and message", async () => {
    const { fetchImpl } = recordingFetch(
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "invalid_request_error", message: "schema is too complex" },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );
    const gateway = createClaudeGateway("sk-test", fetchImpl);

    const err = await gateway
      .complete(resolveTask("exam.questions")!, { prompt: "x" })
      .then(() => null, (e: unknown) => e);

    expect(classifyGatewayError(err)).toEqual({
      kind: "api",
      status: 400,
      detail: "schema is too complex",
    });
  });

  it("classifies a fetch that keeps failing as network", async () => {
    const { calls, fetchImpl } = recordingFetch(() => {
      throw new TypeError("fetch failed");
    });
    const gateway = createClaudeGateway("sk-test", fetchImpl);

    const err = await gateway
      .complete(resolveTask("quiz.explanation")!, { prompt: "x" })
      .then(() => null, (e: unknown) => e);

    expect(classifyGatewayError(err).kind).toBe("network");
    // The SDK's own retries (maxRetries 2) are the only retries.
    expect(calls).toHaveLength(3);
  }, 15000);

  it("classifies anything else as unexpected", () => {
    expect(classifyGatewayError(new Error("boom")).kind).toBe("unexpected");
    expect(classifyGatewayError("boom").kind).toBe("unexpected");
  });
});
