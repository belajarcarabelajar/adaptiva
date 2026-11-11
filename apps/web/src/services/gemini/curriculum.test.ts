import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateInitialCurriculumOutline, generateModuleLectureSummary, generateSevenDayPlan } from "./curriculum";

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

// Wire text as the server returns it: valid JSON, inner quotes escaped, keys deliberately out of order.
// The quoted phrases are the four from the production failure (debug/2026-11-12-plan-7-hari-json-kutip-rca.md).
const QUOTED_PLAN_TEXT = String.raw`{
  "day2": {"task": "- Baca ringkasan \"Analisis Kebutuhan\"\n- Tulis tiga pertanyaan", "summaryFocus": "Analisis Kebutuhan"},
  "day1": {"task": "- Dengarkan \"Pengantar Edutech\" sambil mencatat\n- Buat peta konsep", "summaryFocus": "Pengantar Edutech"},
  "day3": {"task": "- Rancang modul \"cara membuat kopi\" sebagai studi kasus", "summaryFocus": "Modul 3: Desain Pembelajaran"},
  "day4": {"task": "- Ulangi \"Pengantar Teknologi Pendidikan\" dengan kartu kilat", "summaryFocus": "Pengantar Teknologi Pendidikan"},
  "day5": {"task": "- Praktik evaluasi", "summaryFocus": "Evaluasi"},
  "day6": {"task": "- Proyek mini", "summaryFocus": "Proyek"},
  "day7": {"task": "- Review mingguan", "summaryFocus": "Review"}
}`;

describe("generateSevenDayPlan", () => {
  it("asks /api/ai for task curriculum.sevenDayPlan with a prompt and no model, effort or schema", async () => {
    serverReplies(QUOTED_PLAN_TEXT);

    await generateSevenDayPlan("Edutech", "Silabus", ["Pengantar Edutech", "Analisis Kebutuhan"], "Bahasa Indonesia");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    const body = sentBody();
    expect(body.task).toBe("curriculum.sevenDayPlan");
    expect(typeof body.prompt).toBe("string");
    expect(Object.keys(body).sort()).toEqual(["prompt", "task"]);
  });

  it("describes the day1..day7 object shape in the prompt instead of a days array", async () => {
    serverReplies(QUOTED_PLAN_TEXT);

    await generateSevenDayPlan("Edutech", "Silabus", ["A"], "English");

    const prompt = String(sentBody().prompt);
    for (const key of ["day1", "day2", "day3", "day4", "day5", "day6", "day7"]) {
      expect(prompt).toContain(`"${key}": {"task": `);
    }
    expect(prompt).not.toContain('"days"');
  });

  it("returns 7 days numbered 1..7 in order with the quoted phrases preserved", async () => {
    serverReplies(QUOTED_PLAN_TEXT);

    const plan = await generateSevenDayPlan("Edutech", "Silabus", ["Pengantar Edutech"], "Bahasa Indonesia");

    expect(plan).toEqual({
      topic: "Edutech",
      days: [
        { day: 1, task: '- Dengarkan "Pengantar Edutech" sambil mencatat\n- Buat peta konsep', summaryFocus: "Pengantar Edutech" },
        { day: 2, task: '- Baca ringkasan "Analisis Kebutuhan"\n- Tulis tiga pertanyaan', summaryFocus: "Analisis Kebutuhan" },
        { day: 3, task: '- Rancang modul "cara membuat kopi" sebagai studi kasus', summaryFocus: "Desain Pembelajaran" },
        {
          day: 4,
          task: '- Ulangi "Pengantar Teknologi Pendidikan" dengan kartu kilat',
          summaryFocus: "Pengantar Teknologi Pendidikan",
        },
        { day: 5, task: "- Praktik evaluasi", summaryFocus: "Evaluasi" },
        { day: 6, task: "- Proyek mini", summaryFocus: "Proyek" },
        { day: 7, task: "- Review mingguan", summaryFocus: "Review" },
      ],
    });
  });

  it("returns null when day7 is missing", async () => {
    const withoutDay7 = JSON.parse(QUOTED_PLAN_TEXT) as Record<string, unknown>;
    delete withoutDay7.day7;
    serverReplies(JSON.stringify(withoutDay7));

    await expect(generateSevenDayPlan("Edutech", "Silabus", ["A"], "English")).resolves.toBeNull();
  });

  it("returns null when a day has no string summaryFocus", async () => {
    const broken = JSON.parse(QUOTED_PLAN_TEXT) as Record<string, Record<string, unknown>>;
    broken.day4 = { task: "- ada tugas" };
    serverReplies(JSON.stringify(broken));

    await expect(generateSevenDayPlan("Edutech", "Silabus", ["A"], "English")).resolves.toBeNull();
  });

  it("returns null for the old days[] shape", async () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, task: "- t", summaryFocus: "f" }));
    serverReplies(JSON.stringify({ days }));

    await expect(generateSevenDayPlan("Edutech", "Silabus", ["A"], "English")).resolves.toBeNull();
  });
});

describe("generateInitialCurriculumOutline", () => {
  it("asks for task curriculum.outline and returns cleaned modules", async () => {
    serverReplies(JSON.stringify({ syllabus: "## My Syllabus", moduleTitles: ["Modul 1: Dasar", "Lanjutan"] }));

    const result = await generateInitialCurriculumOutline("React");

    expect(sentBody().task).toBe("curriculum.outline");
    expect(Object.keys(sentBody()).sort()).toEqual(["prompt", "task"]);
    expect(result).toEqual({
      topic: "React",
      syllabus: "## My Syllabus",
      modules: [
        { title: "Dasar", moduleMaterial: undefined, isLoading: false, loadingError: null },
        { title: "Lanjutan", moduleMaterial: undefined, isLoading: false, loadingError: null },
      ],
    });
  });

  it("parses JSON wrapped in markdown fences with a trailing comma", async () => {
    serverReplies('Here:\n```json\n{\n  "syllabus": "## Intro",\n  "moduleTitles": ["Modul 1", "Modul 2",]\n}\n```\nDone');

    const result = await generateInitialCurriculumOutline("Digital Marketing");

    expect(result?.modules).toHaveLength(2);
  });

  it("returns null when the text is not JSON", async () => {
    serverReplies("not json");

    await expect(generateInitialCurriculumOutline("React")).resolves.toBeNull();
  });

  it("returns null when syllabus is missing", async () => {
    serverReplies(JSON.stringify({ moduleTitles: ["M1"] }));

    await expect(generateInitialCurriculumOutline("Topic", "English")).resolves.toBeNull();
  });

  it("rethrows a mapped server error without retrying", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    await expect(generateInitialCurriculumOutline("React")).rejects.toThrow(
      "unauthorized: Sign in required to use AI features.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("generateModuleLectureSummary", () => {
  it("asks for task module.summary and returns the material", async () => {
    serverReplies(JSON.stringify({ moduleMaterial: "## Comprehensive Module Material" }));

    const result = await generateModuleLectureSummary("Generics", "TypeScript", "English");

    expect(sentBody().task).toBe("module.summary");
    expect(Object.keys(sentBody()).sort()).toEqual(["prompt", "task"]);
    expect(result).toEqual({ moduleMaterial: "## Comprehensive Module Material" });
  });

  it("returns null when moduleMaterial is missing", async () => {
    serverReplies(JSON.stringify({ other: "x" }));

    await expect(generateModuleLectureSummary("Kosong", "TypeScript", "English")).resolves.toBeNull();
  });

  it("serves a second identical call from the cache without fetching", async () => {
    serverReplies(JSON.stringify({ moduleMaterial: "Cached material content here" }));

    const first = await generateModuleLectureSummary("Cached Module", "Topic", "English");
    fetchMock.mockClear();
    const second = await generateModuleLectureSummary("Cached Module", "Topic", "English");

    expect(first?.moduleMaterial).toBe("Cached material content here");
    expect(second?.moduleMaterial).toBe("Cached material content here");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evicts the oldest entry after 50 cached summaries", async () => {
    serverReplies(JSON.stringify({ moduleMaterial: "Content" }));
    for (let i = 0; i <= 50; i++) {
      await generateModuleLectureSummary(`Evict ${i}`, "Eviction Topic", "English");
    }

    fetchMock.mockClear();
    await generateModuleLectureSummary("Evict 0", "Eviction Topic", "English");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await generateModuleLectureSummary("Evict 50", "Eviction Topic", "English");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
