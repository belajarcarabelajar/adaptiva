import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FlashcardMatchGame from './FlashcardMatchGame';
import { Flashcard, FlashcardDeck, FlashcardMatchItem } from '../../types';

// Replace the icon set with a stub so this test does not depend on the constants module internals
vi.mock('../../constants', () => ({
  Icons: {
    CheckCircle: () => null,
  },
}));

type Props = React.ComponentProps<typeof FlashcardMatchGame>;

const makeCard = (id: string, term: string, definition: string): Flashcard => ({
  id,
  term,
  definition,
  status: 'learning',
  lastReviewed: 0,
  nextReview: 0,
  difficultyLevel: 'medium',
  moduleId: 'm1',
});

const deckWith = (cards: Flashcard[]): FlashcardDeck => ({
  moduleId: 'm1',
  moduleTitle: 'Module One',
  cards,
});

const twoCardDeck = deckWith([
  makeCard('fc1', 'Photosynthesis', 'Light to energy'),
  makeCard('fc2', 'Osmosis', 'Water through membrane'),
]);

const gameItems: FlashcardMatchItem[] = [
  { id: 'term-fc1', flashcardId: 'fc1', type: 'term', text: 'Photosynthesis', isVisible: true },
  { id: 'def-fc1', flashcardId: 'fc1', type: 'definition', text: 'Light to energy', isVisible: true },
  { id: 'term-fc2', flashcardId: 'fc2', type: 'term', text: 'Osmosis', isVisible: false },
  { id: 'def-fc2', flashcardId: 'fc2', type: 'definition', text: 'Water through membrane', isVisible: false },
];

const makeProps = (overrides: Partial<Props> = {}): Props => ({
  currentFlashcardDeck: twoCardDeck,
  matchGameActive: false,
  gameIsCompleted: false,
  flashcardMatchGameItems: gameItems,
  selectedMatchItemId: null,
  matchGameTimeElapsed: 0,
  formatMatchGameTime: vi.fn((s: number) => `T${s}`),
  handleStartFlashcardMatchGame: vi.fn(),
  handleFlashcardMatchAttempt: vi.fn(),
  error: null,
  curriculumSubTab: 'flashcards',
  flashcardSubView: 'permainan',
  ...overrides,
});

describe('FlashcardMatchGame component (gap coverage)', () => {
  it('shows intro and an enabled start button when the deck has at least 2 cards', () => {
    const handleStart = vi.fn();
    render(<FlashcardMatchGame {...makeProps({ handleStartFlashcardMatchGame: handleStart })} />);

    expect(screen.getByText('Permainan Pencocokan')).toBeInTheDocument();
    expect(screen.getByText(/Cocokkan istilah dengan definisinya/)).toBeInTheDocument();
    const startBtn = screen.getByRole('button', { name: 'Mulai Permainan' });
    expect(startBtn).toBeEnabled();
    expect(screen.queryByText('Butuh minimal 2 kartu untuk bermain.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Waktu:/)).not.toBeInTheDocument();
    // Game items are not rendered before the game starts
    expect(screen.queryByRole('button', { name: 'Photosynthesis' })).not.toBeInTheDocument();

    fireEvent.click(startBtn);
    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it('disables the start button and shows the minimum-cards warning when there is no deck', () => {
    const handleStart = vi.fn();
    render(
      <FlashcardMatchGame
        {...makeProps({ currentFlashcardDeck: null, handleStartFlashcardMatchGame: handleStart })}
      />
    );

    const startBtn = screen.getByRole('button', { name: 'Mulai Permainan' });
    expect(startBtn).toBeDisabled();
    expect(screen.getByText('Butuh minimal 2 kartu untuk bermain.')).toBeInTheDocument();

    fireEvent.click(startBtn);
    expect(handleStart).not.toHaveBeenCalled();
  });

  it('disables the start button and shows the warning when the deck has only 1 card', () => {
    render(
      <FlashcardMatchGame
        {...makeProps({ currentFlashcardDeck: deckWith([makeCard('fc1', 'Only', 'One card')]) })}
      />
    );

    expect(screen.getByRole('button', { name: 'Mulai Permainan' })).toBeDisabled();
    expect(screen.getByText('Butuh minimal 2 kartu untuk bermain.')).toBeInTheDocument();
  });

  it('shows the error only on the flashcards tab with the permainan sub view', () => {
    const { rerender } = render(
      <FlashcardMatchGame {...makeProps({ error: 'Gagal memulai permainan' })} />
    );
    expect(screen.getByText('Gagal memulai permainan')).toBeInTheDocument();

    rerender(
      <FlashcardMatchGame
        {...makeProps({ error: 'Gagal memulai permainan', flashcardSubView: 'tumpukan' })}
      />
    );
    expect(screen.queryByText('Gagal memulai permainan')).not.toBeInTheDocument();

    rerender(
      <FlashcardMatchGame
        {...makeProps({ error: 'Gagal memulai permainan', curriculumSubTab: 'quiz' })}
      />
    );
    expect(screen.queryByText('Gagal memulai permainan')).not.toBeInTheDocument();
  });

  it('renders the timer and only visible items while active, and reports the clicked item id', () => {
    const formatTime = vi.fn((s: number) => (s === 65 ? '01:05' : 'other'));
    const handleAttempt = vi.fn();
    render(
      <FlashcardMatchGame
        {...makeProps({
          matchGameActive: true,
          matchGameTimeElapsed: 65,
          formatMatchGameTime: formatTime,
          handleFlashcardMatchAttempt: handleAttempt,
        })}
      />
    );

    expect(formatTime).toHaveBeenCalledWith(65);
    expect(screen.getByText('Waktu: 01:05')).toBeInTheDocument();
    // Intro and start button are hidden during the game
    expect(screen.queryByText(/Cocokkan istilah dengan definisinya/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mulai Permainan' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Photosynthesis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light to energy' })).toBeInTheDocument();
    // Items with isVisible false (already matched) are not rendered
    expect(screen.queryByText('Osmosis')).not.toBeInTheDocument();
    expect(screen.queryByText('Water through membrane')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Light to energy' }));
    expect(handleAttempt).toHaveBeenCalledTimes(1);
    expect(handleAttempt).toHaveBeenCalledWith('def-fc1');
  });

  it('highlights only the selected item', () => {
    render(
      <FlashcardMatchGame
        {...makeProps({ matchGameActive: true, selectedMatchItemId: 'term-fc1' })}
      />
    );

    const selected = screen.getByRole('button', { name: 'Photosynthesis' });
    const notSelected = screen.getByRole('button', { name: 'Light to energy' });
    expect(selected.className).toContain('border-brand-yellow');
    expect(selected.className).toContain('scale-105');
    expect(notSelected.className).not.toContain('border-brand-yellow');
    expect(notSelected.className).toContain('border-brand-mediumGray');
  });

  it('shows the completion panel with elapsed time and a replay button when the game is completed', () => {
    const handleStart = vi.fn();
    const formatTime = vi.fn((s: number) => (s === 42 ? '00:42' : 'other'));
    render(
      <FlashcardMatchGame
        {...makeProps({
          gameIsCompleted: true,
          matchGameTimeElapsed: 42,
          formatMatchGameTime: formatTime,
          handleStartFlashcardMatchGame: handleStart,
        })}
      />
    );

    expect(screen.getByText('Selamat! Semua pasangan berhasil dicocokkan!')).toBeInTheDocument();
    expect(screen.getByText('Waktu Pengerjaan: 00:42')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mulai Permainan' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cocokkan istilah dengan definisinya/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photosynthesis' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Main Lagi' }));
    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it('hides the item grid but keeps the timer when active and completed at the same time', () => {
    render(
      <FlashcardMatchGame
        {...makeProps({
          matchGameActive: true,
          gameIsCompleted: true,
          matchGameTimeElapsed: 7,
        })}
      />
    );

    expect(screen.getByText('Waktu: T7')).toBeInTheDocument();
    expect(screen.getByText('Waktu Pengerjaan: T7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Main Lagi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photosynthesis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Light to energy' })).not.toBeInTheDocument();
  });
});
