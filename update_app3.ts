import fs from 'fs';

let content = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

// The best way to extract the functionality is:
// 1. Write the new hook call and replace state (we did this in the git merge diff just now)
// 2. Destructure the flashcards state to make sure nothing breaks internally in App.tsx while we remove it.
// We can just destructure EVERYTHING at the top level and then it will compile.

const destructureStr = `
  const {
    activeFlashcardModuleInfo, setActiveFlashcardModuleInfo,
    flashcardDecks, setFlashcardDecks,
    currentFlashcardDeck, setCurrentFlashcardDeck,
    flashcardSubView, setFlashcardSubView,
    currentFlashcardIndexInStack, setCurrentFlashcardIndexInStack,
    isGeneratingFlashcards, setIsGeneratingFlashcards,
    showAddFlashcardModal, setShowAddFlashcardModal,
    flashcardFormState, setFlashcardFormState,
    editingFlashcardId, setEditingFlashcardId,
    flippedFlashcardId, setFlippedFlashcardId,
    flashcardMatchGameItems, setFlashcardMatchGameItems,
    selectedMatchItemId, setSelectedMatchItemId,
    matchGameActive, setMatchGameActive,
    matchGameStartTime, setMatchGameStartTime,
    matchGameTimeElapsed, setMatchGameTimeElapsed,
    matchGameTimerIntervalIdRef,

    handleOpenAddFlashcardModal,
    handleSaveFlashcard,
    handleDeleteFlashcard,
    handleAssessFlashcard,
    handleStartFlashcardMatchGame,
    handleFlashcardMatchAttempt,
    handleGenerateFlashcards,
    formatMatchGameTime,

    sortedStackCards,
    flashcardStats
  } = flashcards;
`;

const stateBlockRegex = /const flashcards = useFlashcards\([^)]+\);/;
content = content.replace(stateBlockRegex, `$& \n ${destructureStr}`);


// Now we need to remove the implementations of those functions in App.tsx!

const funcsToDelete = [
    "const handleInitiateFlashcardGeneration",
    "const handleGenerateFlashcards",
    "const handleOpenAddFlashcardModal",
    "const handleSaveFlashcard",
    "const handleDeleteFlashcard",
    "const handleAssessFlashcard",
    "const getSortedFlashcardsForStack",
    "const flashcardStatusCounts",
    "const sortedStackCards",
    "const shuffleArray",
    "const handleStartFlashcardMatchGame",
    "const handleFlashcardMatchAttempt",
    "const formatMatchGameTime"
];

let lines = content.split('\n');
let newLines = [];
let skipDepth = 0;
let skipping = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!skipping) {
        let shouldSkip = false;
        for (const func of funcsToDelete) {
            if (line.includes(func) && !line.includes("= flashcards;")) { // don't delete our destructure!
                shouldSkip = true;
                break;
            }
        }

        if (shouldSkip) {
            skipping = true;
            let openBraces = (line.match(/\{/g) || []).length;
            let closeBraces = (line.match(/\}/g) || []).length;
            skipDepth = openBraces - closeBraces;
            if (skipDepth <= 0 && openBraces > 0) skipping = false;
            continue;
        }
    } else {
        let openBraces = (line.match(/\{/g) || []).length;
        let closeBraces = (line.match(/\}/g) || []).length;
        skipDepth += openBraces - closeBraces;

        if (skipDepth <= 0) {
            skipping = false;
            continue;
        }
        continue;
    }

    // Remove renderFlashcardInterface
    if (line.includes("const renderFlashcardInterface = () => {")) {
        skipping = true;
        let openBraces = (line.match(/\{/g) || []).length;
        let closeBraces = (line.match(/\}/g) || []).length;
        skipDepth = openBraces - closeBraces;
        continue;
    }

    // Update JSX
    if (line.includes("{curriculumSubTab === 'flashcards' && renderFlashcardInterface()}")) {
        newLines.push(`                {curriculumSubTab === 'flashcards' && (`);
        newLines.push(`                  <FlashcardView`);
        newLines.push(`                    flashcards={flashcards}`);
        newLines.push(`                    setCurriculumSubTab={setCurriculumSubTab}`);
        newLines.push(`                    targetLanguage={targetLanguage}`);
        newLines.push(`                    setIsAuthModalOpen={setIsAuthModalOpen}`);
        newLines.push(`                    setIsPointsModalOpen={setIsPointsModalOpen}`);
        newLines.push(`                    setPointsModalInfo={setPointsModalInfo}`);
        newLines.push(`                    error={error}`);
        newLines.push(`                  />`);
        newLines.push(`                )}`);
        continue;
    }

    newLines.push(line);
}

// Re-add the handleInitiateFlashcardGeneration function that needs `handleLoadModuleDetails` etc.

const initiateFunc = `
  const handleInitiateFlashcardGeneration = useCallback(async (module: CurriculumModule) => {
    setViewMode('loading');
    setError(null);
    let material: string | null | undefined = module.moduleMaterial;
    let currentLearningJourney = currentLearningJourneyMemo;

    if (!material && currentLearningJourney && curriculum) {
        const modEntry = currentCurriculumModulesMap.get(module.title);
        if (modEntry) {
            material = await handleLoadModuleDetails(modEntry.index);
        }
    }

    if (!material) {
        setError(\`Module material for "\${module.title}" must be loaded first.\`);
        setCurriculumSubTab('material');
        if (curriculum) {
             const modEntry = activeCurriculumModulesMap.get(module.title);
             if(modEntry) {
                const modIdx = modEntry.index;
                setSelectedMaterialModuleIndex(modIdx);
                setCurriculum(prev => {
                    if(!prev) return null;
                    const updatedModules = [...prev.modules];
                    updatedModules[modIdx] = {...updatedModules[modIdx], loadingError: "Material must be loaded for flashcard generation."};
                    return {...prev, modules: updatedModules};
                  });
             }
        }
        setViewMode('results');
        return;
    }

    setActiveFlashcardModuleInfo({ title: module.title, moduleMaterial: material });

    const existingDeck = flashcardDecks[module.title];
    if (existingDeck) {
        setCurrentFlashcardDeck(existingDeck);
    } else {
        const newDeck = { moduleId: module.title, moduleTitle: module.title, cards: [] };
        setFlashcardDecks(prev => ({ ...prev, [module.title]: newDeck }));
        setCurrentFlashcardDeck(newDeck);
    }

    setCurriculumSubTab('flashcards');
    setFlashcardSubView('daftar');
    setViewMode('results');
  }, [handleLoadModuleDetails, flashcardDecks, curriculum]);
`;

// Insert it before handleFetchResources
const insertIdx = newLines.findIndex(line => line.includes('const handleFetchResources ='));
newLines.splice(insertIdx, 0, initiateFunc);

fs.writeFileSync('apps/web/src/App.tsx', newLines.join('\n'));
