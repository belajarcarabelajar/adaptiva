import fs from 'fs';

let content = fs.readFileSync('apps/web/src/App.tsx', 'utf8');

// The best way to refactor a big file with regex is to match the exact start and end strings, or do a targeted diff.
// Because it's too error prone, let's just do targeted string replacements.

const replacements = [
    {
        search: `  // --- Flashcard Feature State ---\n  const [activeFlashcardModuleInfo, setActiveFlashcardModuleInfo] = useState<{ title: string, moduleMaterial: string } | null>(null);\n  const [flashcardDecks, setFlashcardDecks] = useState<Record<string, FlashcardDeck>>({}); // moduleTitle -> FlashcardDeck\n  const [currentFlashcardDeck, setCurrentFlashcardDeck] = useState<FlashcardDeck | null>(null);\n  const [flashcardSubView, setFlashcardSubView] = useState<FlashcardSubView>('daftar');\n  const [currentFlashcardIndexInStack, setCurrentFlashcardIndexInStack] = useState<number>(0);\n  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState<boolean>(false);\n  const [showAddFlashcardModal, setShowAddFlashcardModal] = useState<boolean>(false);\n  const [flashcardFormState, setFlashcardFormState] = useState<{ term: string, definition: string }>({ term: '', definition: '' });\n  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);\n  const [flippedFlashcardId, setFlippedFlashcardId] = useState<string | null>(null);\n  \n  // Matching Game State\n  const [flashcardMatchGameItems, setFlashcardMatchGameItems] = useState<FlashcardMatchItem[]>([]);\n  const [selectedMatchItemId, setSelectedMatchItemId] = useState<string | null>(null);\n  const [matchGameActive, setMatchGameActive] = useState<boolean>(false);\n  const [matchGameStartTime, setMatchGameStartTime] = useState<number | null>(null);\n  const [matchGameTimeElapsed, setMatchGameTimeElapsed] = useState<number>(0);\n  const matchGameTimerIntervalIdRef = useRef<number | null>(null);\n  // --- End Flashcard Feature State ---`,
        replace: `  // --- Flashcard Feature State ---\n  const flashcards = useFlashcards(selectedHistoryItemId, setHistoryItems, setError);\n  // --- End Flashcard Feature State ---`
    }
];

for (const r of replacements) {
    content = content.replace(r.search, r.replace);
}

// Write it temporarily to check
fs.writeFileSync('apps/web/src/App.tsx', content);
