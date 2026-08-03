const fs = require('fs');

let content = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

// 1. Remove all `handle` functions that were moved
const handlesToRemove = [
    'const handleInitiateFlashcardGeneration',
    'const handleGenerateFlashcards',
    'const handleOpenAddFlashcardModal',
    'const handleSaveFlashcard',
    'const handleDeleteFlashcard',
    'const handleAssessFlashcard',
    'const getSortedFlashcardsForStack',
    'const sortedStackCards',
    'const flashcardStats',
    'const handleStartFlashcardMatchGame',
    'const handleFlashcardMatchAttempt',
    'const formatMatchGameTime'
];

for (const handleName of handlesToRemove) {
    const startIndex = content.indexOf(`  ${handleName} `) !== -1 ? content.indexOf(`  ${handleName} `) : content.indexOf(`  ${handleName}`);
    if (startIndex !== -1) {
        let openBraces = 0;
        let i = startIndex;
        let started = false;

        while (i < content.length) {
            if (content[i] === '{') {
                openBraces++;
                started = true;
            } else if (content[i] === '}') {
                openBraces--;
            }

            i++;

            if (started && openBraces === 0) {
                // handle `}, [deps]);`
                if (content.substring(i, i+12).match(/^(?:, \[.*\]\);|;)/)) {
                     const match = content.substring(i).match(/^(?:, \[.*\]\);|;)\n?/);
                     if(match) i += match[0].length;
                }
                break;
            }
        }

        content = content.substring(0, startIndex) + content.substring(i);
    }
}

// 2. Remove renderFlashcardInterface
const renderIndex = content.indexOf('  const renderFlashcardInterface = () => {');
if (renderIndex !== -1) {
        let openBraces = 0;
        let i = renderIndex;
        let started = false;

        while (i < content.length) {
            if (content[i] === '{') {
                openBraces++;
                started = true;
            } else if (content[i] === '}') {
                openBraces--;
            }

            i++;

            if (started && openBraces === 0) {
                if (content[i] === ';') i++;
                if (content[i] === '\n') i++;
                break;
            }
        }
        content = content.substring(0, renderIndex) + content.substring(i);
}

// 3. Replace `<div ...>{curriculumSubTab === 'flashcards' && renderFlashcardInterface()}</div>` with the new component
// Need to find the exact spot. It's inside `renderMainContent`.

content = content.replace(
    /\{curriculumSubTab === 'flashcards' && renderFlashcardInterface\(\)\}/g,
    `{curriculumSubTab === 'flashcards' && (
                  <FlashcardView
                    flashcards={flashcards}
                    setCurriculumSubTab={setCurriculumSubTab}
                    targetLanguage={targetLanguage}
                    setIsAuthModalOpen={setIsAuthModalOpen}
                    setIsPointsModalOpen={setIsPointsModalOpen}
                    setPointsModalInfo={setPointsModalInfo}
                    error={error}
                  />
                )}`
);

// 4. Update the refs to the old state in App.tsx
// Examples: `activeFlashcardModuleInfo` -> `flashcards.activeFlashcardModuleInfo`
const stateVars = [
    'activeFlashcardModuleInfo', 'flashcardDecks', 'currentFlashcardDeck',
    'flashcardSubView', 'currentFlashcardIndexInStack', 'isGeneratingFlashcards',
    'showAddFlashcardModal', 'flashcardFormState', 'editingFlashcardId',
    'flippedFlashcardId', 'flashcardMatchGameItems', 'selectedMatchItemId',
    'matchGameActive', 'matchGameStartTime', 'matchGameTimeElapsed',
    'matchGameTimerIntervalIdRef', 'setFlashcardSubView', 'setCurrentFlashcardDeck', 'setActiveFlashcardModuleInfo'
];

for (const v of stateVars) {
    // Only replace variables in specific contexts, typically as part of expressions.
    // This is tricky.
}
// We'll let tsc output guide us for any manual fixes needed.

fs.writeFileSync('apps/web/src/App.tsx', content);
