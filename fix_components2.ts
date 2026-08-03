const fs = require('fs');

let contentStack = fs.readFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', 'utf8');
contentStack = contentStack.replace('Icons.ArrowLeftIcon', 'Icons.ChevronLeftIcon');
contentStack = contentStack.replace('Icons.ArrowRightIcon', 'Icons.ChevronRightIcon');
fs.writeFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', contentStack);

let contentApp = fs.readFileSync('apps/web/src/App.tsx', 'utf8');
contentApp = contentApp.replace("setFlashcardDecks(prev => ({", "setFlashcardDecks((prev: any) => ({");
// Fix missing import
contentApp = contentApp.replace("import { useAuth } from './hooks/useAuth';", "import { useAuth, useFlashcards } from './hooks';\nimport { FlashcardView } from './components/Flashcard';");
fs.writeFileSync('apps/web/src/App.tsx', contentApp);
