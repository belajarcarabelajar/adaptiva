import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDetailedQuizExplanation, generateExamQuestions, generateQuiz } from "./quiz";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const serverReplies = (text: string) =>
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ text }), { status: 200, headers: { "content-type": "application/json" } }),
  );

const serverFailsWithInsufficientPoints = () =>
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ error: "insufficient_points", message: "Poin tidak cukup." }), { status: 429 }),
  );

const sentBody = (call = 0) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const QUESTION = {
  id: "q1",
  question: "Apa itu variabel?",
  options: ["Wadah data", "Fungsi", "Perulangan", "Kelas"],
  correctAnswer: "Wadah data",
  explanation: "Penjelasan singkat",
};

// Wire text as the server returns it: valid JSON with inner quotes escaped.
const QUOTED_QUIZ_TEXT = String.raw`{
  "questions": [
    {
      "question": "Apa arti \"variabel\" dalam pemrograman?",
      "options": ["Wadah \"data\"", "Fungsi", "Perulangan", "Kelas"],
      "correctAnswer": "Wadah \"data\"",
      "explanation": "- Variabel menyimpan \"nilai\"\n- Nilainya bisa berubah\n- Punya nama"
    },
    {
      "question": "Tipe data teks disebut?",
      "options": ["string", "number", "boolean", "null"],
      "correctAnswer": "string",
      "explanation": "- Poin 1\n- Poin 2\n- Poin 3"
    }
  ]
}`;

describe("generateQuiz", () => {
  it("asks /api/ai for task quiz.questions with a prompt and no model or schema", async () => {
    serverReplies(QUOTED_QUIZ_TEXT);

    await generateQuiz("Variabel Dasar", "Materi variabel", "English", 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/ai");
    expect(init?.method).toBe("POST");
    const body = sentBody();
    expect(body.task).toBe("quiz.questions");
    expect(typeof body.prompt).toBe("string");
    expect(Object.keys(body).sort()).toEqual(["prompt", "task"]);
  });

  it("describes a questions object in the prompt with the requested count and 4 options", async () => {
    serverReplies(QUOTED_QUIZ_TEXT);

    await generateQuiz("Variabel Dasar", "Materi variabel", "English", 7);

    const prompt = String(sentBody().prompt);
    expect(prompt).toContain('"questions": [');
    expect(prompt).toContain("exactly 7 questions");
    expect(prompt).toContain("4 options");
    expect(prompt).not.toContain("JSON array of objects");
  });

  it("maps the questions with ids from the module title and keeps quoted phrases intact", async () => {
    serverReplies(QUOTED_QUIZ_TEXT);

    const result = await generateQuiz("Variabel Dasar", "Materi variabel", "Bahasa Indonesia", 2);

    expect(result).toEqual([
      {
        id: "q-Variabel-Dasar-0",
        question: 'Apa arti "variabel" dalam pemrograman?',
        options: ['Wadah "data"', "Fungsi", "Perulangan", "Kelas"],
        correctAnswer: 'Wadah "data"',
        explanation: '- Variabel menyimpan "nilai"\n- Nilainya bisa berubah\n- Punya nama',
        detailedExplanation: undefined,
        isDetailedExplanationLoading: false,
      },
      {
        id: "q-Variabel-Dasar-1",
        question: "Tipe data teks disebut?",
        options: ["string", "number", "boolean", "null"],
        correctAnswer: "string",
        explanation: "- Poin 1\n- Poin 2\n- Poin 3",
        detailedExplanation: undefined,
        isDetailedExplanationLoading: false,
      },
    ]);
  });

  it("returns null when questions is missing", async () => {
    serverReplies(JSON.stringify({ other: [] }));

    await expect(generateQuiz("Variabel", "Materi", "English", 1)).resolves.toBeNull();
  });

  it("returns null for the old top-level array shape", async () => {
    serverReplies(JSON.stringify([{ question: "Q?", options: ["A", "B", "C", "D"], correctAnswer: "A", explanation: "- x" }]));

    await expect(generateQuiz("Variabel", "Materi", "English", 1)).resolves.toBeNull();
  });

  it("returns null without fetching when the material is empty", async () => {
    await expect(generateQuiz("Variabel", "  \n ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows insufficient points without retrying", async () => {
    serverFailsWithInsufficientPoints();

    await expect(generateQuiz("Variabel", "Materi", "English", 1)).rejects.toThrow(
      "insufficient_points: Poin Anda tidak cukup untuk melakukan aksi ini.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("generateDetailedQuizExplanation", () => {
  it("asks for task quiz.explanation and returns the explanation with quotes intact", async () => {
    serverReplies(String.raw`{"detailedExplanation": "## Konsep\nIstilah \"wadah\" berarti tempat menyimpan."}`);

    const result = await generateDetailedQuizExplanation(QUESTION, "Variabel", "Materi", "Bahasa Indonesia");

    expect(sentBody().task).toBe("quiz.explanation");
    expect(Object.keys(sentBody()).sort()).toEqual(["prompt", "task"]);
    expect(result).toEqual({ detailedExplanation: '## Konsep\nIstilah "wadah" berarti tempat menyimpan.' });
  });

  it("returns null when detailedExplanation is missing", async () => {
    serverReplies(JSON.stringify({ other: "x" }));

    await expect(generateDetailedQuizExplanation(QUESTION, "Variabel", "Materi", "English")).resolves.toBeNull();
  });

  it("returns null when the text is not JSON", async () => {
    serverReplies("not valid json at all");

    await expect(generateDetailedQuizExplanation(QUESTION, "Variabel", "Materi", "English")).resolves.toBeNull();
  });

  it("rethrows insufficient points without retrying", async () => {
    serverFailsWithInsufficientPoints();

    await expect(generateDetailedQuizExplanation(QUESTION, "Variabel", "Materi", "English")).rejects.toThrow(
      "insufficient_points",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const QUOTED_EXAM_TEXT = String.raw`{
  "questions": [
    {
      "questionText": "Apa fungsi \"props\" di React?",
      "options": ["Input \"komponen\"", "State", "Hook", "Router"],
      "correctAnswer": "Input \"komponen\"",
      "explanation": "- Props adalah \"input\"\n- Diteruskan dari induk\n- Hanya baca"
    }
  ]
}`;

describe("generateExamQuestions", () => {
  it("asks for task exam.questions with a prompt only", async () => {
    serverReplies(QUOTED_EXAM_TEXT);

    await generateExamQuestions("React Dasar", "Materi React", 1, 3, "English");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody().task).toBe("exam.questions");
    expect(Object.keys(sentBody()).sort()).toEqual(["prompt", "task"]);
  });

  it("no longer asks the model for type or maxPoints", async () => {
    serverReplies(QUOTED_EXAM_TEXT);

    await generateExamQuestions("React Dasar", "Materi React", 4, 3, "English");

    const prompt = String(sentBody().prompt);
    expect(prompt).not.toContain("maxPoints");
    expect(prompt).not.toContain('"type"');
    expect(prompt).toContain('"questions": [');
    expect(prompt).toContain('"questionText"');
  });

  it("uses the medium difficulty description when difficulty is out of range", async () => {
    serverReplies(QUOTED_EXAM_TEXT);

    await generateExamQuestions("React Dasar", "Materi React", 1, 999, "English");

    expect(String(sentBody().prompt)).toContain("medium, requiring some application of knowledge");
  });

  it("maps questions as multiple-choice worth 1 point with quoted phrases intact", async () => {
    serverReplies(QUOTED_EXAM_TEXT);

    const result = await generateExamQuestions("React Dasar", "Materi React", 1, 4, "Bahasa Indonesia");

    expect(result).toHaveLength(1);
    expect(result![0].id).toMatch(/^exam-q-React-Dasar-\d+-0$/);
    expect(result![0]).toEqual({
      id: result![0].id,
      type: "multiple-choice",
      questionText: 'Apa fungsi "props" di React?',
      options: ['Input "komponen"', "State", "Hook", "Router"],
      correctAnswer: 'Input "komponen"',
      explanation: '- Props adalah "input"\n- Diteruskan dari induk\n- Hanya baca',
      difficulty: 4,
      maxPoints: 1,
      userAnswer: undefined,
      isCorrect: undefined,
      scoreAwarded: 0,
      feedbackShown: false,
      detailedExplanation: undefined,
      isDetailedExplanationLoading: false,
    });
  });

  it("returns null when questions is missing", async () => {
    serverReplies(JSON.stringify({ other: "data" }));

    await expect(generateExamQuestions("Topik", "Materi", 5, 3, "English")).resolves.toBeNull();
  });

  it("returns null when the text is not JSON", async () => {
    serverReplies("invalid json");

    await expect(generateExamQuestions("Topik", "Materi", 5, 3, "English")).resolves.toBeNull();
  });

  it("returns null without fetching when the material is empty", async () => {
    await expect(generateExamQuestions("Topik", "", 5, 3, "English")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows insufficient points without retrying", async () => {
    serverFailsWithInsufficientPoints();

    await expect(generateExamQuestions("Topik", "Materi", 5, 3, "English")).rejects.toThrow("insufficient_points");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
