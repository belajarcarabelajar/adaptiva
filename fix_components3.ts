const fs = require('fs');

let contentStack = fs.readFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', 'utf8');
// Fallback to text if the icons don't exist
contentStack = contentStack.replace('<Icons.ChevronLeftIcon className="w-8 h-8" />', '<span>Prev</span>');
contentStack = contentStack.replace('<Icons.ChevronRightIcon className="w-8 h-8" />', '<span>Next</span>');
fs.writeFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', contentStack);
