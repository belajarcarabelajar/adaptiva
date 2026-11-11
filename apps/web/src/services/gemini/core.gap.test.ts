import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanAiOutput, parseGeminiJsonResponse, cleanModuleTitle, callWithRetries } from "./core";

describe("cleanAiOutput", () => {
  const cases: { name: string; input: string; expected: string }[] = [
    { name: "returns empty string unchanged", input: "", expected: "" },
    { name: "replaces spaced em dash with a comma", input: "A \u2014 B", expected: "A, B" },
    { name: "replaces unspaced em dash with a comma", input: "A\u2014B", expected: "A, B" },
    { name: "replaces en dash with a comma", input: "A \u2013 B", expected: "A, B" },
    { name: "replaces spaced double hyphen with a comma", input: "A -- B", expected: "A, B" },
    { name: "keeps double hyphen without surrounding spaces", input: "A--B", expected: "A--B" },
    { name: "strips emoji and trims the result", input: "Selamat \u{1F389}", expected: "Selamat" },
    { name: "unwraps bold-italic triple asterisks", input: "***tebal miring***", expected: "tebal miring" },
    { name: "unwraps bold double asterisks", input: "Ini **penting** ya", expected: "Ini penting ya" },
    { name: "unwraps single-asterisk italics inside a sentence", input: "Ini *miring* ya", expected: "Ini miring ya" },
    { name: "unwraps single-asterisk italics at the start", input: "*miring* teks", expected: "miring teks" },
    { name: "keeps spaced asterisks such as multiplication", input: "2 * 3 * 4", expected: "2 * 3 * 4" },
    { name: "keeps markdown list bullets", input: "* item satu", expected: "* item satu" },
    { name: "removes stray unmatched double asterisks", input: "akhir**", expected: "akhir" },
    {
      name: "combines dash, bold and emoji cleanup",
      input: "Belajar \u2014 **React** \u{1F680}",
      expected: "Belajar, React",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(cleanAiOutput(c.input)).toBe(c.expected);
    });
  }
});

describe("parseGeminiJsonResponse", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for undefined or empty input", () => {
    expect(parseGeminiJsonResponse()).toBeNull();
    expect(parseGeminiJsonResponse("")).toBeNull();
  });

  it("parses plain JSON surrounded by whitespace without logging errors", () => {
    const result = parseGeminiJsonResponse<{ a: number }>("  \n {\"a\":1} \n ");
    expect(result).toEqual({ a: 1 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recursively cleans string values but leaves keys and non-strings intact", () => {
    const input =
      '{"judul":"**React** \u2014 dasar","daftar":["satu \u{1F389}"],"n":5,"ok":true,"kosong":null,"**kunci**":"nilai"}';
    const result = parseGeminiJsonResponse<Record<string, unknown>>(input);
    expect(result).toEqual({
      judul: "React, dasar",
      daftar: ["satu"],
      n: 5,
      ok: true,
      kosong: null,
      "**kunci**": "nilai",
    });
  });

  it("repairs trailing commas before closing brackets and braces", () => {
    const result = parseGeminiJsonResponse<{ a: number[] }>('{"a":[1,2,],}');
    expect(result).toEqual({ a: [1, 2] });
  });

  const controlCases: { name: string; raw: string; expected: string }[] = [
    { name: "newline", raw: "a\nb", expected: "a\nb" },
    { name: "carriage return", raw: "a\rb", expected: "a\rb" },
    { name: "tab", raw: "a\tb", expected: "a\tb" },
    { name: "other control character (U+0001)", raw: "a\u0001b", expected: "a\u0001b" },
  ];

  for (const c of controlCases) {
    it(`escapes a literal ${c.name} inside a JSON string value`, () => {
      const input = '{"teks":"' + c.raw + '"}';
      const result = parseGeminiJsonResponse<{ teks: string }>(input);
      expect(result).toEqual({ teks: c.expected });
    });
  }

  it("extracts JSON from a ```json fence even when braces appear outside the fence", () => {
    const input = "Catatan {lihat} di bawah\n```json\n{\"a\":1}\n```";
    expect(parseGeminiJsonResponse<{ a: number }>(input)).toEqual({ a: 1 });
  });

  it("extracts JSON from a fence without a language tag", () => {
    const input = "```\n[\"x\", \"y\"]\n```";
    expect(parseGeminiJsonResponse<string[]>(input)).toEqual(["x", "y"]);
  });

  it("strips the spreadsheet prefix when there is no closing fence", () => {
    const input = "Default SpreadSheet Code:\n```json\n\"halo **dunia**\"";
    expect(parseGeminiJsonResponse<string>(input)).toBe("halo dunia");
  });

  it("extracts an object substring from surrounding prose", () => {
    const input = 'Tentu! Ini JSON-nya: {"a": 1} Semoga membantu.';
    expect(parseGeminiJsonResponse<{ a: number }>(input)).toEqual({ a: 1 });
  });

  it("repairs trailing commas inside an extracted object substring", () => {
    const input = 'Hasil: {"a": [1, 2,],} selesai';
    expect(parseGeminiJsonResponse<{ a: number[] }>(input)).toEqual({ a: [1, 2] });
  });

  it("extracts an array substring from surrounding prose", () => {
    const input = 'Daftar: ["satu", "dua"] selesai';
    expect(parseGeminiJsonResponse<string[]>(input)).toEqual(["satu", "dua"]);
  });

  it("falls back to the array substring when the object substring is not valid JSON", () => {
    const input = 'Jawaban: [{"a":1},{"a":2}] oke';
    expect(parseGeminiJsonResponse<{ a: number }[]>(input)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("returns null and logs an error when delimiters are in reverse order", () => {
    expect(parseGeminiJsonResponse("} lalu { dan ] lalu [")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null and logs the failure message for non-JSON text", () => {
    expect(parseGeminiJsonResponse("teks {bukan json} teks")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("All JSON parsing attempts failed");
  });
});

describe("cleanModuleTitle", () => {
  const cases: { name: string; input: string; expected: string }[] = [
    { name: "returns empty string for empty input", input: "", expected: "" },
    { name: "returns empty string for whitespace-only input", input: "   ", expected: "" },
    { name: "strips 'Modul N:' prefix", input: "Modul 1: Pengenalan React", expected: "Pengenalan React" },
    { name: "strips 'Module N -' prefix", input: "Module 2 - Hooks", expected: "Hooks" },
    { name: "strips multi-digit module prefix", input: "Modul 10: Penutup", expected: "Penutup" },
    { name: "strips 'Day N:' prefix", input: "Day 3: Latihan", expected: "Latihan" },
    { name: "strips 'Hari N.' prefix case-insensitively", input: "hari 4. Evaluasi", expected: "Evaluasi" },
    { name: "strips bare numeric prefix", input: "1. Dasar TypeScript", expected: "Dasar TypeScript" },
    { name: "strips surrounding quotes and asterisks before the prefix", input: '"**Modul 1: Dasar**"', expected: "Dasar" },
    { name: "trims and strips single quotes around the title", input: "  'Hari 2 - Praktik'  ", expected: "Praktik" },
    { name: "keeps a prefix-only title but drops its trailing colon", input: "Modul 1:", expected: "Modul 1" },
    { name: "removes trailing colon", input: "Pengenalan Data:", expected: "Pengenalan Data" },
    { name: "removes trailing hyphen and whitespace", input: "Ringkasan -", expected: "Ringkasan" },
    {
      name: "applies AI output cleanup to the remaining title",
      input: "Modul 1: Dasar \u2014 Pengenalan \u{1F680}",
      expected: "Dasar, Pengenalan",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(cleanModuleTitle(c.input)).toBe(c.expected);
    });
  }
});

// Hand-written (not model output) from here on. The model skipped callWithRetries ("already covered by other
// tests"), but the existing tests never assert its error mapping, retry limit or backoff, and mutation runs showed
// it: changing the limit, the delays or the mapped messages left every test green. These tests close that gap.
describe("callWithRetries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the result of a successful call without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(callWithRetries(fn, "t")).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an HTTP 401 status", new Error("Request failed with 401")],
    ["the word unauthorized in any case, without a status code", new Error("Unauthorized access")],
  ])("maps %s to a sign-in error without retrying", async (_name, error) => {
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callWithRetries(fn, "t")).rejects.toMatchObject({
      message: "unauthorized: Sign in required to use AI features.",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an HTTP 429 status", new Error("429 Too Many Requests")],
    ["the insufficient_points code, without a status code", new Error("insufficient_points: saldo habis")],
  ])("maps %s to an insufficient points error without retrying", async (_name, error) => {
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callWithRetries(fn, "t")).rejects.toMatchObject({
      message: "insufficient_points: Poin Anda tidak cukup untuk melakukan aksi ini.",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "ai_generation_failed",
      new Error("ai_generation_failed: model overloaded"),
      "ai_generation_failed: model overloaded",
    ],
    [
      "ai_generation_failed",
      new Error("ai_generation_failed"),
      "ai_generation_failed: Layanan AI mengalami kendala.",
    ],
    [
      "ai_generation_blocked",
      new Error("ai_generation_blocked: konten sensitif"),
      "ai_generation_blocked: konten sensitif",
    ],
    [
      "ai_generation_blocked",
      new Error("ai_generation_blocked"),
      "ai_generation_blocked: Konten tidak dapat dibuat oleh AI.",
    ],
    [
      "ai_upstream_network_error",
      new Error("ai_upstream_network_error"),
      "ai_upstream_network_error: Gagal terhubung ke layanan AI.",
    ],
    [
      "ai_upstream_network_error",
      new Error("ai_upstream_network_error: Gagal terhubung ke layanan AI. Poin Anda gagal dikembalikan, silakan hubungi admin."),
      "ai_upstream_network_error: Gagal terhubung ke layanan AI. Poin Anda gagal dikembalikan, silakan hubungi admin.",
    ],
  ])("passes through a %s error without retrying (%#)", async (_code, error, expected) => {
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callWithRetries(fn, "t")).rejects.toMatchObject({ message: expected });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries with a doubling delay (1s, then 2s) and resolves once a call succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom 1"))
      .mockRejectedValueOnce(new Error("boom 2"))
      .mockResolvedValue("ok");
    const promise = callWithRetries(fn, "t");

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBe("ok");
  });

  it("rethrows the original error after three failed attempts", async () => {
    const error = new Error("still failing");
    const fn = vi.fn().mockRejectedValue(error);
    const outcome = expect(callWithRetries(fn, "t")).rejects.toBe(error);

    await vi.advanceTimersByTimeAsync(10_000);
    await outcome;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("cleanAiOutput (triple asterisks)", () => {
  it("unwraps triple asterisks inside a word, where the italic rule does not apply", () => {
    expect(cleanAiOutput("x***y***z")).toBe("xyz");
  });
});
