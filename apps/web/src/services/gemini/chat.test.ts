import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startChatSession, sendMessageToTutorStream } from "./chat";
import type { TutorChat } from "../../types";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const APOLOGY = "I'm sorry, I encountered an error trying to respond. Please try again.";

const sseResponse = (pieces: string[], status = 200) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
};

const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentBody = () => JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

describe("startChatSession", () => {
  it("returns an English tutor system prompt and empty history by default", () => {
    const chat = startChatSession("TypeScript");
    expect(chat.history).toEqual([]);
    expect(chat.system).toContain('You are a helpful and patient personal tutor, an expert professor in the topic of "TypeScript".');
    expect(chat.system).not.toContain("Please conduct the tutoring session primarily in");
  });

  it("returns the Bahasa Indonesia system prompt for Bahasa Indonesia", () => {
    const chat = startChatSession("Fisika Kuantum", "Bahasa Indonesia");
    expect(chat.system).toContain('Kamu adalah tutor pribadi yang sabar dan membantu, seorang profesor ahli dalam topik "Fisika Kuantum".');
    expect(chat.system).toContain("Sesi ini akan berlangsung dalam Bahasa Indonesia.");
    expect(chat.history).toEqual([]);
  });

  it("returns the other-language system prompt naming the language", () => {
    const chat = startChatSession("Physics", "Spanish");
    expect(chat.system).toContain("Please conduct the tutoring session primarily in Spanish.");
    expect(chat.system).toContain("If the main topic is learning Spanish itself, then act as a language tutor for Spanish.");
  });
});

describe("sendMessageToTutorStream request", () => {
  it("POSTs task, system and history plus the new user turn to /api/ai with credentials", async () => {
    fetchMock.mockImplementation(async () => sseResponse([frame({ type: "done" })]));
    const chat: TutorChat = {
      system: "sys",
      history: [
        { role: "user", content: "halo" },
        { role: "assistant", content: "hai" },
      ],
    };

    await sendMessageToTutorStream(chat, "apa itu atom?", () => {});

    const [url, init] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.origin).toBe(window.location.origin);
    expect(parsedUrl.pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(sentBody()).toEqual({
      task: "tutor.chat",
      system: "sys",
      messages: [
        { role: "user", content: "halo" },
        { role: "assistant", content: "hai" },
        { role: "user", content: "apa itu atom?" },
      ],
    });
  });

  it("sends at most 40 turns, dropping the oldest pairs so the first turn is a user turn", async () => {
    fetchMock.mockImplementation(async () => sseResponse([frame({ type: "done" })]));
    const history: TutorChat["history"] = [];
    for (let i = 0; i < 25; i++) {
      history.push({ role: "user", content: `u${i}` }, { role: "assistant", content: `a${i}` });
    }

    await sendMessageToTutorStream({ system: "s", history }, "baru", () => {});

    const messages = sentBody().messages as { role: string; content: string }[];
    expect(messages.length).toBe(39);
    expect(messages[0]).toEqual({ role: "user", content: "u6" });
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "baru" });
  });
});

describe("sendMessageToTutorStream response", () => {
  it("calls onChunk per delta even when frames are split across reads", async () => {
    const all = frame({ type: "delta", text: "Halo " }) + frame({ type: "delta", text: "dunia" }) + frame({ type: "done" });
    const pieces = [all.slice(0, 7), all.slice(7, 30), all.slice(30, 41), all.slice(41)];
    fetchMock.mockImplementation(async () => sseResponse(pieces));

    const chunks: string[] = [];
    await sendMessageToTutorStream({ system: "s", history: [] }, "hi", (t) => chunks.push(t));

    expect(chunks).toEqual(["Halo", "dunia"]);
  });

  it("appends the user turn and the raw concatenated assistant text after done", async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse([frame({ type: "delta", text: "Atom adalah " }), frame({ type: "delta", text: "partikel." }), frame({ type: "done" })]),
    );
    const chat: TutorChat = { system: "s", history: [] };

    await sendMessageToTutorStream(chat, "apa itu atom?", () => {});

    expect(chat.history).toEqual([
      { role: "user", content: "apa itu atom?" },
      { role: "assistant", content: "Atom adalah partikel." },
    ]);
  });

  it("sends the apology and keeps history unchanged on an error frame", async () => {
    fetchMock.mockImplementation(async () =>
      sseResponse([frame({ type: "delta", text: "Sebagian" }), frame({ type: "error", error: "ai_generation_failed", message: "x" })]),
    );
    const chat: TutorChat = { system: "s", history: [] };

    const chunks: string[] = [];
    await sendMessageToTutorStream(chat, "hi", (t) => chunks.push(t));

    expect(chunks[chunks.length - 1]).toBe(APOLOGY);
    expect(chat.history).toEqual([]);
  });

  it("sends the apology and keeps history unchanged on a non-2xx response", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "insufficient_points", message: "x" }), { status: 429 }),
    );
    const chat: TutorChat = { system: "s", history: [] };

    const chunks: string[] = [];
    await sendMessageToTutorStream(chat, "hi", (t) => chunks.push(t));

    expect(chunks).toEqual([APOLOGY]);
    expect(chat.history).toEqual([]);
  });

  it("sends the apology without rethrowing when fetch rejects", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    const chat: TutorChat = { system: "s", history: [] };

    const chunks: string[] = [];
    await expect(sendMessageToTutorStream(chat, "hi", (t) => chunks.push(t))).resolves.toBeUndefined();

    expect(chunks).toEqual([APOLOGY]);
    expect(chat.history).toEqual([]);
  });
});
