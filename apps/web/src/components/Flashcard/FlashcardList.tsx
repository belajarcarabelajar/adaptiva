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
  handleDeleteFlashcard
}) => {
  return (
    <div className="mt-4">
        <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300">Daftar Kartu ({currentFlashcardDeck?.cards?.length || 0})</h3>
            <button
                onClick={() => handleOpenAddFlashcardModal()}
                className="px-3 py-1.5 bg-brand-lightGray hover:bg-brand-mediumGray dark:bg-gray-700 dark:hover:bg-gray-600 text-brand-blue dark:text-blue-300 text-sm font-medium rounded-md flex items-center transition-colors"
            >
                <Icons.PlusIcon className="w-4 h-4 mr-1.5" /> Tambah Manual
            </button>
        </div>
        {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentFlashcardDeck.cards.map(card => (
                    <div key={card.id} className="bg-brand-white dark:bg-gray-800 p-3 rounded-lg border border-brand-mediumGray dark:border-gray-700 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="font-semibold text-brand-black dark:text-gray-200 mb-1 border-b border-brand-lightGray dark:border-gray-700 pb-1">{card.term}</div>
                            <div className="text-sm text-brand-black/80 dark:text-gray-400 mt-1">{card.definition}</div>
                        </div>
                        <div className="mt-3 flex justify-between items-center border-t border-brand-lightGray dark:border-gray-700 pt-2">
                            <span className="text-xs text-brand-black/50 dark:text-gray-500">
                                {card.status === 'learning' ? 'Sedang Dipelajari' : card.status === 'reviewing' ? 'Sedang Diulang' : card.status === 'known' ? 'Sudah Tahu' : 'Kuasai'}
                            </span>
                            <div className="flex space-x-1">
                                <button onClick={() => handleOpenAddFlashcardModal(card)} className="p-1.5 text-brand-blue hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200" title="Edit"><Icons.PencilIcon /></button>
                                <button onClick={() => handleDeleteFlashcard(card.id)} className="p-1.5 text-brand-red hover:text-red-700 dark:text-red-400 dark:hover:text-red-200" title="Delete"><Icons.TrashIcon /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <p className="text-brand-black/70 dark:text-gray-400 italic text-center py-4 bg-brand-lightGray/50 dark:bg-gray-800/50 rounded-lg">Belum ada kartu di deck ini. Silakan generate dari AI atau tambah manual.</p>
        )}
    </div>
  );
};

export default FlashcardList;
