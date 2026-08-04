import React from 'react';
import { FlashcardSubView } from '../../types';
import { Icons } from '../../constants';
import { useFlashcards } from '../../hooks/useFlashcards';
import FlashcardList from './FlashcardList';
import FlashcardStack from './FlashcardStack';
import FlashcardMatchGame from './FlashcardMatchGame';
import FlashcardModal from './FlashcardModal';

interface FlashcardViewProps {
  flashcards: ReturnType<typeof useFlashcards>;
  setCurriculumSubTab: (tab: string) => void;
  curriculumSubTab: string;
  targetLanguage: string;
  setIsAuthModalOpen: (val: boolean) => void;
  setIsPointsModalOpen: (val: boolean) => void;
  setPointsModalInfo: (val: { required: number; remaining: number; action: string }) => void;
  error: string | null;
}

const FlashcardView: React.FC<FlashcardViewProps> = ({
  flashcards,
  setCurriculumSubTab,
  curriculumSubTab,
  targetLanguage,
  setIsAuthModalOpen,
  setIsPointsModalOpen,
  setPointsModalInfo,
  error,
}) => {
  const {
    activeFlashcardModuleInfo,
    flashcardSubView,
    setFlashcardSubView,
    currentFlashcardDeck,
    isGeneratingFlashcards,
    handleGenerateFlashcards,
    matchGameActive,
    flashcardMatchGameItems,
    showAddFlashcardModal,
    setShowAddFlashcardModal,
    editingFlashcardId,
    flashcardFormState,
    setFlashcardFormState,
    handleSaveFlashcard,
    sortedStackCards,
    flashcardStatusCounts,
    currentFlashcardIndexInStack,
    setCurrentFlashcardIndexInStack,
    flippedFlashcardId,
    setFlippedFlashcardId,
    handleAssessFlashcard,
    handleOpenAddFlashcardModal,
    handleDeleteFlashcard,
    selectedMatchItemId,
    matchGameTimeElapsed,
    formatMatchGameTime,
    handleStartFlashcardMatchGame,
    handleFlashcardMatchAttempt,
  } = flashcards;

  const heading2Size = 'text-xl sm:text-2xl md:text-2xl font-semibold text-brand-blue dark:text-blue-300';
  const largeTextBase = 'text-lg md:text-xl text-brand-black dark:text-gray-200';

  if (!activeFlashcardModuleInfo) {
    return (
      <div className="text-center p-6 bg-brand-lightGray dark:bg-gray-800 rounded-lg shadow">
        <Icons.LightBulb className="w-12 h-12 text-brand-yellow mx-auto mb-4" />
        <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-3`}>Flashcards</h3>
        <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 mb-4`}>
          To manage or study flashcards, please select a module from the{' '}
          <button
            onClick={() => setCurriculumSubTab('material')}
            className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500"
          >
            Material
          </button>{' '}
          tab and click &quot;Manage Flashcards&quot;, or select a deck from{' '}
          <button
            onClick={() => setCurriculumSubTab('study_log')}
            className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500"
          >
            Study Log
          </button>
          .
        </p>
        <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>
          Ensure the module material is loaded before generating flashcards.
        </p>
      </div>
    );
  }

  const flashcardSubTabs: { name: FlashcardSubView; label: string; icon: React.ReactNode }[] = [
    { name: 'daftar', label: 'Daftar', icon: <Icons.QueueListIcon /> },
    { name: 'tumpukan', label: 'Tumpukan', icon: <Icons.RectangleStackIcon /> },
    { name: 'permainan', label: 'Permainan', icon: <Icons.PuzzlePieceIcon /> },
  ];

  const gameIsCompleted =
    matchGameActive === false &&
    flashcardMatchGameItems.length > 0 &&
    flashcardMatchGameItems.every(item => !item.isVisible);

  return (
    <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
      <h2 className="text-2xl md:text-3xl font-bold text-brand-blue dark:text-blue-300 mb-4">
        Flashcards for: <span className="text-brand-orange dark:text-orange-400">{activeFlashcardModuleInfo.title}</span>
      </h2>

      <div className="mb-4 flex items-center space-x-2 border-b border-brand-mediumGray dark:border-gray-700 pb-3 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => handleGenerateFlashcards(targetLanguage, setIsAuthModalOpen, setIsPointsModalOpen, setPointsModalInfo)}
          disabled={isGeneratingFlashcards}
          className="flex-shrink-0 mr-2 px-3 py-2 bg-brand-green hover:bg-green-700 text-brand-white text-sm font-semibold rounded-md flex items-center disabled:opacity-50"
        >
          {isGeneratingFlashcards ? (
            <Icons.LoadingAnimatedIcon className="w-4 h-4 mr-2" />
          ) : (
            <Icons.Sparkles className="w-4 h-4 mr-2" />
          )}
          Generate AI Flashcards
        </button>
        {flashcardSubTabs.map(subTab => (
          <button
            key={subTab.name}
            onClick={() => setFlashcardSubView(subTab.name)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-shrink-0
              ${flashcardSubView === subTab.name
                ? 'bg-brand-orange text-brand-white'
                : 'bg-brand-lightGray dark:bg-gray-700 text-brand-blue dark:text-blue-300 hover:bg-brand-mediumGray dark:hover:bg-gray-600'}`}
          >
            {subTab.icon}
            <span>{subTab.label}</span>
          </button>
        ))}
      </div>

      {error && curriculumSubTab === 'flashcards' && flashcardSubView !== 'permainan' && (
        <p className="my-2 text-brand-red dark:text-red-400 text-center">{error}</p>
      )}

      {flashcardSubView === 'daftar' && (
        <FlashcardList
          currentFlashcardDeck={currentFlashcardDeck}
          handleOpenAddFlashcardModal={handleOpenAddFlashcardModal}
          handleDeleteFlashcard={handleDeleteFlashcard}
        />
      )}

      {flashcardSubView === 'tumpukan' && (
        <FlashcardStack
          currentFlashcardDeck={currentFlashcardDeck}
          sortedStackCards={sortedStackCards}
          currentFlashcardIndexInStack={currentFlashcardIndexInStack}
          flippedFlashcardId={flippedFlashcardId}
          setFlippedFlashcardId={setFlippedFlashcardId}
          handleAssessFlashcard={handleAssessFlashcard}
          setCurrentFlashcardIndexInStack={setCurrentFlashcardIndexInStack}
          flashcardStatusCounts={flashcardStatusCounts}
        />
      )}

      {flashcardSubView === 'permainan' && (
        <FlashcardMatchGame
          currentFlashcardDeck={currentFlashcardDeck}
          matchGameActive={matchGameActive}
          gameIsCompleted={gameIsCompleted}
          flashcardMatchGameItems={flashcardMatchGameItems}
          selectedMatchItemId={selectedMatchItemId}
          matchGameTimeElapsed={matchGameTimeElapsed}
          formatMatchGameTime={formatMatchGameTime}
          handleStartFlashcardMatchGame={handleStartFlashcardMatchGame}
          handleFlashcardMatchAttempt={handleFlashcardMatchAttempt}
          error={error}
          curriculumSubTab={curriculumSubTab}
          flashcardSubView={flashcardSubView}
        />
      )}

      <FlashcardModal
        showAddFlashcardModal={showAddFlashcardModal}
        currentFlashcardDeck={!!currentFlashcardDeck}
        editingFlashcardId={editingFlashcardId}
        flashcardFormState={flashcardFormState}
        setFlashcardFormState={setFlashcardFormState}
        setShowAddFlashcardModal={setShowAddFlashcardModal}
        handleSaveFlashcard={handleSaveFlashcard}
      />
    </div>
  );
};

export default FlashcardView;
