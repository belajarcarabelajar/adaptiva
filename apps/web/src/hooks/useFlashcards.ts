import { useState, useRef, useCallback, useMemo } from 'react';
import type React from 'react';
import {
  FlashcardDeck,
  Flashcard,
  FlashcardDifficulty,
  FlashcardStatus,
  FlashcardSubView,
  FlashcardMatchItem,
  HistoryItem,
} from '../types';
import { generateFlashcardsFromMaterial } from '../services/geminiService';
import { useAuth } from './useAuth';

export function useFlashcards(
  selectedHistoryItemId: string | null,
  setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) {
  const { user, status, refresh } = useAuth();

  // --- Flashcard Feature State ---
  const [activeFlashcardModuleInfo, setActiveFlashcardModuleInfo] = useState<{ title: string; moduleMaterial: string } | null>(null);
  const [flashcardDecks, setFlashcardDecks] = useState<Record<string, FlashcardDeck>>({});
  const [currentFlashcardDeck, setCurrentFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const [flashcardSubView, setFlashcardSubView] = useState<FlashcardSubView>('daftar');
  const [currentFlashcardIndexInStack, setCurrentFlashcardIndexInStack] = useState<number>(0);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState<boolean>(false);
  const [showAddFlashcardModal, setShowAddFlashcardModal] = useState<boolean>(false);
  const [flashcardFormState, setFlashcardFormState] = useState<{ term: string; definition: string }>({ term: '', definition: '' });
  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);
  const [flippedFlashcardId, setFlippedFlashcardId] = useState<string | null>(null);

  // Matching Game State
  const [flashcardMatchGameItems, setFlashcardMatchGameItems] = useState<FlashcardMatchItem[]>([]);
  const [selectedMatchItemId, setSelectedMatchItemId] = useState<string | null>(null);
  const [matchGameActive, setMatchGameActive] = useState<boolean>(false);
  const [matchGameStartTime, setMatchGameStartTime] = useState<number | null>(null);
  const [matchGameTimeElapsed, setMatchGameTimeElapsed] = useState<number>(0);
  const matchGameTimerIntervalIdRef = useRef<number | null>(null);

  // --- Helpers ---

  const formatAiError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    const REFUNDED_CODES = ['ai_generation_failed', 'ai_generation_blocked', 'ai_upstream_network_error'];
    for (const code of REFUNDED_CODES) {
      if (msg.startsWith(code + ':')) {
        return msg.slice(code.length + 1).trim();
      }
    }
    if (msg.includes('unauthorized')) return 'Silakan masuk terlebih dahulu untuk menggunakan fitur AI.';
    if (msg.includes('insufficient_points')) return 'Poin Anda tidak cukup untuk melakukan aksi ini.';
    return msg || 'Terjadi kesalahan tidak diketahui.';
  };

  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      const j = Math.floor((randomBuffer[0] / (0xffffffff + 1)) * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // --- Actions ---

  const handleOpenAddFlashcardModal = useCallback((cardToEdit?: Flashcard) => {
    if (cardToEdit) {
      setFlashcardFormState({ term: cardToEdit.term, definition: cardToEdit.definition });
      setEditingFlashcardId(cardToEdit.id);
    } else {
      setFlashcardFormState({ term: '', definition: '' });
      setEditingFlashcardId(null);
    }
    setShowAddFlashcardModal(true);
  }, []);

  const handleSaveFlashcard = useCallback(() => {
    if (!currentFlashcardDeck || !flashcardFormState.term.trim() || !flashcardFormState.definition.trim() || !selectedHistoryItemId) return;

    let updatedCards: Flashcard[];
    if (editingFlashcardId) {
      updatedCards = currentFlashcardDeck.cards.map(card =>
        card.id === editingFlashcardId
          ? { ...card, term: flashcardFormState.term, definition: flashcardFormState.definition }
          : card
      );
    } else {
      const newCard: Flashcard = {
        id: `fc-${currentFlashcardDeck.moduleId.replace(/\s+/g, '-')}-${Date.now()}`,
        term: flashcardFormState.term,
        definition: flashcardFormState.definition,
        status: 'learning',
        lastReviewed: Date.now(),
        nextReview: Date.now(),
        difficultyLevel: 'medium',
        moduleId: currentFlashcardDeck.moduleId,
      };
      updatedCards = [...currentFlashcardDeck.cards, newCard];
    }

    const updatedDeck = { ...currentFlashcardDeck, cards: updatedCards };
    setFlashcardDecks(prev => {
      const newDecks = { ...prev, [currentFlashcardDeck.moduleId]: updatedDeck };
      setHistoryItems(prevHist => {
        const itemIndex = prevHist.findIndex(h => h.id === selectedHistoryItemId);
        if (itemIndex === -1) return prevHist;
        const newItems = [...prevHist];
        newItems[itemIndex] = { ...prevHist[itemIndex], flashcardDecks: newDecks };
        return newItems;
      });
      return newDecks;
    });
    setCurrentFlashcardDeck(updatedDeck);
    setShowAddFlashcardModal(false);
    setEditingFlashcardId(null);
    setFlashcardFormState({ term: '', definition: '' });
  }, [currentFlashcardDeck, flashcardFormState, editingFlashcardId, selectedHistoryItemId, setHistoryItems]);

  const handleDeleteFlashcard = useCallback((cardId: string) => {
    if (!currentFlashcardDeck || !selectedHistoryItemId) return;
    const updatedCards = currentFlashcardDeck.cards.filter(card => card.id !== cardId);
    const updatedDeck = { ...currentFlashcardDeck, cards: updatedCards };

    setFlashcardDecks(prev => {
      const newDecks = { ...prev, [currentFlashcardDeck.moduleId]: updatedDeck };
      setHistoryItems(prevHist => {
        const itemIndex = prevHist.findIndex(h => h.id === selectedHistoryItemId);
        if (itemIndex === -1) return prevHist;
        const newItems = [...prevHist];
        newItems[itemIndex] = { ...prevHist[itemIndex], flashcardDecks: newDecks };
        return newItems;
      });
      return newDecks;
    });
    setCurrentFlashcardDeck(updatedDeck);
  }, [currentFlashcardDeck, selectedHistoryItemId, setHistoryItems]);

  const handleAssessFlashcard = useCallback((cardId: string, difficulty: FlashcardDifficulty) => {
    if (!currentFlashcardDeck || !selectedHistoryItemId) return;

    const now = Date.now();
    let nextReviewDate = now;
    let newStatus: FlashcardStatus = 'learning';

    const currentCard = currentFlashcardDeck.cards.find(c => c.id === cardId);
    if (!currentCard) return;

    const oneDay = 1 * 24 * 60 * 60 * 1000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const fiveDays = 5 * 24 * 60 * 60 * 1000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const sixtyDays = 60 * 24 * 60 * 60 * 1000;

    switch (currentCard.status) {
      case 'learning':
        if (difficulty === 'hard') { newStatus = 'learning'; nextReviewDate = now + oneDay; }
        else if (difficulty === 'medium') { newStatus = 'reviewing'; nextReviewDate = now + threeDays; }
        else { newStatus = 'known'; nextReviewDate = now + sevenDays; }
        break;
      case 'reviewing':
        if (difficulty === 'hard') { newStatus = 'learning'; nextReviewDate = now + oneDay; }
        else if (difficulty === 'medium') { newStatus = 'reviewing'; nextReviewDate = now + fiveDays; }
        else { newStatus = 'known'; nextReviewDate = now + tenDays; }
        break;
      case 'known':
        if (difficulty === 'hard') { newStatus = 'reviewing'; nextReviewDate = now + threeDays; }
        else if (difficulty === 'medium') { newStatus = 'known'; nextReviewDate = now + fourteenDays; }
        else { newStatus = 'mastered'; nextReviewDate = now + thirtyDays; }
        break;
      case 'mastered':
        if (difficulty === 'hard') { newStatus = 'reviewing'; nextReviewDate = now + threeDays; }
        else if (difficulty === 'medium') { newStatus = 'known'; nextReviewDate = now + fourteenDays; }
        else { newStatus = 'mastered'; nextReviewDate = now + sixtyDays; }
        break;
      default:
        newStatus = 'learning'; nextReviewDate = now + oneDay;
    }

    const updatedCards = currentFlashcardDeck.cards.map(card =>
      card.id === cardId
        ? { ...card, status: newStatus, difficultyLevel: difficulty, lastReviewed: now, nextReview: nextReviewDate }
        : card
    );
    const updatedDeck = { ...currentFlashcardDeck, cards: updatedCards };

    setFlashcardDecks(prev => {
      const newDecks = { ...prev, [currentFlashcardDeck.moduleId]: updatedDeck };
      setHistoryItems(prevHist => {
        const itemIndex = prevHist.findIndex(h => h.id === selectedHistoryItemId);
        if (itemIndex === -1) return prevHist;
        const newItems = [...prevHist];
        newItems[itemIndex] = { ...prevHist[itemIndex], flashcardDecks: newDecks };
        return newItems;
      });
      return newDecks;
    });
    setCurrentFlashcardDeck(updatedDeck);
    setFlippedFlashcardId(null);

    if (currentFlashcardDeck.cards.length > 0) {
      setCurrentFlashcardIndexInStack(prev => (prev + 1) % currentFlashcardDeck.cards.length);
    }
  }, [currentFlashcardDeck, selectedHistoryItemId, setHistoryItems]);

  const getSortedFlashcardsForStack = useCallback(() => {
    if (!currentFlashcardDeck) return [];
    const now = Date.now();
    return [...currentFlashcardDeck.cards].sort((a, b) => {
      const aIsDue = a.status === 'learning' || a.nextReview <= now;
      const bIsDue = b.status === 'learning' || b.nextReview <= now;
      if (aIsDue && !bIsDue) return -1;
      if (!aIsDue && bIsDue) return 1;
      return a.nextReview - b.nextReview;
    });
  }, [currentFlashcardDeck]);

  const sortedStackCards = useMemo(() => getSortedFlashcardsForStack(), [getSortedFlashcardsForStack]);

  const flashcardStatusCounts = useMemo(() => {
    if (!currentFlashcardDeck) return { learning: 0, reviewing: 0, known: 0, mastered: 0 };
    return currentFlashcardDeck.cards.reduce((acc, card) => {
      acc[card.status] = (acc[card.status] || 0) + 1;
      return acc;
    }, {} as Record<FlashcardStatus, number>);
  }, [currentFlashcardDeck]);

  // --- Match Game ---

  const handleStartFlashcardMatchGame = useCallback(() => {
    if (!currentFlashcardDeck || currentFlashcardDeck.cards.length === 0) {
      setError('No flashcards available to start the matching game. Please add or generate some flashcards first.');
      setMatchGameActive(false);
      return;
    }
    setError(null);
    setMatchGameActive(true);
    setSelectedMatchItemId(null);
    setMatchGameStartTime(Date.now());
    setMatchGameTimeElapsed(0);

    if (matchGameTimerIntervalIdRef.current) {
      clearInterval(matchGameTimerIntervalIdRef.current);
    }
    matchGameTimerIntervalIdRef.current = window.setInterval(() => {
      setMatchGameTimeElapsed(prevTime => prevTime + 1);
    }, 1000);

    const gameItems: FlashcardMatchItem[] = [];
    currentFlashcardDeck.cards.forEach(card => {
      gameItems.push({ id: `term-${card.id}`, flashcardId: card.id, type: 'term', text: card.term, isVisible: true });
      gameItems.push({ id: `def-${card.id}`, flashcardId: card.id, type: 'definition', text: card.definition, isVisible: true });
    });
    setFlashcardMatchGameItems(shuffleArray(gameItems));
  }, [currentFlashcardDeck, setError]);

  const handleFlashcardMatchAttempt = useCallback((itemId: string) => {
    if (!matchGameActive) return;
    const clickedItem = flashcardMatchGameItems.find(item => item.id === itemId);
    if (!clickedItem || !clickedItem.isVisible) return;

    if (!selectedMatchItemId) {
      setSelectedMatchItemId(itemId);
    } else {
      if (selectedMatchItemId === itemId) {
        setSelectedMatchItemId(null);
        return;
      }
      const firstItem = flashcardMatchGameItems.find(item => item.id === selectedMatchItemId);
      if (!firstItem) {
        setSelectedMatchItemId(null);
        return;
      }

      if (firstItem.flashcardId === clickedItem.flashcardId && firstItem.type !== clickedItem.type) {
        setFlashcardMatchGameItems(prevItems =>
          prevItems.map(item =>
            item.id === firstItem.id || item.id === clickedItem.id
              ? { ...item, isVisible: false }
              : item
          )
        );
        setSelectedMatchItemId(null);

        if (flashcardMatchGameItems.every(item => !item.isVisible || item.id === firstItem.id || item.id === clickedItem.id)) {
          setMatchGameActive(false);
          if (matchGameTimerIntervalIdRef.current) {
            clearInterval(matchGameTimerIntervalIdRef.current);
            matchGameTimerIntervalIdRef.current = null;
          }
        }
      } else {
        setSelectedMatchItemId(null);
      }
    }
  }, [matchGameActive, flashcardMatchGameItems, selectedMatchItemId]);

  const formatMatchGameTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- AI Generation ---

  const handleGenerateFlashcards = useCallback(async (
    targetLanguage: string,
    setIsAuthModalOpen: (val: boolean) => void,
    setIsPointsModalOpen: (val: boolean) => void,
    setPointsModalInfo: (val: { required: number; remaining: number; action: string }) => void
  ) => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return;
    }
    if ((user.points ?? 100) < 5) {
      setPointsModalInfo({ required: 5, remaining: user.points ?? 0, action: 'Generate Kartu Kilat' });
      setIsPointsModalOpen(true);
      return;
    }
    if (!activeFlashcardModuleInfo || !activeFlashcardModuleInfo.moduleMaterial || !selectedHistoryItemId) {
      setError('Cannot generate flashcards: Active module information or learning session is missing.');
      return;
    }
    setIsGeneratingFlashcards(true);
    setError(null);

    try {
      const generatedItems = await generateFlashcardsFromMaterial(
        activeFlashcardModuleInfo.title,
        activeFlashcardModuleInfo.moduleMaterial,
        targetLanguage,
        25
      );

      if (generatedItems && generatedItems.length > 0) {
        const newCards: Flashcard[] = generatedItems.map((item, index) => ({
          id: `fc-${activeFlashcardModuleInfo.title.replace(/\s+/g, '-')}-${Date.now()}-${index}`,
          term: item.term,
          definition: item.definition,
          status: 'learning',
          lastReviewed: Date.now(),
          nextReview: Date.now(),
          difficultyLevel: 'medium',
          moduleId: activeFlashcardModuleInfo.title,
        }));

        setFlashcardDecks(prevDecks => {
          const updatedDeck: FlashcardDeck = {
            moduleId: activeFlashcardModuleInfo.title,
            moduleTitle: activeFlashcardModuleInfo.title,
            cards: [...(prevDecks[activeFlashcardModuleInfo.title]?.cards || []), ...newCards],
          };
          const newDecks = { ...prevDecks, [activeFlashcardModuleInfo.title]: updatedDeck };

          setHistoryItems(prevHist => {
            const itemIndex = prevHist.findIndex(h => h.id === selectedHistoryItemId);
            if (itemIndex === -1) return prevHist;
            const newItems = [...prevHist];
            newItems[itemIndex] = { ...prevHist[itemIndex], flashcardDecks: newDecks };
            return newItems;
          });
          setCurrentFlashcardDeck(updatedDeck);
          return newDecks;
        });
      } else {
        setError('No flashcards were generated. The AI might not have found distinct terms or an issue occurred.');
      }
    } catch (err) {
      console.error('Error generating flashcards:', err);
      setError(formatAiError(err));
    } finally {
      setIsGeneratingFlashcards(false);
      void refresh();
    }
  }, [activeFlashcardModuleInfo, selectedHistoryItemId, refresh, status, user, setError, setHistoryItems]);

  return {
    // State
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

    // Actions
    handleOpenAddFlashcardModal,
    handleSaveFlashcard,
    handleDeleteFlashcard,
    handleAssessFlashcard,
    handleStartFlashcardMatchGame,
    handleFlashcardMatchAttempt,
    handleGenerateFlashcards,
    formatMatchGameTime,

    // Computed
    sortedStackCards,
    flashcardStatusCounts,
  };
}
