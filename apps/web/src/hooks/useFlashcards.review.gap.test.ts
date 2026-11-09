import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { useFlashcards } from "./useFlashcards";
import type {
  Flashcard,
  FlashcardDeck,
  FlashcardDifficulty,
  FlashcardStatus,
  HistoryItem,
} from "../types";

// useAuth and the Gemini service are replaced so the hook never touches the network.
vi.mock("./useAuth", () => ({
  useAuth: () => ({
    user: null,
    status: "unauthenticated",
    error: null,
    signIn: () => {},
    signOut: () => {},
    refresh: async () => {},
    updatePoints: () => {},
  }),
}));

vi.mock("../services/geminiService", () => ({
  generateFlashcardsFromMaterial: vi.fn(),
}));

const NOW = new Date("2024-01-15T00:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const MODULE_ID = "Modul Dasar React";

function makeCard(id: string, overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    term: `Istilah ${id}`,
    definition: `Definisi ${id}`,
    status: "learning",
    lastReviewed: NOW - DAY,
    nextReview: NOW,
    difficultyLevel: "medium",
    moduleId: MODULE_ID,
    ...overrides,
  };
}

function makeDeck(cards: Flashcard[]): FlashcardDeck {
  return { moduleId: MODULE_ID, moduleTitle: MODULE_ID, cards };
}

function makeHistoryItem(id: string): HistoryItem {
  return {
    id,
    topic: `Topik ${id}`,
    targetLanguage: "Bahasa Indonesia",
    curriculum: { topic: `Topik ${id}`, syllabus: "", modules: [] },
    sevenDayPlan: { topic: `Topik ${id}`, days: [] },
    initialTutorGreeting: "Halo",
    timestamp: 1700000000000,
    overallProgress: 0,
    moduleCompletionStatus: {},
    planTaskCompletionStatus: {},
    journeyCompleted: false,
    quizHistory: [],
  };
}

interface SetupOptions {
  selectedId?: string | null;
}

// Hosts useFlashcards next to a real history state so setHistoryItems effects are observable.
function setup(cards: Flashcard[] | null, options: SetupOptions = {}) {
  const selectedId = options.selectedId === undefined ? "h1" : options.selectedId;
  const initialHistory: HistoryItem[] = [makeHistoryItem("h0"), makeHistoryItem("h1")];
  const setError = vi.fn();
  const hook = renderHook(() => {
    const [historyItems, setHistoryItems] = useState<HistoryItem[]>(initialHistory);
    const flashcards = useFlashcards(selectedId, setHistoryItems, setError);
    return { historyItems, flashcards };
  });
  const deck = cards ? makeDeck(cards) : null;
  if (deck) {
    act(() => {
      hook.result.current.flashcards.setCurrentFlashcardDeck(deck);
    });
  }
  return { result: hook.result, deck, initialHistory };
}

describe("useFlashcards review and editing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefills the form when editing and resets it when opening for a new card", () => {
    const card = makeCard("c1", { term: "Props", definition: "Input komponen" });
    const { result } = setup([card]);

    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal(card);
    });
    expect(result.current.flashcards.flashcardFormState).toEqual({ term: "Props", definition: "Input komponen" });
    expect(result.current.flashcards.editingFlashcardId).toBe("c1");
    expect(result.current.flashcards.showAddFlashcardModal).toBe(true);

    act(() => {
      result.current.flashcards.setShowAddFlashcardModal(false);
    });
    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal();
    });
    expect(result.current.flashcards.flashcardFormState).toEqual({ term: "", definition: "" });
    expect(result.current.flashcards.editingFlashcardId).toBeNull();
    expect(result.current.flashcards.showAddFlashcardModal).toBe(true);
  });

  it("adds a new learning card stamped with the current time and syncs only the selected history item", () => {
    const existing = makeCard("c1");
    const { result } = setup([existing]);

    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal();
    });
    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "JSX", definition: "Sintaks mirip HTML" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });

    const fc = result.current.flashcards;
    expect(fc.currentFlashcardDeck?.cards).toEqual([
      existing,
      {
        id: `fc-Modul-Dasar-React-${NOW}`,
        term: "JSX",
        definition: "Sintaks mirip HTML",
        status: "learning",
        lastReviewed: NOW,
        nextReview: NOW,
        difficultyLevel: "medium",
        moduleId: MODULE_ID,
      },
    ]);
    expect(fc.flashcardDecks).toEqual({ [MODULE_ID]: fc.currentFlashcardDeck });
    expect(result.current.historyItems[1]?.flashcardDecks).toEqual(fc.flashcardDecks);
    expect(result.current.historyItems[0]?.flashcardDecks).toBeUndefined();
    expect(fc.showAddFlashcardModal).toBe(false);
    expect(fc.editingFlashcardId).toBeNull();
    expect(fc.flashcardFormState).toEqual({ term: "", definition: "" });
  });

  it("updates only term and definition of the card being edited", () => {
    const target = makeCard("c1", { status: "known", nextReview: NOW + 3 * DAY, difficultyLevel: "easy" });
    const other = makeCard("c2");
    const { result } = setup([target, other]);

    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal(target);
    });
    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "Hook", definition: "Fungsi khusus React" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });

    const expectedCards = [{ ...target, term: "Hook", definition: "Fungsi khusus React" }, other];
    expect(result.current.flashcards.currentFlashcardDeck?.cards).toEqual(expectedCards);
    expect(result.current.historyItems[1]?.flashcardDecks?.[MODULE_ID]?.cards).toEqual(expectedCards);
    expect(result.current.flashcards.editingFlashcardId).toBeNull();
    expect(result.current.flashcards.showAddFlashcardModal).toBe(false);
  });

  it.each<[string, { term: string; definition: string }]>([
    ["the term is only whitespace", { term: "   ", definition: "Definisi" }],
    ["the definition is only whitespace", { term: "Istilah", definition: "\t" }],
    ["both fields are empty", { term: "", definition: "" }],
  ])("ignores save when %s", (_label, form) => {
    const { result, deck, initialHistory } = setup([makeCard("c1")]);

    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal();
    });
    act(() => {
      result.current.flashcards.setFlashcardFormState(form);
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });

    expect(result.current.flashcards.currentFlashcardDeck).toBe(deck);
    expect(result.current.flashcards.flashcardDecks).toEqual({});
    expect(result.current.historyItems).toBe(initialHistory);
    expect(result.current.flashcards.showAddFlashcardModal).toBe(true);
    expect(result.current.flashcards.flashcardFormState).toEqual(form);
  });

  it("updates the decks but leaves history untouched when the selected session is not in the list", () => {
    const { result, initialHistory } = setup([makeCard("c1")], { selectedId: "tidak-ada" });

    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "State", definition: "Data internal komponen" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });

    expect(result.current.flashcards.currentFlashcardDeck?.cards).toHaveLength(2);
    expect(result.current.flashcards.flashcardDecks[MODULE_ID]?.cards).toHaveLength(2);
    expect(result.current.historyItems).toBe(initialHistory);
  });

  it("keeps decks of other modules when saving into the active deck", () => {
    const otherDeck: FlashcardDeck = {
      moduleId: "Modul Lain",
      moduleTitle: "Modul Lain",
      cards: [makeCard("o1", { moduleId: "Modul Lain" })],
    };
    const { result } = setup([makeCard("c1")]);

    act(() => {
      result.current.flashcards.setFlashcardDecks({ "Modul Lain": otherDeck });
    });
    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "Effect", definition: "Efek samping" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });

    const decks = result.current.flashcards.flashcardDecks;
    expect(Object.keys(decks).sort()).toEqual(["Modul Dasar React", "Modul Lain"]);
    expect(decks["Modul Lain"]).toBe(otherDeck);
    expect(result.current.historyItems[1]?.flashcardDecks?.["Modul Lain"]).toBe(otherDeck);
  });

  it("removes a card from the active deck, syncs history, and ignores unknown ids", () => {
    const c1 = makeCard("c1");
    const c2 = makeCard("c2");
    const c3 = makeCard("c3");
    const { result } = setup([c1, c2, c3]);

    act(() => {
      result.current.flashcards.handleDeleteFlashcard("c2");
    });
    expect(result.current.flashcards.currentFlashcardDeck?.cards).toEqual([c1, c3]);
    expect(result.current.flashcards.flashcardDecks[MODULE_ID]?.cards).toEqual([c1, c3]);
    expect(result.current.historyItems[1]?.flashcardDecks?.[MODULE_ID]?.cards).toEqual([c1, c3]);
    expect(result.current.historyItems[0]?.flashcardDecks).toBeUndefined();

    act(() => {
      result.current.flashcards.handleDeleteFlashcard("tidak-ada");
    });
    expect(result.current.flashcards.currentFlashcardDeck?.cards).toEqual([c1, c3]);
  });

  it("does nothing when no history session is selected", () => {
    const { result, deck, initialHistory } = setup([makeCard("c1")], { selectedId: null });

    act(() => {
      result.current.flashcards.handleOpenAddFlashcardModal();
    });
    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "A", definition: "B" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });
    act(() => {
      result.current.flashcards.handleDeleteFlashcard("c1");
    });
    act(() => {
      result.current.flashcards.handleAssessFlashcard("c1", "easy");
    });

    expect(result.current.flashcards.currentFlashcardDeck).toBe(deck);
    expect(result.current.flashcards.flashcardDecks).toEqual({});
    expect(result.current.historyItems).toBe(initialHistory);
    expect(result.current.flashcards.currentFlashcardIndexInStack).toBe(0);
    expect(result.current.flashcards.showAddFlashcardModal).toBe(true);
  });

  it("returns empty computed values and ignores actions when there is no active deck", () => {
    const { result, initialHistory } = setup(null);

    expect(result.current.flashcards.sortedStackCards).toEqual([]);
    expect(result.current.flashcards.flashcardStatusCounts).toEqual({ learning: 0, reviewing: 0, known: 0, mastered: 0 });

    act(() => {
      result.current.flashcards.setFlashcardFormState({ term: "A", definition: "B" });
    });
    act(() => {
      result.current.flashcards.handleSaveFlashcard();
    });
    act(() => {
      result.current.flashcards.handleDeleteFlashcard("x");
    });
    act(() => {
      result.current.flashcards.handleAssessFlashcard("x", "easy");
    });

    expect(result.current.flashcards.currentFlashcardDeck).toBeNull();
    expect(result.current.flashcards.flashcardDecks).toEqual({});
    expect(result.current.historyItems).toBe(initialHistory);
    expect(result.current.flashcards.currentFlashcardIndexInStack).toBe(0);
  });

  it.each<[FlashcardStatus, FlashcardDifficulty, FlashcardStatus, number]>([
    ["learning", "hard", "learning", 1],
    ["learning", "medium", "reviewing", 3],
    ["learning", "easy", "known", 7],
    ["reviewing", "hard", "learning", 1],
    ["reviewing", "medium", "reviewing", 5],
    ["reviewing", "easy", "known", 10],
    ["known", "hard", "reviewing", 3],
    ["known", "medium", "known", 14],
    ["known", "easy", "mastered", 30],
    ["mastered", "hard", "reviewing", 3],
    ["mastered", "medium", "known", 14],
    ["mastered", "easy", "mastered", 60],
  ])("moves a %s card rated %s to %s due in %i days", (from, difficulty, to, days) => {
    const target = makeCard("c1", { status: from, lastReviewed: NOW - 10 * DAY, nextReview: NOW - DAY });
    const other = makeCard("c2", { status: "known", nextReview: NOW + 2 * DAY });
    const { result } = setup([target, other]);

    act(() => {
      result.current.flashcards.setFlippedFlashcardId("c1");
    });
    act(() => {
      result.current.flashcards.handleAssessFlashcard("c1", difficulty);
    });

    const expected: Flashcard = {
      ...target,
      status: to,
      difficultyLevel: difficulty,
      lastReviewed: NOW,
      nextReview: NOW + days * DAY,
    };
    expect(result.current.flashcards.currentFlashcardDeck?.cards).toEqual([expected, other]);
    expect(result.current.historyItems[1]?.flashcardDecks?.[MODULE_ID]?.cards).toEqual([expected, other]);
    expect(result.current.flashcards.flippedFlashcardId).toBeNull();
  });

  it("falls back to learning due in one day for an unrecognised status", () => {
    const target = makeCard("c1", { status: "archived" as unknown as FlashcardStatus });
    const { result } = setup([target]);

    act(() => {
      result.current.flashcards.handleAssessFlashcard("c1", "easy");
    });

    expect(result.current.flashcards.currentFlashcardDeck?.cards[0]).toEqual({
      ...target,
      status: "learning",
      difficultyLevel: "easy",
      lastReviewed: NOW,
      nextReview: NOW + DAY,
    });
  });

  it("advances the stack index after each assessment and wraps around to the start", () => {
    const { result } = setup([makeCard("c1"), makeCard("c2"), makeCard("c3")]);
    const seen: number[] = [];

    for (const id of ["c1", "c2", "c3"]) {
      act(() => {
        result.current.flashcards.handleAssessFlashcard(id, "medium");
      });
      seen.push(result.current.flashcards.currentFlashcardIndexInStack);
    }

    expect(seen).toEqual([1, 2, 0]);
  });

  it("ignores assessments for a card that is not in the active deck", () => {
    const { result, deck, initialHistory } = setup([makeCard("c1")]);

    act(() => {
      result.current.flashcards.setFlippedFlashcardId("c1");
    });
    act(() => {
      result.current.flashcards.handleAssessFlashcard("tidak-ada", "easy");
    });

    expect(result.current.flashcards.currentFlashcardDeck).toBe(deck);
    expect(result.current.flashcards.flashcardDecks).toEqual({});
    expect(result.current.historyItems).toBe(initialHistory);
    expect(result.current.flashcards.currentFlashcardIndexInStack).toBe(0);
    expect(result.current.flashcards.flippedFlashcardId).toBe("c1");
  });

  it("orders due cards (learning or past due) first, each group by earliest nextReview, without mutating the deck", () => {
    const { result } = setup([
      makeCard("a", { status: "reviewing", nextReview: NOW + 5 * DAY }),
      makeCard("b", { status: "known", nextReview: NOW - 2 * DAY }),
      makeCard("c", { status: "learning", nextReview: NOW + 10 * DAY }),
      makeCard("d", { status: "reviewing", nextReview: NOW + DAY }),
      makeCard("e", { status: "mastered", nextReview: NOW }),
    ]);

    expect(result.current.flashcards.sortedStackCards.map(c => c.id)).toEqual(["b", "e", "c", "d", "a"]);
    expect(result.current.flashcards.currentFlashcardDeck?.cards.map(c => c.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("counts only statuses present in the deck and updates after an assessment", () => {
    const { result } = setup([
      makeCard("c1", { status: "learning" }),
      makeCard("c2", { status: "learning" }),
      makeCard("c3", { status: "known" }),
    ]);

    expect(result.current.flashcards.flashcardStatusCounts).toEqual({ learning: 2, known: 1 });
    expect(result.current.flashcards.flashcardStatusCounts.reviewing).toBeUndefined();

    act(() => {
      result.current.flashcards.handleAssessFlashcard("c1", "easy");
    });

    expect(result.current.flashcards.flashcardStatusCounts).toEqual({ learning: 1, known: 2 });
  });
});
