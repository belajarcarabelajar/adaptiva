const fs = require('fs');

let content = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

// The flashcard feature functions start around line 1719 and end around line 2125
// Let's just remove them with a regex that captures all functions related to flashcards

const regex = /\n\s+const (handleInitiateFlashcardGeneration|handleGenerateFlashcards|handleOpenAddFlashcardModal|handleSaveFlashcard|handleDeleteFlashcard|handleAssessFlashcard|getSortedFlashcardsForStack|handleStartFlashcardMatchGame|handleFlashcardMatchAttempt|formatMatchGameTime|shuffleArray) = [\s\S]*?(?=\n\s+const (handle|render|get|reset)|return)/g;

let oldLength;
do {
    oldLength = content.length;
    content = content.replace(regex, "\n");
} while (content.length < oldLength);

const sortedStackRegex = /\n\s+const sortedStackCards = [^\n]*;/g;
content = content.replace(sortedStackRegex, "");

const statusCountRegex = /\n\s+const flashcardStatusCounts = [^]*?(?=\n\s+const)/g;
content = content.replace(statusCountRegex, "\n");

// Replace renderFlashcardInterface
const renderFcRegex = /\n\s+const renderFlashcardInterface = \(\) => \{[^]*?(?=\n\s+const renderMainContent)/;
content = content.replace(renderFcRegex, "\n");

// Update JSX that calls renderFlashcardInterface
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

// Fix hook usage - we extracted the state but didn't remove the unused refs. Let's see what's left using tsc
fs.writeFileSync('apps/web/src/App.tsx', content);
