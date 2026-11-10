import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { useFlashcards } from "./useFlashcards";
import { useAuth } from "./useAuth";
import type { AuthStatus, AuthUser, UseAuthResult } from "./useAuth";
import { generateFlashcardsFromMaterial } from "../services/geminiService";
import type { Flashcard, FlashcardDeck, FlashcardMatchItem, HistoryItem } from "../types";

// Isolate the hook from the real session fetch and the Gemini client.
vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/geminiService", () => ({ generateFlashcardsFromMaterial: vi.fn() }));

type HistoryDispatch = Dispatch<SetStateAction<HistoryItem[]>>;
type ErrorDispatch = Dispatch<SetStateAction<string | null>>;
type GenResult = Awaited<ReturnType<typeof generateFlashcardsFromMaterial>>;

const mockedUseAuth = vi.mocked(useAuth);
const mockGenerate = vi.mocked(generateFlashcardsFromMaterial);

const NOW = 1_700_000_000_000;
const NO_CARDS_ERROR =
  "No flashcards available to start the matching game. Please add or generate some flashcards first.";
const MISSING_CONTEXT_ERROR =
  "Cannot generate flashcards: Active module information or learning session is missing.";
const EMPTY_RESULT_ERROR =
  "No flashcards were generated. The AI might not have found distinct terms or an issue occurred.";

function makeUser(points: number): AuthUser {
  return { id: "u-test", email: "pengguna@example.com", name: "Pengguna Uji", points };
}

function mockAuth(user: AuthUser | null, status: AuthStatus) {
  const refresh = vi.fn(async () => {});
  const value: UseAuthResult = {
    user,
    status,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh,
    updatePoints: vi.fn(),
  };
  mockedUseAuth.mockReturnValue(value);
  return refresh;
}

function makeCard(id: string, term: string, definition: string): Flashcard {
  return {
    id,
    term,
    definition,
    status: "learning",
    lastReviewed: NOW,
    nextReview: NOW,
    difficultyLevel: "medium",
    moduleId: "Aljabar Dasar",
  };
}

const DECK: FlashcardDeck = {
  moduleId: "Aljabar Dasar",
  moduleTitle: "Aljabar Dasar",
  cards: [
    makeCard("c1", "Variabel", "Simbol pengganti nilai"),
    makeCard("c2", "Konstanta", "Nilai yang tidak berubah"),
  ],
};

const ITEMS_IN_ORDER: FlashcardMatchItem[] = [
  { id: "term-c1", flashcardId: "c1", type: "term", text: "Variabel", isVisible: true },
  { id: "def-c1", flashcardId: "c1", type: "definition", text: "Simbol pengganti nilai", isVisible: true },
  { id: "term-c2", flashcardId: "c2", type: "term", text: "Konstanta", isVisible: true },
  { id: "def-c2", flashcardId: "c2", type: "definition", text: "Nilai yang tidak berubah", isVisible: true },
];

function makeHistoryItem(id: string): HistoryItem {
  return {
    id,
    topic: `Topik ${id}`,
    targetLanguage: "Bahasa Indonesia",
    curriculum: { topic: `Topik ${id}`, syllabus: "", modules: [] },
    sevenDayPlan: { topic: `Topik ${id}`, days: [] },
    initialTutorGreeting: "Halo",
    timestamp: 0,
    moduleCompletionStatus: {},
    planTaskCompletionStatus: {},
    overallProgress: 0,
    journeyCompleted: false,
    quizHistory: [],
  };
}

function applyLastHistoryUpdate(mock: Mock<HistoryDispatch>, prev: HistoryItem[]): HistoryItem[] {
  const action = mock.mock.lastCall?.[0];
  if (typeof action !== "function") throw new Error("expected a functional setHistoryItems update");
  return action(prev);
}

function renderFlashcards(historyId: string | null = "h1") {
  const setError = vi.fn<ErrorDispatch>();
  const setHistoryItems = vi.fn<HistoryDispatch>();
  const hook = renderHook(() => useFlashcards(historyId, setHistoryItems, setError));
  return { ...hook, setError, setHistoryItems };
}

// Every crypto draw returns `value`; 0xffffffff keeps the original order, 0 always swaps with index 0.
function stubRandom(value: number) {
  return vi.spyOn(window.crypto, "getRandomValues").mockImplementation((array) => {
    (array as unknown as Uint32Array)[0] = value;
    return array;
  });
}

beforeEach(() => {
  mockedUseAuth.mockReset();
  mockGenerate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFlashcards match game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockAuth(null, "unauthenticated");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    { label: "no deck is selected", deck: null as FlashcardDeck | null },
    { label: "the deck has no cards", deck: { ...DECK, cards: [] } as FlashcardDeck | null },
  ])("refuses to start when $label", ({ deck }) => {
    const random = stubRandom(0);
    const { result, setError } = renderFlashcards();
    if (deck) act(() => { result.current.setCurrentFlashcardDeck(deck); });

    act(() => { result.current.handleStartFlashcardMatchGame(); });

    expect(setError).toHaveBeenCalledWith(NO_CARDS_ERROR);
    expect(result.current.matchGameActive).toBe(false);
    expect(result.current.flashcardMatchGameItems).toEqual([]);
    expect(result.current.matchGameStartTime).toBeNull();
    expect(result.current.matchGameTimerIntervalIdRef.current).toBeNull();
    expect(random).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.matchGameTimeElapsed).toBe(0);
  });

  it("builds term/definition items, shuffles via crypto and ticks once per second", () => {
    const random = stubRandom(0xffffffff);
    const { result, setError } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });

    act(() => { result.current.handleStartFlashcardMatchGame(); });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
    expect(result.current.matchGameActive).toBe(true);
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.matchGameStartTime).toBe(NOW);
    expect(result.current.matchGameTimeElapsed).toBe(0);
    expect(result.current.flashcardMatchGameItems).toEqual(ITEMS_IN_ORDER);
    // Fisher-Yates over 4 items draws n - 1 random numbers.
    expect(random).toHaveBeenCalledTimes(3);

    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.matchGameTimeElapsed).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.matchGameTimeElapsed).toBe(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.matchGameTimeElapsed).toBe(3);
  });

  it("uses the crypto values to decide the item order", () => {
    stubRandom(0);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });

    act(() => { result.current.handleStartFlashcardMatchGame(); });

    expect(result.current.flashcardMatchGameItems.map((item) => item.id)).toEqual([
      "def-c1",
      "term-c2",
      "def-c2",
      "term-c1",
    ]);
  });

  it("restarting resets elapsed time, selection and visibility and keeps a single interval", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    const attempt = (id: string) => act(() => { result.current.handleFlashcardMatchAttempt(id); });

    act(() => { result.current.handleStartFlashcardMatchGame(); });
    act(() => { vi.advanceTimersByTime(3000); });
    attempt("term-c1");
    attempt("def-c1");
    attempt("term-c2");
    expect(result.current.selectedMatchItemId).toBe("term-c2");

    act(() => { result.current.handleStartFlashcardMatchGame(); });

    expect(result.current.matchGameTimeElapsed).toBe(0);
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems.every((item) => item.isVisible)).toBe(true);

    // A leaked old interval would make this 4 instead of 2.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.matchGameTimeElapsed).toBe(2);
  });

  it("ignores attempts while the game is not active", () => {
    const { result } = renderFlashcards();
    act(() => { result.current.setFlashcardMatchGameItems(ITEMS_IN_ORDER); });

    act(() => { result.current.handleFlashcardMatchAttempt("term-c1"); });

    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems).toEqual(ITEMS_IN_ORDER);
  });

  it("selects an item and deselects it when the same item is clicked again", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    act(() => { result.current.handleStartFlashcardMatchGame(); });

    act(() => { result.current.handleFlashcardMatchAttempt("term-c1"); });
    expect(result.current.selectedMatchItemId).toBe("term-c1");

    act(() => { result.current.handleFlashcardMatchAttempt("term-c1"); });
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems.every((item) => item.isVisible)).toBe(true);
  });

  it("hides a correct pair regardless of click order and keeps the game running", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    act(() => { result.current.handleStartFlashcardMatchGame(); });
    const attempt = (id: string) => act(() => { result.current.handleFlashcardMatchAttempt(id); });
    const visibleIds = () =>
      result.current.flashcardMatchGameItems.filter((item) => item.isVisible).map((item) => item.id);

    attempt("def-c1");
    attempt("term-c1");

    expect(visibleIds()).toEqual(["term-c2", "def-c2"]);
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.matchGameActive).toBe(true);
    expect(result.current.matchGameTimerIntervalIdRef.current).not.toBeNull();

    // Hidden items can no longer be selected.
    attempt("term-c1");
    expect(result.current.selectedMatchItemId).toBeNull();
  });

  it("clears the selection without hiding anything on a mismatch", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    act(() => { result.current.handleStartFlashcardMatchGame(); });
    const attempt = (id: string) => act(() => { result.current.handleFlashcardMatchAttempt(id); });

    attempt("term-c1");
    attempt("def-c2");
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems).toEqual(ITEMS_IN_ORDER);

    // Two terms of different cards are not a pair either.
    attempt("term-c1");
    attempt("term-c2");
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems).toEqual(ITEMS_IN_ORDER);
  });

  it("ignores unknown item ids and drops a selection that no longer exists", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    act(() => { result.current.handleStartFlashcardMatchGame(); });
    const attempt = (id: string) => act(() => { result.current.handleFlashcardMatchAttempt(id); });

    attempt("term-unknown");
    expect(result.current.selectedMatchItemId).toBeNull();

    attempt("term-c1");
    attempt("term-unknown");
    expect(result.current.selectedMatchItemId).toBe("term-c1");

    act(() => { result.current.setSelectedMatchItemId("ghost-item"); });
    attempt("term-c1");
    expect(result.current.selectedMatchItemId).toBeNull();
    expect(result.current.flashcardMatchGameItems).toEqual(ITEMS_IN_ORDER);
  });

  it("ends the game and stops the timer once the last pair is matched", () => {
    stubRandom(0xffffffff);
    const { result } = renderFlashcards();
    act(() => { result.current.setCurrentFlashcardDeck(DECK); });
    act(() => { result.current.handleStartFlashcardMatchGame(); });
    const attempt = (id: string) => act(() => { result.current.handleFlashcardMatchAttempt(id); });
    act(() => { vi.advanceTimersByTime(2000); });

    attempt("term-c1");
    attempt("def-c1");
    expect(result.current.matchGameActive).toBe(true);

    attempt("def-c2");
    attempt("term-c2");

    expect(result.current.matchGameActive).toBe(false);
    expect(result.current.matchGameTimerIntervalIdRef.current).toBeNull();
    expect(result.current.flashcardMatchGameItems.every((item) => !item.isVisible)).toBe(true);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.matchGameTimeElapsed).toBe(2);
  });

  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [59, "00:59"],
    [60, "01:00"],
    [65, "01:05"],
    [3599, "59:59"],
    [6000, "100:00"],
  ])("formatMatchGameTime(%i) returns %s", (seconds, expected) => {
    const { result } = renderFlashcards();
    expect(result.current.formatMatchGameTime(seconds)).toBe(expected);
  });
});

describe("useFlashcards handleGenerateFlashcards", () => {
  const MODULE_TITLE = "Aljabar  Dasar"; // double space: id slug must collapse whitespace
  const MODULE_INFO = { title: MODULE_TITLE, moduleMaterial: "Variabel adalah simbol pengganti nilai." };
  const GENERATED = [
    { term: "Variabel", definition: "Simbol pengganti nilai" },
    { term: "Konstanta", definition: "Nilai yang tidak berubah" },
  ] as GenResult;

  function generatedCard(index: number, term: string, definition: string): Flashcard {
    return {
      id: `fc-Aljabar-Dasar-${NOW}-${index}`,
      term,
      definition,
      status: "learning",
      lastReviewed: NOW,
      nextReview: NOW,
      difficultyLevel: "medium",
      moduleId: MODULE_TITLE,
    };
  }

  function setupGenerate(user: AuthUser | null, status: AuthStatus = "authenticated", historyId: string | null = "h1") {
    const refresh = mockAuth(user, status);
    const ctx = renderFlashcards(historyId);
    const setIsAuthModalOpen = vi.fn<(val: boolean) => void>();
    const setIsPointsModalOpen = vi.fn<(val: boolean) => void>();
    const setPointsModalInfo = vi.fn<(val: { required: number; remaining: number; action: string }) => void>();
    const start = () =>
      ctx.result.current.handleGenerateFlashcards(
        "Bahasa Indonesia",
        setIsAuthModalOpen,
        setIsPointsModalOpen,
        setPointsModalInfo,
      );
    const generate = async () => {
      await act(async () => {
        await start();
      });
    };
    return { ...ctx, refresh, setIsAuthModalOpen, setIsPointsModalOpen, setPointsModalInfo, start, generate };
  }

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it.each([
    { label: "signed out", user: null as AuthUser | null, status: "unauthenticated" as AuthStatus },
    { label: "session still loading", user: makeUser(100) as AuthUser | null, status: "loading" as AuthStatus },
  ])("opens the auth modal and does nothing else when $label", async ({ user, status }) => {
    const ctx = setupGenerate(user, status);
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(ctx.setIsAuthModalOpen).toHaveBeenCalledWith(true);
    expect(ctx.setIsPointsModalOpen).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(ctx.refresh).not.toHaveBeenCalled();
    expect(ctx.setError).not.toHaveBeenCalled();
  });

  it("opens the points modal when the user has fewer than 5 points", async () => {
    const ctx = setupGenerate(makeUser(4));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(ctx.setPointsModalInfo).toHaveBeenCalledWith({ required: 5, remaining: 4, action: "Generate Kartu Kilat" });
    expect(ctx.setIsPointsModalOpen).toHaveBeenCalledWith(true);
    expect(ctx.setIsAuthModalOpen).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(ctx.refresh).not.toHaveBeenCalled();
  });

  it("lets exactly 5 points through and then reports a missing active module", async () => {
    const ctx = setupGenerate(makeUser(5));

    await ctx.generate();

    expect(ctx.setIsPointsModalOpen).not.toHaveBeenCalled();
    expect(ctx.setError).toHaveBeenCalledWith(MISSING_CONTEXT_ERROR);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(ctx.result.current.isGeneratingFlashcards).toBe(false);
    expect(ctx.refresh).not.toHaveBeenCalled();
  });

  it.each([
    { label: "the module material is empty", material: "", historyId: "h1" as string | null },
    { label: "no history item is selected", material: "Materi modul", historyId: null as string | null },
  ])("reports missing context when $label", async ({ material, historyId }) => {
    const ctx = setupGenerate(makeUser(50), "authenticated", historyId);
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo({ title: MODULE_TITLE, moduleMaterial: material }); });

    await ctx.generate();

    expect(ctx.setError).toHaveBeenCalledWith(MISSING_CONTEXT_ERROR);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("creates a new deck from generated items, syncs history and refreshes points", async () => {
    mockGenerate.mockResolvedValueOnce(GENERATED);
    const ctx = setupGenerate(makeUser(20));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(mockGenerate).toHaveBeenCalledWith(MODULE_TITLE, MODULE_INFO.moduleMaterial, "Bahasa Indonesia", 25);
    const expectedDeck: FlashcardDeck = {
      moduleId: MODULE_TITLE,
      moduleTitle: MODULE_TITLE,
      cards: [
        generatedCard(0, "Variabel", "Simbol pengganti nilai"),
        generatedCard(1, "Konstanta", "Nilai yang tidak berubah"),
      ],
    };
    expect(ctx.result.current.flashcardDecks).toEqual({ [MODULE_TITLE]: expectedDeck });
    expect(ctx.result.current.currentFlashcardDeck).toEqual(expectedDeck);
    expect(ctx.result.current.isGeneratingFlashcards).toBe(false);
    expect(ctx.setError).toHaveBeenCalledTimes(1);
    expect(ctx.setError).toHaveBeenCalledWith(null);
    expect(ctx.refresh).toHaveBeenCalledTimes(1);

    const prev = [makeHistoryItem("h0"), makeHistoryItem("h1")];
    const next = applyLastHistoryUpdate(ctx.setHistoryItems, prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).toEqual({ ...prev[1], flashcardDecks: { [MODULE_TITLE]: expectedDeck } });

    // A history list without the selected id is returned untouched.
    const unrelated = [makeHistoryItem("h9")];
    expect(applyLastHistoryUpdate(ctx.setHistoryItems, unrelated)).toBe(unrelated);
  });

  it("appends generated cards after existing ones and keeps other decks", async () => {
    mockGenerate.mockResolvedValueOnce([{ term: "Koefisien", definition: "Angka pengali variabel" }] as GenResult);
    const ctx = setupGenerate(makeUser(20));
    const existing = { ...makeCard("old-1", "Suku", "Bagian dari bentuk aljabar"), moduleId: MODULE_TITLE };
    const otherDeck: FlashcardDeck = { moduleId: "Geometri", moduleTitle: "Geometri", cards: [] };
    act(() => {
      ctx.result.current.setFlashcardDecks({
        [MODULE_TITLE]: { moduleId: MODULE_TITLE, moduleTitle: MODULE_TITLE, cards: [existing] },
        Geometri: otherDeck,
      });
      ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO);
    });

    await ctx.generate();

    const deck = ctx.result.current.flashcardDecks[MODULE_TITLE];
    expect(deck.cards).toEqual([existing, generatedCard(0, "Koefisien", "Angka pengali variabel")]);
    expect(ctx.result.current.flashcardDecks.Geometri).toEqual(otherDeck);
    expect(ctx.result.current.currentFlashcardDeck).toEqual(deck);
  });

  it("flags isGeneratingFlashcards while the AI request is pending", async () => {
    let resolveGeneration: (value: GenResult) => void = () => {};
    mockGenerate.mockReturnValueOnce(
      new Promise<GenResult>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    const ctx = setupGenerate(makeUser(20));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = ctx.start();
    });
    expect(ctx.result.current.isGeneratingFlashcards).toBe(true);
    expect(ctx.refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveGeneration([] as GenResult);
      await pending;
    });
    expect(ctx.result.current.isGeneratingFlashcards).toBe(false);
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it("writes a generation that finishes after a session switch to the original session only", async () => {
    let resolveGeneration: (value: GenResult) => void = () => {};
    mockGenerate.mockReturnValueOnce(
      new Promise<GenResult>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    mockAuth(makeUser(20), "authenticated");
    const setError = vi.fn<ErrorDispatch>();
    const setHistoryItems = vi.fn<HistoryDispatch>();
    const { result, rerender } = renderHook(
      ({ historyId }: { historyId: string | null }) => useFlashcards(historyId, setHistoryItems, setError),
      { initialProps: { historyId: "hA" as string | null } },
    );

    const existingA = { ...makeCard("a-1", "Suku", "Bagian dari bentuk aljabar"), moduleId: MODULE_TITLE };
    const decksA: Record<string, FlashcardDeck> = {
      [MODULE_TITLE]: { moduleId: MODULE_TITLE, moduleTitle: MODULE_TITLE, cards: [existingA] },
      Geometri: { moduleId: "Geometri", moduleTitle: "Geometri", cards: [makeCard("a-2", "Sudut", "Pertemuan dua garis")] },
    };
    const deckB: FlashcardDeck = { moduleId: "Biologi", moduleTitle: "Biologi", cards: [makeCard("b-1", "Sel", "Unit kehidupan")] };
    const decksB: Record<string, FlashcardDeck> = { Biologi: deckB };

    act(() => {
      result.current.setFlashcardDecks(decksA);
      result.current.setActiveFlashcardModuleInfo(MODULE_INFO);
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.handleGenerateFlashcards("Bahasa Indonesia", vi.fn(), vi.fn(), vi.fn());
    });

    // The user opens session B while the AI request is still running (what App.tsx does on select).
    rerender({ historyId: "hB" });
    act(() => {
      result.current.setFlashcardDecks(decksB);
      result.current.setCurrentFlashcardDeck(deckB);
    });

    await act(async () => {
      resolveGeneration([{ term: "Koefisien", definition: "Angka pengali variabel" }] as GenResult);
      await pending;
    });

    // Session B's view is left alone.
    expect(result.current.flashcardDecks).toEqual(decksB);
    expect(result.current.currentFlashcardDeck).toEqual(deckB);

    // Session A gets the new cards on top of its own decks; session B's history is untouched.
    const histA = { ...makeHistoryItem("hA"), flashcardDecks: decksA };
    const histB = { ...makeHistoryItem("hB"), flashcardDecks: decksB };
    const prev = [histA, histB];
    const next = setHistoryItems.mock.calls.reduce<HistoryItem[]>((items, [action]) => {
      if (typeof action !== "function") throw new Error("expected a functional setHistoryItems update");
      return action(items);
    }, prev);
    expect(next[1]).toBe(histB);
    expect(next[0].flashcardDecks).toEqual({
      [MODULE_TITLE]: {
        moduleId: MODULE_TITLE,
        moduleTitle: MODULE_TITLE,
        cards: [existingA, generatedCard(0, "Koefisien", "Angka pengali variabel")],
      },
      Geometri: decksA.Geometri,
    });
    expect(result.current.isGeneratingFlashcards).toBe(false);
  });

  it("reports an empty AI result without touching decks", async () => {
    mockGenerate.mockResolvedValueOnce([] as GenResult);
    const ctx = setupGenerate(makeUser(20));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(ctx.setError).toHaveBeenLastCalledWith(EMPTY_RESULT_ERROR);
    expect(ctx.result.current.flashcardDecks).toEqual({});
    expect(ctx.result.current.currentFlashcardDeck).toBeNull();
    expect(ctx.setHistoryItems).not.toHaveBeenCalled();
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ai_generation_failed: Model sedang sibuk", "Model sedang sibuk"],
    ["ai_generation_blocked:   Konten diblokir  ", "Konten diblokir"],
    ["ai_upstream_network_error:Jaringan terputus", "Jaringan terputus"],
    ["ai_generation_failed: unauthorized", "unauthorized"],
    ["request failed: unauthorized", "Silakan masuk terlebih dahulu untuk menggunakan fitur AI."],
    ["insufficient_points", "Poin Anda tidak cukup untuk melakukan aksi ini."],
    ["ai_generation_failed", "ai_generation_failed"],
    ["", "Terjadi kesalahan tidak diketahui."],
  ])("maps a rejected Error %j to the message %j", async (raw, expected) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(raw);
    mockGenerate.mockRejectedValueOnce(error);
    const ctx = setupGenerate(makeUser(20));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(ctx.setError).toHaveBeenLastCalledWith(expected);
    expect(consoleError).toHaveBeenCalledWith("Error generating flashcards:", error);
    expect(ctx.result.current.isGeneratingFlashcards).toBe(false);
    expect(ctx.result.current.flashcardDecks).toEqual({});
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it("stringifies non-Error rejections", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGenerate.mockRejectedValueOnce("galat mentah");
    const ctx = setupGenerate(makeUser(20));
    act(() => { ctx.result.current.setActiveFlashcardModuleInfo(MODULE_INFO); });

    await ctx.generate();

    expect(ctx.setError).toHaveBeenLastCalledWith("galat mentah");
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });
});
