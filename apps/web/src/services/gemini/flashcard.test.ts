import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateFlashcardsFromMaterial } from "./flashcard";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const serverReplies = (text: string) =>
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ text }), { status: 200, headers: { "content-type": "application/json" } }),
  );

const sentBody = (call = 0) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Wire text as the server returns it: valid JSON with inner quotes escaped.
const QUOTED_FLASHCARDS_TEXT = String.raw`{
  "flashcards": [
    {"term": "JSX", "definition": "Sintaks \"mirip HTML\" di JavaScript"},
    {"term": "\"Props\"", "definition": "Input komponen"}
  ]
}`;

describe("generateFlashcardsFromMaterial", () => {
  it("asks /api/ai for task flashcard.cards with a prompt and no model or schema", async () => {
    serverReplies(QUOTED_FLASHCARDS_TEXT);

    await generateFlashcardsFromMaterial("React", "Materi React", "English", 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(sentBody().task).toBe("flashcard.cards");
    expect(typeof sentBody().prompt).toBe("string");
    expect(Object.keys(sentBody()).sort()).toEqual(["prompt", "task"]);
  });

  it("returns the flashcards with quoted phrases intact", async () => {
    serverReplies(QUOTED_FLASHCARDS_TEXT);

    const result = await generateFlashcardsFromMaterial("React", "Materi React", "Bahasa Indonesia");

    expect(result).toEqual([
      { term: "JSX", definition: 'Sintaks "mirip HTML" di JavaScript' },
      { term: '"Props"', definition: "Input komponen" },
    ]);
  });

  it("returns null when flashcards is missing", async () => {
    serverReplies(JSON.stringify({ invalid: true }));

    await expect(generateFlashcardsFromMaterial("React", "Materi React", "English")).resolves.toBeNull();
  });

  it("returns null without fetching when the material is empty or whitespace", async () => {
    await expect(generateFlashcardsFromMaterial("React", "")).resolves.toBeNull();
    await expect(generateFlashcardsFromMaterial("React", "   \n \t  ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows insufficient points without retrying", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "insufficient_points", message: "Poin tidak cukup." }), { status: 429 }),
    );

    await expect(generateFlashcardsFromMaterial("React", "Materi React", "English")).rejects.toThrow(
      "insufficient_points: Poin Anda tidak cukup untuk melakukan aksi ini.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
