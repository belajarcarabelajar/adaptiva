import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FlashcardView from './FlashcardView';
import type { useFlashcards } from '../../hooks/useFlashcards';
import type { Flashcard, FlashcardDeck, FlashcardMatchItem } from '../../types';

type FlashcardsState = ReturnType<typeof useFlashcards>;

// Spies shared with the vi.mock factories (hoisted above imports).
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  stack: vi.fn(),
  game: vi.fn(),
  modal: vi.fn(),
  lightBulb: vi.fn(),
  loadingIcon: vi.fn(),
  sparklesIcon: vi.fn(),
}));

// The hook is faked so the view test stays hermetic (no Gemini service, no auth fetch).
vi.mock('../../hooks/useFlashcards', () => ({ useFlashcards: vi.fn() }));

// Child views are replaced by spies that record the props they receive.
vi.mock('./FlashcardList', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.list(props);
    return null;
  },
}));
vi.mock('./FlashcardStack', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.stack(props);
    return null;
  },
}));
vi.mock('./FlashcardMatchGame', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.game(props);
    return null;
  },
}));
vi.mock('./FlashcardModal', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.modal(props);
    return null;
  },
}));

vi.mock('../../constants', () => ({
  Icons: {
    LightBulb: () => {
      mocks.lightBulb();
      return null;
    },
    QueueListIcon: () => null,
    RectangleStackIcon: () => null,
    PuzzlePieceIcon: () => null,
    LoadingAnimatedIcon: () => {
      mocks.loadingIcon();
      return null;
    },
    Sparkles: () => {
      mocks.sparklesIcon();
      return null;
    },
  },
}));

const lastProps = (m: { mock: { lastCall?: unknown[] } }): Record<string, unknown> =>
  (m.mock.lastCall?.[0] ?? {}) as Record<string, unknown>;

const sampleCard: Flashcard = {
  id: 'fc-1',
  term: 'Klorofil',
  definition: 'Pigmen hijau pada tumbuhan',
  status: 'learning',
  lastReviewed: 0,
  nextReview: 0,
  difficultyLevel: 'medium',
  moduleId: 'Fotosintesis',
};

const sampleDeck: FlashcardDeck = {
  moduleId: 'Fotosintesis',
  moduleTitle: 'Fotosintesis',
  cards: [sampleCard],
};

const matchItem = (id: string, type: 'term' | 'definition', isVisible: boolean): FlashcardMatchItem => ({
  id,
  flashcardId: 'fc-1',
  type,
  text: type === 'term' ? 'Klorofil' : 'Pigmen hijau pada tumbuhan',
  isVisible,
});

function makeFlashcards(overrides: Partial<FlashcardsState> = {}): FlashcardsState {
  const base: FlashcardsState = {
    activeFlashcardModuleInfo: { title: 'Fotosintesis', moduleMaterial: 'Materi tentang fotosintesis' },
    setActiveFlashcardModuleInfo: vi.fn(),
    flashcardDecks: {},
    setFlashcardDecks: vi.fn(),
    currentFlashcardDeck: sampleDeck,
    setCurrentFlashcardDeck: vi.fn(),
    flashcardSubView: 'daftar',
    setFlashcardSubView: vi.fn(),
    currentFlashcardIndexInStack: 0,
    setCurrentFlashcardIndexInStack: vi.fn(),
    isGeneratingFlashcards: false,
    setIsGeneratingFlashcards: vi.fn(),
    showAddFlashcardModal: false,
    setShowAddFlashcardModal: vi.fn(),
    flashcardFormState: { term: '', definition: '' },
    setFlashcardFormState: vi.fn(),
    editingFlashcardId: null,
    setEditingFlashcardId: vi.fn(),
    flippedFlashcardId: null,
    setFlippedFlashcardId: vi.fn(),
    flashcardMatchGameItems: [],
    setFlashcardMatchGameItems: vi.fn(),
    selectedMatchItemId: null,
    setSelectedMatchItemId: vi.fn(),
    matchGameActive: false,
    setMatchGameActive: vi.fn(),
    matchGameStartTime: null,
    setMatchGameStartTime: vi.fn(),
    matchGameTimeElapsed: 0,
    setMatchGameTimeElapsed: vi.fn(),
    matchGameTimerIntervalIdRef: { current: null },
    handleOpenAddFlashcardModal: vi.fn(),
    handleSaveFlashcard: vi.fn(),
    handleDeleteFlashcard: vi.fn(),
    handleAssessFlashcard: vi.fn(),
    handleStartFlashcardMatchGame: vi.fn(),
    handleFlashcardMatchAttempt: vi.fn(),
    handleGenerateFlashcards: vi.fn(),
    formatMatchGameTime: vi.fn(),
    sortedStackCards: [sampleCard],
    flashcardStatusCounts: { learning: 1, reviewing: 0, known: 0, mastered: 0 },
  };
  return { ...base, ...overrides };
}

function setup(
  state: Partial<FlashcardsState> = {},
  opts: { error?: string | null; curriculumSubTab?: string; targetLanguage?: string } = {}
) {
  const flashcards = makeFlashcards(state);
  const props = {
    flashcards,
    setCurriculumSubTab: vi.fn(),
    curriculumSubTab: opts.curriculumSubTab ?? 'flashcards',
    targetLanguage: opts.targetLanguage ?? 'Bahasa Indonesia',
    setIsAuthModalOpen: vi.fn(),
    setIsPointsModalOpen: vi.fn(),
    setPointsModalInfo: vi.fn(),
    error: opts.error ?? null,
  };
  render(<FlashcardView {...props} />);
  return { props, flashcards };
}

describe('FlashcardView component (gap coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state without an active module', () => {
    it('renders the guidance message and no deck UI when activeFlashcardModuleInfo is null', () => {
      setup({ activeFlashcardModuleInfo: null });

      expect(screen.getByRole('heading', { name: 'Flashcards' })).toBeInTheDocument();
      expect(
        screen.getByText('Ensure the module material is loaded before generating flashcards.')
      ).toBeInTheDocument();
      expect(mocks.lightBulb).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /Generate AI Flashcards/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Daftar' })).not.toBeInTheDocument();
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.stack).not.toHaveBeenCalled();
      expect(mocks.game).not.toHaveBeenCalled();
      expect(mocks.modal).not.toHaveBeenCalled();
    });

    it('navigates to the material and study_log sub tabs from the inline links', () => {
      const { props } = setup({ activeFlashcardModuleInfo: null });

      fireEvent.click(screen.getByRole('button', { name: 'Material' }));
      expect(props.setCurriculumSubTab).toHaveBeenLastCalledWith('material');

      fireEvent.click(screen.getByRole('button', { name: 'Study Log' }));
      expect(props.setCurriculumSubTab).toHaveBeenLastCalledWith('study_log');
      expect(props.setCurriculumSubTab).toHaveBeenCalledTimes(2);
    });
  });

  describe('header and generate button', () => {
    it('shows the active module title in the heading', () => {
      setup();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Flashcards for: Fotosintesis');
    });

    it('calls handleGenerateFlashcards with the target language and modal callbacks', () => {
      const { props, flashcards } = setup({}, { targetLanguage: 'English' });

      const button = screen.getByRole('button', { name: /Generate AI Flashcards/i });
      expect(button).not.toBeDisabled();
      expect(mocks.sparklesIcon).toHaveBeenCalled();
      expect(mocks.loadingIcon).not.toHaveBeenCalled();

      fireEvent.click(button);

      expect(flashcards.handleGenerateFlashcards).toHaveBeenCalledTimes(1);
      expect(flashcards.handleGenerateFlashcards).toHaveBeenCalledWith(
        'English',
        props.setIsAuthModalOpen,
        props.setIsPointsModalOpen,
        props.setPointsModalInfo
      );
    });

    it('disables the generate button and shows the loading icon while generating', () => {
      const { flashcards } = setup({ isGeneratingFlashcards: true });

      const button = screen.getByRole('button', { name: /Generate AI Flashcards/i });
      expect(button).toBeDisabled();
      expect(mocks.loadingIcon).toHaveBeenCalled();
      expect(mocks.sparklesIcon).not.toHaveBeenCalled();

      fireEvent.click(button);
      expect(flashcards.handleGenerateFlashcards).not.toHaveBeenCalled();
    });
  });

  describe('sub view tabs', () => {
    it('calls setFlashcardSubView with the matching sub view name for each tab', () => {
      const { flashcards } = setup();

      fireEvent.click(screen.getByRole('button', { name: 'Tumpukan' }));
      expect(flashcards.setFlashcardSubView).toHaveBeenLastCalledWith('tumpukan');

      fireEvent.click(screen.getByRole('button', { name: 'Permainan' }));
      expect(flashcards.setFlashcardSubView).toHaveBeenLastCalledWith('permainan');

      fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
      expect(flashcards.setFlashcardSubView).toHaveBeenLastCalledWith('daftar');
    });

    it('highlights only the active sub view tab', () => {
      setup({ flashcardSubView: 'tumpukan' });

      expect(screen.getByRole('button', { name: 'Tumpukan' })).toHaveClass('bg-brand-orange');
      expect(screen.getByRole('button', { name: 'Daftar' })).not.toHaveClass('bg-brand-orange');
      expect(screen.getByRole('button', { name: 'Permainan' })).not.toHaveClass('bg-brand-orange');
    });
  });

  describe('sub view rendering', () => {
    it('renders only FlashcardList in the daftar view and passes deck and handlers', () => {
      const { flashcards } = setup({ flashcardSubView: 'daftar' });

      expect(mocks.list).toHaveBeenCalled();
      expect(mocks.stack).not.toHaveBeenCalled();
      expect(mocks.game).not.toHaveBeenCalled();

      const p = lastProps(mocks.list);
      expect(p.currentFlashcardDeck).toBe(sampleDeck);
      expect(p.handleOpenAddFlashcardModal).toBe(flashcards.handleOpenAddFlashcardModal);
      expect(p.handleDeleteFlashcard).toBe(flashcards.handleDeleteFlashcard);
    });

    it('renders only FlashcardStack in the tumpukan view and passes stack state through', () => {
      const counts = { learning: 0, reviewing: 1, known: 0, mastered: 0 };
      const { flashcards } = setup({
        flashcardSubView: 'tumpukan',
        currentFlashcardIndexInStack: 2,
        flippedFlashcardId: 'fc-1',
        flashcardStatusCounts: counts,
      });

      expect(mocks.stack).toHaveBeenCalled();
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.game).not.toHaveBeenCalled();

      const p = lastProps(mocks.stack);
      expect(p.currentFlashcardDeck).toBe(sampleDeck);
      expect(p.sortedStackCards).toBe(flashcards.sortedStackCards);
      expect(p.currentFlashcardIndexInStack).toBe(2);
      expect(p.flippedFlashcardId).toBe('fc-1');
      expect(p.setFlippedFlashcardId).toBe(flashcards.setFlippedFlashcardId);
      expect(p.handleAssessFlashcard).toBe(flashcards.handleAssessFlashcard);
      expect(p.setCurrentFlashcardIndexInStack).toBe(flashcards.setCurrentFlashcardIndexInStack);
      expect(p.flashcardStatusCounts).toBe(counts);
    });

    it('renders only FlashcardMatchGame in the permainan view and passes game state through', () => {
      const items = [matchItem('term-fc-1', 'term', true), matchItem('def-fc-1', 'definition', true)];
      const { flashcards } = setup(
        {
          flashcardSubView: 'permainan',
          matchGameActive: true,
          flashcardMatchGameItems: items,
          selectedMatchItemId: 'term-fc-1',
          matchGameTimeElapsed: 42,
        },
        { error: 'Gagal memulai permainan', curriculumSubTab: 'flashcards' }
      );

      expect(mocks.game).toHaveBeenCalled();
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.stack).not.toHaveBeenCalled();

      const p = lastProps(mocks.game);
      expect(p.currentFlashcardDeck).toBe(sampleDeck);
      expect(p.matchGameActive).toBe(true);
      expect(p.flashcardMatchGameItems).toBe(items);
      expect(p.selectedMatchItemId).toBe('term-fc-1');
      expect(p.matchGameTimeElapsed).toBe(42);
      expect(p.formatMatchGameTime).toBe(flashcards.formatMatchGameTime);
      expect(p.handleStartFlashcardMatchGame).toBe(flashcards.handleStartFlashcardMatchGame);
      expect(p.handleFlashcardMatchAttempt).toBe(flashcards.handleFlashcardMatchAttempt);
      expect(p.error).toBe('Gagal memulai permainan');
      expect(p.curriculumSubTab).toBe('flashcards');
      expect(p.flashcardSubView).toBe('permainan');
    });
  });

  describe('gameIsCompleted derivation', () => {
    const cases: Array<{ label: string; active: boolean; items: FlashcardMatchItem[]; expected: boolean }> = [
      {
        label: 'is true when the game is inactive and every item is hidden',
        active: false,
        items: [matchItem('term-fc-1', 'term', false), matchItem('def-fc-1', 'definition', false)],
        expected: true,
      },
      {
        label: 'is false while the game is still active even if every item is hidden',
        active: true,
        items: [matchItem('term-fc-1', 'term', false), matchItem('def-fc-1', 'definition', false)],
        expected: false,
      },
      {
        label: 'is false when there are no game items',
        active: false,
        items: [],
        expected: false,
      },
      {
        label: 'is false when some items are still visible',
        active: false,
        items: [matchItem('term-fc-1', 'term', false), matchItem('def-fc-1', 'definition', true)],
        expected: false,
      },
    ];

    for (const c of cases) {
      it(c.label, () => {
        setup({ flashcardSubView: 'permainan', matchGameActive: c.active, flashcardMatchGameItems: c.items });
        expect(lastProps(mocks.game).gameIsCompleted).toBe(c.expected);
      });
    }
  });

  describe('error message', () => {
    it('shows the error in the daftar view when the flashcards curriculum tab is active', () => {
      setup({ flashcardSubView: 'daftar' }, { error: 'Gagal memuat kartu', curriculumSubTab: 'flashcards' });
      expect(screen.getByText('Gagal memuat kartu')).toBeInTheDocument();
    });

    it('shows the error in the tumpukan view as well', () => {
      setup({ flashcardSubView: 'tumpukan' }, { error: 'Gagal memuat kartu', curriculumSubTab: 'flashcards' });
      expect(screen.getByText('Gagal memuat kartu')).toBeInTheDocument();
    });

    it('hides the error when another curriculum sub tab is active', () => {
      setup({ flashcardSubView: 'daftar' }, { error: 'Gagal memuat kartu', curriculumSubTab: 'material' });
      expect(screen.queryByText('Gagal memuat kartu')).not.toBeInTheDocument();
    });

    it('does not render the error paragraph itself in the permainan view', () => {
      setup({ flashcardSubView: 'permainan' }, { error: 'Gagal memuat kartu', curriculumSubTab: 'flashcards' });
      expect(screen.queryByText('Gagal memuat kartu')).not.toBeInTheDocument();
      expect(lastProps(mocks.game).error).toBe('Gagal memuat kartu');
    });
  });

  describe('FlashcardModal wiring', () => {
    it('passes modal state and a boolean deck flag when a deck exists', () => {
      const formState = { term: 'Klorofil', definition: 'Pigmen hijau pada tumbuhan' };
      const { flashcards } = setup({
        showAddFlashcardModal: true,
        editingFlashcardId: 'fc-1',
        flashcardFormState: formState,
      });

      expect(mocks.modal).toHaveBeenCalled();
      const p = lastProps(mocks.modal);
      expect(p.showAddFlashcardModal).toBe(true);
      expect(p.currentFlashcardDeck).toBe(true);
      expect(p.editingFlashcardId).toBe('fc-1');
      expect(p.flashcardFormState).toBe(formState);
      expect(p.setFlashcardFormState).toBe(flashcards.setFlashcardFormState);
      expect(p.setShowAddFlashcardModal).toBe(flashcards.setShowAddFlashcardModal);
      expect(p.handleSaveFlashcard).toBe(flashcards.handleSaveFlashcard);
    });

    it('passes currentFlashcardDeck as false when there is no deck, in any sub view', () => {
      setup({ currentFlashcardDeck: null, flashcardSubView: 'permainan' });

      expect(mocks.modal).toHaveBeenCalled();
      expect(lastProps(mocks.modal).currentFlashcardDeck).toBe(false);
      expect(lastProps(mocks.game).currentFlashcardDeck).toBeNull();
    });
  });
});
