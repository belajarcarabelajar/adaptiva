import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FlashcardStack from './FlashcardStack';
import { Flashcard, FlashcardDeck, FlashcardDifficulty, FlashcardStatus } from '../../types';

// Icons are replaced with empty components so the test does not depend on the contents of constants.
vi.mock('../../constants', () => ({
  Icons: {
    FaceFrownIcon: () => null,
    FaceMehIcon: () => null,
    FaceSmileIcon: () => null,
  },
}));

const makeCard = (id: string, term: string, definition: string): Flashcard => ({
  id,
  term,
  definition,
  status: 'learning',
  lastReviewed: 0,
  nextReview: 0,
  difficultyLevel: 'medium',
  moduleId: 'mod-1',
});

const makeDeck = (cards: Flashcard[]): FlashcardDeck => ({
  moduleId: 'mod-1',
  moduleTitle: 'Biologi Dasar',
  cards,
});

const zeroCounts: Record<FlashcardStatus, number> = {
  learning: 0,
  reviewing: 0,
  known: 0,
  mastered: 0,
};

const cardA = makeCard('c1', 'Fotosintesis', 'Proses tumbuhan membuat makanan dari cahaya');
const cardB = makeCard('c2', 'Mitokondria', 'Pembangkit energi sel');
const cardC = makeCard('c3', 'Ribosom', 'Tempat sintesis protein');

interface StatefulProps {
  cards: Flashcard[];
  deck?: FlashcardDeck | null;
  initialIndex?: number;
  initialFlipped?: string | null;
  onAssess?: (cardId: string, difficulty: FlashcardDifficulty) => void;
  counts?: Record<FlashcardStatus, number>;
}

// Wrapper with real state so flipping and navigation can be observed through the DOM.
function StatefulStack({
  cards,
  deck,
  initialIndex = 0,
  initialFlipped = null,
  onAssess = () => {},
  counts = zeroCounts,
}: StatefulProps) {
  const [index, setIndex] = useState<number>(initialIndex);
  const [flipped, setFlipped] = useState<string | null>(initialFlipped);
  return (
    <FlashcardStack
      currentFlashcardDeck={deck === undefined ? makeDeck(cards) : deck}
      sortedStackCards={cards}
      currentFlashcardIndexInStack={index}
      flippedFlashcardId={flipped}
      setFlippedFlashcardId={setFlipped}
      handleAssessFlashcard={onAssess}
      setCurrentFlashcardIndexInStack={setIndex}
      flashcardStatusCounts={counts}
    />
  );
}

describe('FlashcardStack component', () => {
  it('renders each status count next to its label', () => {
    render(
      <StatefulStack
        cards={[cardA]}
        counts={{ learning: 2, reviewing: 1, known: 3, mastered: 4 }}
      />
    );

    expect(screen.getByText('Belajar').textContent).toBe('2 Belajar');
    expect(screen.getByText('Mengulang').textContent).toBe('1 Mengulang');
    expect(screen.getByText('Diketahui').textContent).toBe('3 Diketahui');
    expect(screen.getByText('Dikuasai').textContent).toBe('4 Dikuasai');
  });

  it('falls back to 0 for status counts that are missing', () => {
    render(
      <StatefulStack
        cards={[cardA]}
        counts={{} as Record<FlashcardStatus, number>}
      />
    );

    expect(screen.getByText('Belajar').textContent).toBe('0 Belajar');
    expect(screen.getByText('Mengulang').textContent).toBe('0 Mengulang');
    expect(screen.getByText('Diketahui').textContent).toBe('0 Diketahui');
    expect(screen.getByText('Dikuasai').textContent).toBe('0 Dikuasai');
  });

  it('shows the empty message and no controls when the sorted stack is empty', () => {
    render(<StatefulStack cards={[]} deck={makeDeck([cardA])} />);

    expect(screen.getByText(/No cards due for review or in learning stack/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the term first, unpressed, without assessment buttons', () => {
    render(<StatefulStack cards={[cardA, cardB]} />);

    const card = screen.getByRole('button', {
      name: 'Flashcard: Showing term Fotosintesis. Click to flip.',
    });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Fotosintesis')).toBeInTheDocument();
    expect(screen.queryByText(cardA.definition)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Sulit/Tidak Paham')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Cukup Paham')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mudah/Sudah Paham')).not.toBeInTheDocument();
  });

  it('flips to the definition on click and back to the term on a second click', () => {
    render(<StatefulStack cards={[cardA, cardB]} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Flashcard: Showing term Fotosintesis. Click to flip.' })
    );

    const flippedCard = screen.getByRole('button', {
      name: 'Flashcard: Showing definition for Fotosintesis. Click to flip.',
    });
    expect(flippedCard).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(cardA.definition)).toBeInTheDocument();
    expect(screen.queryByText('Fotosintesis')).not.toBeInTheDocument();
    expect(screen.getByTitle('Sulit/Tidak Paham')).toBeInTheDocument();
    expect(screen.getByTitle('Cukup Paham')).toBeInTheDocument();
    expect(screen.getByTitle('Mudah/Sudah Paham')).toBeInTheDocument();

    fireEvent.click(flippedCard);

    expect(
      screen.getByRole('button', { name: 'Flashcard: Showing term Fotosintesis. Click to flip.' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Fotosintesis')).toBeInTheDocument();
    expect(screen.queryByTitle('Sulit/Tidak Paham')).not.toBeInTheDocument();
  });

  it.each([
    { title: 'Sulit/Tidak Paham', difficulty: 'hard' as FlashcardDifficulty },
    { title: 'Cukup Paham', difficulty: 'medium' as FlashcardDifficulty },
    { title: 'Mudah/Sudah Paham', difficulty: 'easy' as FlashcardDifficulty },
  ])('assesses the current card as $difficulty via "$title" without flipping it back', ({ title, difficulty }) => {
    const onAssess = vi.fn();
    render(<StatefulStack cards={[cardA, cardB]} initialFlipped="c1" onAssess={onAssess} />);

    fireEvent.click(screen.getByTitle(title));

    expect(onAssess).toHaveBeenCalledTimes(1);
    expect(onAssess).toHaveBeenCalledWith('c1', difficulty);
    // stopPropagation: the card stays on the definition side
    expect(screen.getByText(cardA.definition)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Flashcard: Showing definition for Fotosintesis. Click to flip.' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves forward with Next and wraps from the last card to the first', () => {
    render(<StatefulStack cards={[cardA, cardB, cardC]} />);

    expect(screen.getByText('Card 1 of 3 (Sorted for Review)')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(next);
    expect(screen.getByText('Card 2 of 3 (Sorted for Review)')).toBeInTheDocument();
    expect(screen.getByText('Mitokondria')).toBeInTheDocument();

    fireEvent.click(next);
    expect(screen.getByText('Card 3 of 3 (Sorted for Review)')).toBeInTheDocument();
    expect(screen.getByText('Ribosom')).toBeInTheDocument();

    fireEvent.click(next);
    expect(screen.getByText('Card 1 of 3 (Sorted for Review)')).toBeInTheDocument();
    expect(screen.getByText('Fotosintesis')).toBeInTheDocument();
  });

  it('moves backward with Previous and wraps from the first card to the last', () => {
    render(<StatefulStack cards={[cardA, cardB, cardC]} />);

    const previous = screen.getByRole('button', { name: 'Previous' });
    fireEvent.click(previous);
    expect(screen.getByText('Card 3 of 3 (Sorted for Review)')).toBeInTheDocument();
    expect(screen.getByText('Ribosom')).toBeInTheDocument();

    fireEvent.click(previous);
    expect(screen.getByText('Card 2 of 3 (Sorted for Review)')).toBeInTheDocument();
    expect(screen.getByText('Mitokondria')).toBeInTheDocument();
  });

  it('shows the term of the next card after navigating away from a flipped card', () => {
    render(<StatefulStack cards={[cardA, cardB]} initialFlipped="c1" />);

    expect(screen.getByText(cardA.definition)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      screen.getByRole('button', { name: 'Flashcard: Showing term Mitokondria. Click to flip.' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(cardB.definition)).not.toBeInTheDocument();
  });

  it('disables Previous and Next when only one card is in the stack', () => {
    render(<StatefulStack cards={[cardA]} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Card 1 of 1 (Sorted for Review)')).toBeInTheDocument();
  });

  it('hides navigation when there is no deck but still shows the current card', () => {
    render(<StatefulStack cards={[cardA, cardB]} deck={null} />);

    expect(screen.getByText('Fotosintesis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sorted for Review/)).not.toBeInTheDocument();
  });

  it('hides navigation when the deck has no cards', () => {
    render(<StatefulStack cards={[cardA, cardB]} deck={makeDeck([])} />);

    expect(screen.getByText('Fotosintesis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});
