const fs = require('fs');

let contentList = fs.readFileSync('apps/web/src/components/Flashcard/FlashcardList.tsx', 'utf8');
contentList = contentList.replace('Icons.PlusCircle', 'Icons.PlusIcon');
fs.writeFileSync('apps/web/src/components/Flashcard/FlashcardList.tsx', contentList);

let contentStack = fs.readFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', 'utf8');
contentStack = contentStack.replace('Icons.ChevronLeftIcon', 'Icons.ArrowLeftIcon');
contentStack = contentStack.replace('Icons.ChevronRightIcon', 'Icons.ArrowRightIcon');
fs.writeFileSync('apps/web/src/components/Flashcard/FlashcardStack.tsx', contentStack);
