import React from 'react';
import { FlashcardDeck, Flashcard } from '../../types';
import { Icons } from '../../constants';

interface FlashcardListProps {
  currentFlashcardDeck: FlashcardDeck | null;
  handleOpenAddFlashcardModal: (card?: Flashcard) => void;
  handleDeleteFlashcard: (cardId: string) => void;
}

const FlashcardList: React.FC<FlashcardListProps> = ({
  currentFlashcardDeck,
  handleOpenAddFlashcardModal,
  handleDeleteFlashcard,
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300">
          Daftar Kartu ({currentFlashcardDeck?.cards?.length || 0})
        </h3>
        <button
          onClick={() => handleOpenAddFlashcardModal()}
          className="px-3 py-1.5 bg-brand-blue hover:bg-blue-700 text-brand-white text-sm font-semibold rounded-md flex items-center"
        >
          <Icons.PlusIcon className="w-4 h-4 mr-1" /> Tambah Kartu
        </button>
      </div>
      {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 ? (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-600">
          {currentFlashcardDeck.cards.map(card => (
            <div
              key={card.id}
              className="p-3 bg-brand-lightGray dark:bg-gray-700 rounded-md shadow border border-brand-mediumGray dark:border-gray-600"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-brand-orange dark:text-orange-400">{card.term}</p>
                  <p className="text-sm text-brand-black/80 dark:text-gray-300">{card.definition}</p>
                </div>
                <div className="flex space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleOpenAddFlashcardModal(card)}
                    className="p-1.5 text-brand-blue hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                    title="Edit"
                  >
                    <Icons.PencilIcon />
                  </button>
                  <button
                    onClick={() => handleDeleteFlashcard(card.id)}
                    className="p-1.5 text-brand-red hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                    title="Delete"
                  >
                    <Icons.TrashIcon />
                  </button>
                </div>
              </div>
              <p className="text-xs mt-1 text-brand-black/60 dark:text-gray-500">
                Status: {card.status}, Difficulty: {card.difficultyLevel}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-brand-black/70 dark:text-gray-400">
          No flashcards in this deck yet. Add some manually or generate them!
        </p>
      )}
    </div>
  );
};

export default FlashcardList;
