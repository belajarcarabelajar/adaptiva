import React from 'react';
import { FlashcardDeck, FlashcardMatchItem } from '../../types';
import { Icons } from '../../constants';

interface FlashcardMatchGameProps {
  currentFlashcardDeck: FlashcardDeck | null;
  matchGameActive: boolean;
  gameIsCompleted: boolean;
  flashcardMatchGameItems: FlashcardMatchItem[];
  selectedMatchItemId: string | null;
  matchGameTimeElapsed: number;
  formatMatchGameTime: (totalSeconds: number) => string;
  handleStartFlashcardMatchGame: () => void;
  handleFlashcardMatchAttempt: (itemId: string) => void;
  error: string | null;
  curriculumSubTab: string;
  flashcardSubView: string;
}

const FlashcardMatchGame: React.FC<FlashcardMatchGameProps> = ({
  currentFlashcardDeck,
  matchGameActive,
  gameIsCompleted,
  flashcardMatchGameItems,
  selectedMatchItemId,
  matchGameTimeElapsed,
  formatMatchGameTime,
  handleStartFlashcardMatchGame,
  handleFlashcardMatchAttempt,
  error,
  curriculumSubTab,
  flashcardSubView,
}) => {
  return (
    <div>
      <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300 mb-3">Permainan Pencocokan</h3>
      {!matchGameActive && !gameIsCompleted && (
        <>
          <p className="text-brand-black/70 dark:text-gray-400 mb-4">
            Cocokkan istilah dengan definisinya. Klik &quot;Mulai Permainan&quot; untuk memulai.
          </p>
          <button
            onClick={handleStartFlashcardMatchGame}
            disabled={!currentFlashcardDeck || currentFlashcardDeck.cards.length < 2}
            className="px-4 py-2 bg-brand-green hover:bg-green-700 text-brand-white font-semibold rounded-md disabled:opacity-50"
          >
            Mulai Permainan
          </button>
          {(!currentFlashcardDeck || currentFlashcardDeck.cards.length < 2) && (
            <p className="text-xs text-brand-red dark:text-red-400 mt-1">Butuh minimal 2 kartu untuk bermain.</p>
          )}
        </>
      )}
      {error && curriculumSubTab === 'flashcards' && flashcardSubView === 'permainan' && (
        <p className="my-2 text-brand-red dark:text-red-400 text-center">{error}</p>
      )}

      {matchGameActive && (
        <div className="text-center mb-2">
          <p className="text-lg font-semibold text-brand-orange dark:text-orange-400">
            Waktu: {formatMatchGameTime(matchGameTimeElapsed)}
          </p>
        </div>
      )}

      {gameIsCompleted && (
        <div className="text-center p-4 bg-brand-green/10 dark:bg-green-900/30 rounded-md">
          <Icons.CheckCircle className="w-10 h-10 text-brand-green mx-auto mb-2" />
          <p className="text-xl font-semibold text-brand-green dark:text-green-300">
            Selamat! Semua pasangan berhasil dicocokkan!
          </p>
          <p className="text-md text-brand-black/80 dark:text-gray-300">
            Waktu Pengerjaan: {formatMatchGameTime(matchGameTimeElapsed)}
          </p>
          <button
            onClick={handleStartFlashcardMatchGame}
            className="mt-3 px-4 py-2 bg-brand-orange hover:bg-orange-700 text-brand-white font-semibold rounded-md"
          >
            Main Lagi
          </button>
        </div>
      )}

      {matchGameActive && !gameIsCompleted && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {flashcardMatchGameItems.map(item => item.isVisible && (
            <button
              key={item.id}
              onClick={() => handleFlashcardMatchAttempt(item.id)}
              className={`p-3 min-h-[80px] md:min-h-[100px] flex items-center justify-center text-center text-sm md:text-base rounded-md border-2 transition-all duration-150
                ${selectedMatchItemId === item.id
                  ? 'bg-brand-yellow/30 dark:bg-yellow-600/50 border-brand-yellow dark:border-yellow-400 shadow-lg scale-105'
                  : 'bg-brand-lightGray dark:bg-gray-700 border-brand-mediumGray dark:border-gray-600 hover:border-brand-blue dark:hover:border-blue-500 hover:shadow-md'}
                text-brand-black dark:text-gray-100`}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FlashcardMatchGame;
