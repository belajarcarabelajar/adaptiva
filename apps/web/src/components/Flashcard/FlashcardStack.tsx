import React from 'react';
import { FlashcardDeck, Flashcard, FlashcardDifficulty, FlashcardStatus } from '../../types';
import { Icons } from '../../constants';

interface FlashcardStackProps {
  currentFlashcardDeck: FlashcardDeck | null;
  sortedStackCards: Flashcard[];
  currentFlashcardIndexInStack: number;
  flippedFlashcardId: string | null;
  setFlippedFlashcardId: React.Dispatch<React.SetStateAction<string | null>>;
  handleAssessFlashcard: (cardId: string, difficulty: FlashcardDifficulty) => void;
  setCurrentFlashcardIndexInStack: React.Dispatch<React.SetStateAction<number>>;
  flashcardStatusCounts: Record<FlashcardStatus, number>;
}

const FlashcardStack: React.FC<FlashcardStackProps> = ({
  currentFlashcardDeck,
  sortedStackCards,
  currentFlashcardIndexInStack,
  flippedFlashcardId,
  setFlippedFlashcardId,
  handleAssessFlashcard,
  setCurrentFlashcardIndexInStack,
  flashcardStatusCounts,
}) => {
  const currentCardInStack = sortedStackCards[currentFlashcardIndexInStack];

  return (
    <div>
      <div className="flex justify-around mb-4 text-center text-sm">
        <div><span className="font-bold text-brand-blue dark:text-blue-400">{flashcardStatusCounts.learning || 0}</span> Belajar</div>
        <div><span className="font-bold text-brand-orange dark:text-orange-400">{flashcardStatusCounts.reviewing || 0}</span> Mengulang</div>
        <div><span className="font-bold text-brand-yellow dark:text-yellow-400">{flashcardStatusCounts.known || 0}</span> Diketahui</div>
        <div><span className="font-bold text-brand-green dark:text-green-400">{flashcardStatusCounts.mastered || 0}</span> Dikuasai</div>
      </div>
      {currentCardInStack ? (
        <div
          className="p-4 md:p-6 bg-brand-lightGray dark:bg-gray-700 rounded-lg shadow-lg min-h-[200px] flex flex-col justify-center items-center text-center relative cursor-pointer hover:bg-brand-mediumGray dark:hover:bg-gray-600 transition-colors duration-150"
          onClick={() => setFlippedFlashcardId(prev => prev === currentCardInStack.id ? null : currentCardInStack.id)}
          role="button"
          tabIndex={0}
          aria-pressed={flippedFlashcardId === currentCardInStack.id}
          aria-label={`Flashcard: ${flippedFlashcardId === currentCardInStack.id ? 'Showing definition for' : 'Showing term'} ${currentCardInStack.term}. Click to flip.`}
        >
          <p className="text-xl md:text-2xl font-semibold text-brand-black dark:text-gray-100 mb-4 select-none">
            {flippedFlashcardId === currentCardInStack.id ? currentCardInStack.definition : currentCardInStack.term}
          </p>

          {flippedFlashcardId === currentCardInStack.id && (
            <div className="mt-6 flex justify-around w-full max-w-xs">
              <button
                onClick={e => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'hard'); }}
                className="p-3 rounded-full hover:bg-brand-red/20 text-brand-red dark:text-red-400"
                title="Sulit/Tidak Paham"
              >
                <Icons.FaceFrownIcon className="w-8 h-8" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'medium'); }}
                className="p-3 rounded-full hover:bg-brand-yellow/20 text-brand-yellow dark:text-yellow-400"
                title="Cukup Paham"
              >
                <Icons.FaceMehIcon className="w-8 h-8" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'easy'); }}
                className="p-3 rounded-full hover:bg-brand-green/20 text-brand-green dark:text-green-400"
                title="Mudah/Sudah Paham"
              >
                <Icons.FaceSmileIcon className="w-8 h-8" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-brand-black/70 dark:text-gray-400 text-center py-10">
          No cards due for review or in learning stack. Add more cards or wait for scheduled reviews!
        </p>
      )}
      {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && sortedStackCards.length > 0 && (
        <div className="mt-4 flex justify-between">
          <button
            onClick={() => setCurrentFlashcardIndexInStack(prev => (prev - 1 + sortedStackCards.length) % sortedStackCards.length)}
            className="px-4 py-2 bg-brand-blue text-brand-white rounded-md text-sm font-semibold"
            disabled={sortedStackCards.length <= 1}
          >
            Previous
          </button>
          <span className="text-sm text-brand-black/70 dark:text-gray-400 self-center">
            Card {currentFlashcardIndexInStack + 1} of {sortedStackCards.length} (Sorted for Review)
          </span>
          <button
            onClick={() => setCurrentFlashcardIndexInStack(prev => (prev + 1) % sortedStackCards.length)}
            className="px-4 py-2 bg-brand-blue text-brand-white rounded-md text-sm font-semibold"
            disabled={sortedStackCards.length <= 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default FlashcardStack;
