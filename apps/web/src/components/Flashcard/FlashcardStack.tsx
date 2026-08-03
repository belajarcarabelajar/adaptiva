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
  flashcardStats: Record<FlashcardStatus, number>;
}

const FlashcardStack: React.FC<FlashcardStackProps> = ({
  currentFlashcardDeck,
  sortedStackCards,
  currentFlashcardIndexInStack,
  flippedFlashcardId,
  setFlippedFlashcardId,
  handleAssessFlashcard,
  setCurrentFlashcardIndexInStack,
  flashcardStats
}) => {
  const currentCardInStack = sortedStackCards[currentFlashcardIndexInStack];

  return (
    <div className="mt-4 flex flex-col items-center">
        {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && currentCardInStack ? (
            <div className="w-full max-w-2xl">
                 <div className="mb-4 flex justify-center space-x-4 text-sm font-medium">
                    <span className="text-brand-orange dark:text-orange-400">Belajar: {flashcardStats.learning || 0}</span>
                    <span className="text-brand-blue dark:text-blue-400">Ulang: {flashcardStats.reviewing || 0}</span>
                    <span className="text-brand-green dark:text-green-400">Paham: {(flashcardStats.known || 0) + (flashcardStats.mastered || 0)}</span>
                </div>
                <div
                    className={`min-h-[250px] md:min-h-[300px] w-full p-6 md:p-10 flex flex-col items-center justify-center text-center cursor-pointer rounded-xl border-2 transition-all duration-300 transform perspective-1000
                        ${flippedFlashcardId === currentCardInStack.id
                            ? 'bg-brand-lightGray dark:bg-gray-700 border-brand-blue dark:border-blue-500 shadow-inner rotate-y-180'
                            : 'bg-brand-white dark:bg-brand-black border-brand-mediumGray dark:border-gray-600 shadow-lg hover:shadow-xl hover:-translate-y-1'}`}
                    onClick={() => setFlippedFlashcardId(prev => prev === currentCardInStack.id ? null : currentCardInStack.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={flippedFlashcardId === currentCardInStack.id}
                    aria-label={`Flashcard: ${flippedFlashcardId === currentCardInStack.id ? 'Showing definition for' : 'Showing term'} ${currentCardInStack.term}. Click to flip.`}
                >
                    <div className={`text-2xl md:text-3xl lg:text-4xl font-medium ${flippedFlashcardId === currentCardInStack.id ? 'text-brand-black/90 dark:text-gray-100 rotate-y-180' : 'text-brand-blue dark:text-blue-300'}`}>
                        {flippedFlashcardId === currentCardInStack.id ? currentCardInStack.definition : currentCardInStack.term}
                    </div>
                    <div className="mt-6 text-sm text-brand-black/50 dark:text-gray-500 rotate-y-180">Klik kartu untuk membalik</div>
                    {flippedFlashcardId === currentCardInStack.id && (
                        <div className="mt-8 flex justify-center gap-4 rotate-y-180" onClick={e => e.stopPropagation()}>
                            <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'hard');}} className="p-3 rounded-full hover:bg-brand-red/20 text-brand-red dark:text-red-400" title="Sulit/Tidak Paham"><Icons.FaceFrownIcon className="w-8 h-8" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'medium');}} className="p-3 rounded-full hover:bg-brand-yellow/20 text-brand-yellow dark:text-yellow-400" title="Cukup Paham"><Icons.FaceMehIcon className="w-8 h-8" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'easy');}} className="p-3 rounded-full hover:bg-brand-green/20 text-brand-green dark:text-green-400" title="Mudah/Sudah Paham"><Icons.FaceSmileIcon className="w-8 h-8" /></button>
                        </div>
                    )}
                </div>

                {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && sortedStackCards.length > 0 && (
                    <div className="mt-6 flex justify-between items-center px-4">
                        <button
                            onClick={() => setCurrentFlashcardIndexInStack(prev => (prev - 1 + sortedStackCards.length) % sortedStackCards.length)}
                            className="p-2 text-brand-blue hover:text-brand-orange dark:text-blue-300 dark:hover:text-orange-400 disabled:opacity-50"
                        >
                            <span>Prev</span>
                        </button>
                        <span className="text-sm font-medium text-brand-black/60 dark:text-gray-400">
                            Card {currentFlashcardIndexInStack + 1} of {sortedStackCards.length} (Sorted for Review)
                        </span>
                        <button
                            onClick={() => setCurrentFlashcardIndexInStack(prev => (prev + 1) % sortedStackCards.length)}
                            className="p-2 text-brand-blue hover:text-brand-orange dark:text-blue-300 dark:hover:text-orange-400 disabled:opacity-50"
                        >
                            <span>Next</span>
                        </button>
                    </div>
                )}
            </div>
        ) : (
             <p className="text-brand-black/70 dark:text-gray-400 italic mt-4 text-center">Belum ada kartu di deck ini. Silakan generate dari AI atau tambah manual.</p>
        )}
    </div>
  );
};

export default FlashcardStack;
