import { describe, it, expect } from "bun:test";
import { runResourceSearch } from "../_search";

type Recorded = { url: string; headers: Headers; body: any };

type Block =
  | { type: "search"; id: string; query: string; results: { url: string; title: string }[] | { error_code: string } }
  | { type: "text"; chunks: string[] };

// A Messages API SSE stream; server tool blocks arrive whole in content_block_start.
function sseResponse(opts: { blocks: Block[]; stopReason: string; stopDetails?: unknown }): Response {
  const events: any[] = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 12, output_tokens: 1 },
      },
    },
  ];
  let index = 0;
  for (const block of opts.blocks) {
    if (block.type === "search") {
      events.push(
        {
          type: "content_block_start",
          index,
          content_block: { type: "server_tool_use", id: block.id, name: "web_search", input: { query: block.query } },
        },
        { type: "content_block_stop", index },
      );
      index += 1;
      const content = Array.isArray(block.results)
        ? block.results.map((r) => ({
            type: "web_search_result",
            url: r.url,
            title: r.title,
            encrypted_content: "enc",
            page_age: null,
          }))
        : { type: "web_search_tool_result_error", error_code: block.results.error_code };
      events.push(
        {
          type: "content_block_start",
          index,
          content_block: { type: "web_search_tool_result", tool_use_id: block.id, content },
        },
        { type: "content_block_stop", index },
      );
      index += 1;
    } else {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "", citations: null } });
      for (const chunk of block.chunks) {
        events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: chunk } });
      }
      events.push({ type: "content_block_stop", index });
      index += 1;
    }
  }
  events.push(
    {
      type: "message_delta",
      delta: { stop_reason: opts.stopReason, stop_sequence: null, stop_details: opts.stopDetails ?? null },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  );
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "request-id": "req_test" },
  });
}

function queuedFetch(responses: (() => Response)[]) {
  const calls: Recorded[] = [];
  let next = 0;
  const fetchImpl = (async (input: any, init?: any) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const headers = new Headers(request ? request.headers : init?.headers);
    const rawBody = request ? await request.text() : init?.body;
    calls.push({ url, headers, body: rawBody ? JSON.parse(String(rawBody)) : undefined });
    const respond = responses[Math.min(next, responses.length - 1)];
    next += 1;
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const BASE = {
  apiKey: "sk-test",
  model: "claude-sonnet-5-5",
  effort: "medium" as const,
  maxTokens: 4096,
  prompt: "Cari sumber belajar fotosintesis",
};

describe("runResourceSearch request", () => {
  it("sends Sonnet with web_search, the default server fallback and no output format", async () => {
    const { calls, fetchImpl } = queuedFetch([
      () => sseResponse({ blocks: [{ type: "text", chunks: ["Halo"] }], stopReason: "end_turn" }),
    ]);

    await runResourceSearch({ ...BASE, fetchImpl });

    expect(calls).toHaveLength(1);
    const { body, headers, url } = calls[0];
    expect(new URL(url).pathname).toBe("/v1/messages");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(4096);
    expect(body.stream).toBe(true);
    expect(body.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta") ?? "").toContain("server-side-fallback-2026-07-01");
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(body.output_config.format).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.messages).toEqual([{ role: "user", content: "Cari sumber belajar fotosintesis" }]);
  });
});

describe("runResourceSearch result", () => {
  it("joins text blocks and de-duplicates sources by url in order", async () => {
    const { fetchImpl } = queuedFetch([
      () =>
        sseResponse({
          blocks: [
            {
              type: "search",
              id: "srvtoolu_1",
              query: "fotosintesis",
              results: [
                { url: "https://a.example/1", title: "A1" },
                { url: "https://b.example/2", title: "B2" },
              ],
            },
            { type: "text", chunks: ["Bagian ", "pertama. "] },
            {
              type: "search",
              id: "srvtoolu_2",
              query: "fotosintesis video",
              results: [
                { url: "https://b.example/2", title: "B2 again" },
                { url: "https://c.example/3", title: "C3" },
              ],
            },
            { type: "text", chunks: ["Bagian kedua."] },
          ],
          stopReason: "end_turn",
        }),
    ]);

    const result = await runResourceSearch({ ...BASE, fetchImpl });

    expect(result.text).toBe("Bagian pertama. Bagian kedua.");
    expect(result.sources).toEqual([
      { url: "https://a.example/1", title: "A1" },
      { url: "https://b.example/2", title: "B2" },
      { url: "https://c.example/3", title: "C3" },
    ]);
    expect(result.stopReason).toBe("end_turn");
    expect(result.refusalCategory).toBeNull();
  });

  it("returns the text with no sources when the search result is an error", async () => {
    const { fetchImpl } = queuedFetch([
      () =>
        sseResponse({
          blocks: [
            { type: "search", id: "srvtoolu_1", query: "x", results: { error_code: "max_uses_exceeded" } },
            { type: "text", chunks: ["Tanpa pencarian."] },
          ],
          stopReason: "end_turn",
        }),
    ]);

    const result = await runResourceSearch({ ...BASE, fetchImpl });

    expect(result.text).toBe("Tanpa pencarian.");
    expect(result.sources).toEqual([]);
  });

  it("surfaces a refusal stop reason and its category", async () => {
    const { fetchImpl } = queuedFetch([
      () =>
        sseResponse({
          blocks: [],
          stopReason: "refusal",
          stopDetails: { type: "refusal", category: "cyber", explanation: null },
        }),
    ]);

    const result = await runResourceSearch({ ...BASE, fetchImpl });

    expect(result.stopReason).toBe("refusal");
    expect(result.refusalCategory).toBe("cyber");
    expect(result.text).toBe("");
  });
});

describe("runResourceSearch pause_turn", () => {
  it("resumes once with the paused assistant content and collects sources from both turns", async () => {
    const { calls, fetchImpl } = queuedFetch([
      () =>
        sseResponse({
          blocks: [
            {
              type: "search",
              id: "srvtoolu_1",
              query: "q1",
              results: [{ url: "https://a.example/1", title: "A1" }],
            },
          ],
          stopReason: "pause_turn",
        }),
      () =>
        sseResponse({
          blocks: [
            {
              type: "search",
              id: "srvtoolu_2",
              query: "q2",
              results: [{ url: "https://b.example/2", title: "B2" }],
            },
            { type: "text", chunks: ["Selesai."] },
          ],
          stopReason: "end_turn",
        }),
    ]);

    const result = await runResourceSearch({ ...BASE, fetchImpl });

    expect(calls).toHaveLength(2);
    const second = calls[1].body.messages;
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual({ role: "user", content: "Cari sumber belajar fotosintesis" });
    expect(second[1].role).toBe("assistant");
    expect(second[1].content.map((b: any) => b.type)).toEqual(["server_tool_use", "web_search_tool_result"]);
    expect(second[1].content[0].id).toBe("srvtoolu_1");
    expect(second[1].content[1].content[0].url).toBe("https://a.example/1");
    expect(calls[1].body.messages.filter((m: any) => m.role === "user")).toHaveLength(1);
    expect(result.text).toBe("Selesai.");
    expect(result.sources).toEqual([
      { url: "https://a.example/1", title: "A1" },
      { url: "https://b.example/2", title: "B2" },
    ]);
    expect(result.stopReason).toBe("end_turn");
  });

  it("stops after two continuations when every turn pauses", async () => {
    const { calls, fetchImpl } = queuedFetch([
      () =>
        sseResponse({
          blocks: [{ type: "search", id: "srvtoolu_1", query: "q", results: [] }],
          stopReason: "pause_turn",
        }),
    ]);

    const result = await runResourceSearch({ ...BASE, fetchImpl });

    expect(calls).toHaveLength(3);
    expect(result.stopReason).toBe("pause_turn");
  });
});
