import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLearningResources } from "./resources";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const serverReplies = (payload: unknown, status = 200) =>
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
  );

const sentBody = (call = 0) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLearningResources", () => {
  it("asks /api/ai for task resources.search with credentials, a prompt and no model", async () => {
    serverReplies({ text: "## Buku\n- Clean Code", sources: [] });

    await fetchLearningResources("React", "English");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    const body = sentBody();
    expect(body.task).toBe("resources.search");
    expect(typeof body.prompt).toBe("string");
    expect(Object.keys(body).sort()).toEqual(["prompt", "task"]);
  });

  it("keeps the no-URL rule in the prompt and drops the Google Search sentence", async () => {
    serverReplies({ text: "## Books", sources: [] });

    await fetchLearningResources("React", "English");

    const prompt = String(sentBody().prompt);
    expect(prompt).toContain("You are strictly forbidden from including any URLs or hyperlinks.");
    expect(prompt).not.toContain("Google Search");
  });

  it("maps server sources to web uri/title and drops entries missing url or title", async () => {
    serverReplies({
      text: "## Books\n- Eloquent JavaScript",
      sources: [
        { url: "https://react.dev/learn", title: "Quick Start" },
        { url: "", title: "No URL" },
        { url: "https://example.com/untitled", title: "" },
        { url: "https://eloquentjavascript.net/", title: "Eloquent JavaScript" },
      ],
    });

    const result = await fetchLearningResources("React");

    expect(result).toEqual({
      content: "## Books\n- Eloquent JavaScript",
      sources: [
        { web: { uri: "https://react.dev/learn", title: "Quick Start" } },
        { web: { uri: "https://eloquentjavascript.net/", title: "Eloquent JavaScript" } },
      ],
    });
  });

  it("returns content with empty sources when the server sends no sources field", async () => {
    serverReplies({ text: "## Buku" });

    expect(await fetchLearningResources("React")).toEqual({ content: "## Buku", sources: [] });
  });

  it("returns null when the server text is empty", async () => {
    serverReplies({ text: "", sources: [{ url: "https://react.dev", title: "React" }] });

    expect(await fetchLearningResources("React")).toBeNull();
  });

  it("rethrows a 401 as the mapped unauthorized error after one request, with no fallback request", async () => {
    serverReplies({ error: "unauthorized", message: "Sign in required." }, 401);

    await expect(fetchLearningResources("React")).rejects.toThrow("unauthorized: Sign in required to use AI features.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows ai_generation_failed without a second fallback request", async () => {
    serverReplies({ error: "ai_generation_failed", message: "Poin dikembalikan." }, 502);

    await expect(fetchLearningResources("React")).rejects.toThrow("ai_generation_failed: Poin dikembalikan.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
