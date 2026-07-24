import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import { 
    Curriculum, SevenDayPlan, QuizQuestion, ChatMessage, TutorSession, 
    CurriculumModule, HistoryItem, DailyPlan, StoredQuizAttempt, ActiveTab, 
    CurriculumSubTab, ExamQuestion, ExamConfiguration, ExamAttempt, ExamQuestionType,
    Flashcard, FlashcardDeck, FlashcardStatus, FlashcardDifficulty, FlashcardSubView, GeminiFlashcardItem,
    FlashcardMatchItem,
    LearningResource, ViewMode, ExamViewMode, SessionCheckpoint
} from './types'; 
import { 
  saveSessionCheckpoint, 
  loadSessionCheckpoint, 
  clearSessionCheckpoint, 
  isStandardRefresh 
} from './utils/sessionUtils';
import { 
  generateInitialCurriculumOutline, 
  generateModuleLectureSummary,
  generateSevenDayPlan, 
  generateQuiz, 
  generateDetailedQuizExplanation, 
  startChatSession, 
  sendMessageToTutorStream,
  generateExamQuestions,
  generateFlashcardsFromMaterial,
  fetchLearningResources,
  cleanModuleTitle
} from './services/geminiService';
import { parseSubtasks } from './utils/planUtils';
import { Icons } from './constants';
import LoadingSpinner from './components/LoadingSpinner';
import Accordion from './components/Accordion';
import HistorySidebar from './components/HistorySidebar';
import MemoizedMarkdownRenderer from './components/MarkdownRenderer';
import MemoizedTopicInputForm from './components/TopicInputForm';
import ExamConfigView from './components/ExamConfigView';
import ExamTakingView from './components/ExamTakingView';
import ExamResultsView from './components/ExamResultsView';
import AuthButton from './components/AuthButton';
import AuthModal from './components/AuthModal';
import PointsBadge from './components/PointsBadge';
import InsufficientPointsModal from './components/InsufficientPointsModal';
import { useAuth } from './hooks/useAuth';



// Map internal error-code prefixes from the proxy to user-friendly Indonesian messages.
// The proxy already refunded points before sending these; we just surface the message.
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

const App: React.FC = () => {
  const { user, status, refresh } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState<boolean>(false);
  const [pointsModalInfo, setPointsModalInfo] = useState<{ required: number; remaining: number; action: string }>({
    required: 10,
    remaining: 0,
    action: "fitur ini",
  });
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [activeTab, setActiveTab] = useState<ActiveTab>('curriculum');
  const [curriculumSubTab, setCurriculumSubTab] = useState<CurriculumSubTab>('syllabus');
  
  const [topic, setTopic] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>(''); 
  
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [sevenDayPlan, setSevenDayPlan] = useState<SevenDayPlan | null>(null); 
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null); // Active quiz being taken
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState<number>(0);
  const [currentQuizModuleInfo, setCurrentQuizModuleInfo] = useState<{title: string, moduleMaterial: string} | null>(null);
  const [quizAttemptCompleted, setQuizAttemptCompleted] = useState<boolean>(false); // True when a quiz is finished, to show summary
  const [reviewingQuiz, setReviewingQuiz] = useState<StoredQuizAttempt | null>(null); // Holds a historical quiz for review

  const [tutorSession, setTutorSession] = useState<TutorSession>({ chat: null, history: [], initialTutorGreeting: '' });
  const [tutorInput, setTutorInput] = useState<string>('');
  const [isTutorTyping, setIsTutorTyping] = useState<boolean>(false);
  
  const [error, setError] = useState<string | null>(null);
  const [loadingStepMessage, setLoadingStepMessage] = useState<string | null>(null);


  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [selectedHistoryItemId, setSelectedHistoryItemId] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState<number>(1);
  
  // Exam Feature State
  const [activeExamModuleInfo, setActiveExamModuleInfo] = useState<{ title: string, moduleMaterial: string } | null>(null);
  const [examViewMode, setExamViewMode] = useState<ExamViewMode>('module_selection'); // Controls internal state of 'exam' related tabs
  const [currentExamConfigForView, setCurrentExamConfigForView] = useState<Partial<ExamConfiguration> | null>(null); 
  const [currentExamQuestions, setCurrentExamQuestions] = useState<ExamQuestion[] | null>(null); // Active exam being taken
  const [currentExamAttempt, setCurrentExamAttempt] = useState<ExamAttempt | null>(null); 
  const [currentExamQuestionIndex, setCurrentExamQuestionIndex] = useState<number>(0);
  const [examAttemptCompleted, setExamAttemptCompleted] = useState<boolean>(false); // True when an exam is finished
  const [reviewingExam, setReviewingExam] = useState<ExamAttempt | null>(null); // Holds a historical exam for review
  const [examTimer, setExamTimer] = useState<{ timeLeft: number, intervalId: number | null, isActive: boolean }>({ timeLeft: 0, intervalId: null, isActive: false });
  const [isGeneratingExam, setIsGeneratingExam] = useState<boolean>(false); 
  // End Exam Feature State

  // --- Flashcard Feature State ---
  const [activeFlashcardModuleInfo, setActiveFlashcardModuleInfo] = useState<{ title: string, moduleMaterial: string } | null>(null);
  const [flashcardDecks, setFlashcardDecks] = useState<Record<string, FlashcardDeck>>({}); // moduleTitle -> FlashcardDeck
  const [currentFlashcardDeck, setCurrentFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const [flashcardSubView, setFlashcardSubView] = useState<FlashcardSubView>('daftar');
  const [currentFlashcardIndexInStack, setCurrentFlashcardIndexInStack] = useState<number>(0);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState<boolean>(false);
  const [showAddFlashcardModal, setShowAddFlashcardModal] = useState<boolean>(false);
  const [flashcardFormState, setFlashcardFormState] = useState<{ term: string, definition: string }>({ term: '', definition: '' });
  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);
  const [flippedFlashcardId, setFlippedFlashcardId] = useState<string | null>(null);
  
  // Matching Game State
  const [flashcardMatchGameItems, setFlashcardMatchGameItems] = useState<FlashcardMatchItem[]>([]);
  const [selectedMatchItemId, setSelectedMatchItemId] = useState<string | null>(null);
  const [matchGameActive, setMatchGameActive] = useState<boolean>(false);
  const [matchGameStartTime, setMatchGameStartTime] = useState<number | null>(null);
  const [matchGameTimeElapsed, setMatchGameTimeElapsed] = useState<number>(0);
  const matchGameTimerIntervalIdRef = useRef<number | null>(null);
  // --- End Flashcard Feature State ---

  // --- Resources Tab State ---
  const [currentLearningResources, setCurrentLearningResources] = useState<LearningResource | null>(null);
  const [isFetchingResources, setIsFetchingResources] = useState<boolean>(false);
  const [fetchResourcesError, setFetchResourcesError] = useState<string | null>(null);
  // --- End Resources Tab State ---

  // State for new LMS-style Material view
  const [selectedMaterialModuleIndex, setSelectedMaterialModuleIndex] = useState<number | null>(null);

  // Performance optimizations
  const currentLearningJourneyMemo = useMemo(() =>
    historyItems.find(h => h.id === selectedHistoryItemId),
  [historyItems, selectedHistoryItemId]);

  const currentCurriculumModulesMap = useMemo(() => {
    const map = new Map<string, { module: CurriculumModule, index: number }>();
    if (currentLearningJourneyMemo && currentLearningJourneyMemo.curriculum && currentLearningJourneyMemo.curriculum.modules) {
      currentLearningJourneyMemo.curriculum.modules.forEach((m, index) => {
        map.set(m.title, { module: m, index });
      });
    }
    return map;
  }, [currentLearningJourneyMemo]);

  const activeCurriculumModulesMap = useMemo(() => {
    const map = new Map<string, { module: CurriculumModule, index: number }>();
    if (curriculum && curriculum.modules) {
      curriculum.modules.forEach((m, index) => {
        map.set(m.title, { module: m, index });
      });
    }
    return map;
  }, [curriculum]);


  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adaptivaSidebarVisible');
      if (stored) return stored === 'true';
      return window.innerWidth >= 768; 
    }
    return false; 
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('adaptivaSidebarVisible', isSidebarVisible.toString());
    }
  }, [isSidebarVisible]);

  const toggleSidebarVisibility = () => setIsSidebarVisible(prev => !prev);


  const [darkMode, setDarkMode] = useState<boolean>(() => {
     if (typeof window !== 'undefined') {
        const storedPref = localStorage.getItem('adaptivaStudyDarkMode');
        if (storedPref) return storedPref === 'true';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });


  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
        localStorage.setItem('adaptivaStudyDarkMode', darkMode.toString());
    } catch (e) {
        console.error("Failed to save dark mode preference to localStorage:", e);
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prevMode => !prevMode);
  };

 useEffect(() => {
    try {
      const storedUserLevel = localStorage.getItem('adaptivaStudyUserLevel');
      if (storedUserLevel) {
        setUserLevel(JSON.parse(storedUserLevel));
      }
      const storedHistory = localStorage.getItem('adaptivaStudyHistory');
      if (storedHistory) {
        const parsedHistory: HistoryItem[] = JSON.parse(storedHistory);
        const updatedHistory = parsedHistory.map(item => {
            const newModuleCompletionStatus: Record<string, { summaryLoaded: boolean; quizTaken: boolean; }> = {};
            
            item.curriculum.modules.forEach(module => {
                const oldStatus = item.moduleCompletionStatus?.[module.title];
                let summaryLoaded = false;
                let quizTaken = false;

                if (typeof oldStatus === 'object' && oldStatus !== null) {
                    // FIX: Safely access properties on a potentially untyped object from localStorage.
                    // The 'unknown' type from JSON parsing requires a safer access pattern.
                    const statusObj = oldStatus as Record<string, unknown>;
                    summaryLoaded = Boolean(statusObj['summaryLoaded']);
                    quizTaken = Boolean(statusObj['quizTaken']);
                } else if (typeof oldStatus === 'boolean') {
                    summaryLoaded = oldStatus;
                }
                
                if (!quizTaken && item.quizHistory?.some(qh => qh.moduleTitle === module.title)) {
                    quizTaken = true;
                }
                newModuleCompletionStatus[module.title] = { summaryLoaded, quizTaken };
            });

            const updatedExamHistory = item.examHistory ? item.examHistory.map(eh => ({
                ...eh,
                config: {
                    ...eh.config,
                    numShortAnswer: undefined 
                } as ExamConfiguration, 
                 questions: eh.questions.map(q => ({
                    ...q,
                    userAnswer: q.userAnswer || '',
                    scoreAwarded: q.scoreAwarded || 0,
                    feedbackShown: q.feedbackShown || false,
                }))
            })) : [];


            return {
                ...item,
                curriculum: {
                    ...item.curriculum,
                    modules: item.curriculum.modules.map(m => ({
                        ...m,
                        isLoading: m.isLoading || false,
                        loadingError: m.loadingError || null,
                        moduleMaterial: m.moduleMaterial || (m as any).lectureSummary || undefined, 
                    })),
                },
                moduleCompletionStatus: newModuleCompletionStatus,
                planTaskCompletionStatus: item.planTaskCompletionStatus || {},
                planSubtaskCompletionStatus: item.planSubtaskCompletionStatus || {},
                overallProgress: typeof item.overallProgress === 'number' ? item.overallProgress : 0,
                journeyCompleted: typeof item.journeyCompleted === 'boolean' ? item.journeyCompleted : false,
                quizHistory: item.quizHistory ? item.quizHistory.map(qh => ({
                    ...qh,
                    quiz: qh.quiz.map(q => ({
                        ...q,
                        userAnswer: q.userAnswer, 
                        isCorrect: q.isCorrect,
                        feedbackShown: q.feedbackShown !== undefined ? q.feedbackShown : true 
                    }))
                })) : [],
                examHistory: updatedExamHistory,
                flashcardDecks: item.flashcardDecks || {},
                learningResources: item.learningResources || null, 
            };
        });
        setHistoryItems(updatedHistory);

        // Check for session checkpoint restoration on refresh
        const checkpoint = loadSessionCheckpoint();
        const shouldRestore = checkpoint && (isStandardRefresh() || process.env.NODE_ENV === 'test' || (typeof window !== 'undefined' && window.location.search.includes('testRestore')));
        if (shouldRestore && checkpoint && checkpoint.selectedHistoryItemId) {
          const targetItem = updatedHistory.find(item => item.id === checkpoint.selectedHistoryItemId);
          if (targetItem) {
            setTopic(targetItem.topic);
            setTargetLanguage(targetItem.targetLanguage);
            setCurriculum({
              ...targetItem.curriculum,
              modules: targetItem.curriculum.modules.map(m => ({
                ...m,
                isLoading: false,
                loadingError: m.loadingError || null
              }))
            });
            setSevenDayPlan(targetItem.sevenDayPlan);
            setFlashcardDecks(targetItem.flashcardDecks || {});
            setCurrentLearningResources(targetItem.learningResources || null);

            let initialGreeting = targetItem.initialTutorGreeting;
            const langNameLower = targetItem.targetLanguage.toLowerCase();
            if (langNameLower.includes("bahasa indonesia")) {
              initialGreeting = `Halo, saya tutor yang siap membantu kamu belajar materi tentang "${targetItem.topic}", ada yang ingin ditanyakan atau didiskusikan seputar materi ini?`;
            } else if (langNameLower !== "english" && targetItem.targetLanguage.trim() !== "") {
              initialGreeting = `Hello! I'm your personal tutor for ${targetItem.topic} (in ${targetItem.targetLanguage}). How can I help you get started?`;
            } else {
              initialGreeting = `Hello! I'm your personal tutor for ${targetItem.topic}. How can I help you get started?`;
            }

            const newChat = startChatSession(targetItem.topic, targetItem.targetLanguage);
            setTutorSession({
              chat: newChat,
              history: [{ id: 'init-hist', sender: 'ai', text: initialGreeting, timestamp: new Date() }],
              initialTutorGreeting: initialGreeting
            });

            setSelectedHistoryItemId(checkpoint.selectedHistoryItemId);
            setViewMode(checkpoint.viewMode && checkpoint.viewMode !== 'loading' ? checkpoint.viewMode : 'results');
            setActiveTab(checkpoint.activeTab || 'curriculum');
            setCurriculumSubTab(checkpoint.curriculumSubTab || 'syllabus');
            if (typeof checkpoint.selectedMaterialModuleIndex === 'number' && checkpoint.selectedMaterialModuleIndex >= 0) {
              const validIndex = Math.min(checkpoint.selectedMaterialModuleIndex, Math.max(0, targetItem.curriculum.modules.length - 1));
              setSelectedMaterialModuleIndex(validIndex);
            } else {
              setSelectedMaterialModuleIndex(targetItem.curriculum.modules.length > 0 ? 0 : null);
            }

            if (checkpoint.flashcardSubView) {
              setFlashcardSubView(checkpoint.flashcardSubView);
            }
            if (typeof checkpoint.currentFlashcardIndexInStack === 'number') {
              setCurrentFlashcardIndexInStack(checkpoint.currentFlashcardIndexInStack);
            }
            if (checkpoint.activeFlashcardModuleTitle) {
              const matchedMod = targetItem.curriculum.modules.find(m => m.title === checkpoint.activeFlashcardModuleTitle);
              if (matchedMod && matchedMod.moduleMaterial) {
                setActiveFlashcardModuleInfo({ title: matchedMod.title, moduleMaterial: matchedMod.moduleMaterial });
              }
            }
            if (checkpoint.currentQuizModuleTitle) {
              const matchedMod = targetItem.curriculum.modules.find(m => m.title === checkpoint.currentQuizModuleTitle);
              if (matchedMod && matchedMod.moduleMaterial) {
                setCurrentQuizModuleInfo({ title: matchedMod.title, moduleMaterial: matchedMod.moduleMaterial });
              }
            }
            if (typeof checkpoint.currentQuizQuestionIndex === 'number') {
              setCurrentQuizQuestionIndex(checkpoint.currentQuizQuestionIndex);
            }
            if (checkpoint.examViewMode) {
              setExamViewMode(checkpoint.examViewMode);
            }
            if (checkpoint.activeExamModuleTitle) {
              const matchedMod = targetItem.curriculum.modules.find(m => m.title === checkpoint.activeExamModuleTitle);
              if (matchedMod && matchedMod.moduleMaterial) {
                setActiveExamModuleInfo({ title: matchedMod.title, moduleMaterial: matchedMod.moduleMaterial });
              }
            }
            if (typeof checkpoint.currentExamQuestionIndex === 'number') {
              setCurrentExamQuestionIndex(checkpoint.currentExamQuestionIndex);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load data from localStorage:", e);
      localStorage.removeItem('adaptivaStudyUserLevel');
      localStorage.removeItem('adaptivaStudyHistory');
      localStorage.removeItem('adaptivaStudyDarkMode');
      localStorage.removeItem('adaptivaSidebarVisible');
    }
  }, []); 

  // Save session checkpoint to sessionStorage whenever navigation state changes
  useEffect(() => {
    if (selectedHistoryItemId && viewMode === 'results') {
      saveSessionCheckpoint({
        selectedHistoryItemId,
        viewMode,
        activeTab,
        curriculumSubTab,
        selectedMaterialModuleIndex,
        currentQuizModuleTitle: currentQuizModuleInfo?.title || null,
        currentQuizQuestionIndex,
        activeExamModuleTitle: activeExamModuleInfo?.title || null,
        examViewMode,
        currentExamQuestionIndex,
        activeFlashcardModuleTitle: activeFlashcardModuleInfo?.title || null,
        flashcardSubView,
        currentFlashcardIndexInStack,
        timestamp: Date.now()
      });
    } else if (viewMode === 'input') {
      clearSessionCheckpoint();
    }
  }, [
    selectedHistoryItemId,
    viewMode,
    activeTab,
    curriculumSubTab,
    selectedMaterialModuleIndex,
    currentQuizModuleInfo,
    currentQuizQuestionIndex,
    activeExamModuleInfo,
    examViewMode,
    currentExamQuestionIndex,
    activeFlashcardModuleInfo,
    flashcardSubView,
    currentFlashcardIndexInStack
  ]);


  useEffect(() => {
    if (selectedHistoryItemId) {
      const currentHistItem = historyItems.find(h => h.id === selectedHistoryItemId);
      if (currentHistItem) {
          if (currentHistItem.flashcardDecks) {
              setFlashcardDecks(currentHistItem.flashcardDecks);
              if (activeFlashcardModuleInfo && currentHistItem.flashcardDecks[activeFlashcardModuleInfo.title]) {
                  setCurrentFlashcardDeck(currentHistItem.flashcardDecks[activeFlashcardModuleInfo.title]);
              }
          }
          if (currentHistItem.learningResources) {
              setCurrentLearningResources(currentHistItem.learningResources);
          }
      }
    }
  }, [historyItems, selectedHistoryItemId, activeFlashcardModuleInfo]);

  useEffect(() => {
    try {
      localStorage.setItem('adaptivaStudyUserLevel', JSON.stringify(userLevel));
    } catch (e) {
      console.error("Failed to save user level to localStorage:", e);
    }
  }, [userLevel]);

  const calculateAndUpdateJourneyProgress = useCallback((itemIdToUpdate: string) => {
    setHistoryItems(prevItems => {
      const itemIndex = prevItems.findIndex(item => item.id === itemIdToUpdate);
      if (itemIndex === -1) return prevItems;

      const currentItem = prevItems[itemIndex];
      if (!currentItem.curriculum || !currentItem.sevenDayPlan || !currentItem.moduleCompletionStatus) return prevItems;

      const totalModules = currentItem.curriculum.modules.length;

      const moduleStatuses = Object.values(currentItem.moduleCompletionStatus) as { summaryLoaded: boolean; quizTaken: boolean; }[];
      const { completedModulesSummaries, completedQuizzes } = moduleStatuses
        .reduce((acc, status) => {
          if (status.summaryLoaded) acc.completedModulesSummaries++;
          if (status.quizTaken) acc.completedQuizzes++;
          return acc;
        }, { completedModulesSummaries: 0, completedQuizzes: 0 });

      const totalPlanTasks = currentItem.sevenDayPlan.days.length;
      const completedPlanTasks = Object.values(currentItem.planTaskCompletionStatus)
        .reduce((count, status) => count + (status ? 1 : 0), 0);

      const totalCompletableUnits = (totalModules * 2) + totalPlanTasks; 
      const completedUnits = completedModulesSummaries + completedQuizzes + completedPlanTasks;
      
      let newOverallProgress = 0;
      if (totalCompletableUnits > 0) {
        newOverallProgress = Math.min(100, (completedUnits / totalCompletableUnits) * 100);
      } else if (totalModules === 0 && totalPlanTasks === 0) {
        newOverallProgress = 0; 
      }

      const updatedItem = { ...currentItem, overallProgress: newOverallProgress };
      let levelIncreased = false;
      let finalUserLevel = userLevel; 

      if (newOverallProgress >= 100 && !currentItem.journeyCompleted) {
        finalUserLevel = userLevel + 1;
        setUserLevel(prevLevel => { 
          levelIncreased = true;
          return prevLevel + 1;
        });
        updatedItem.journeyCompleted = true;
        setTimeout(() => alert(`Congratulations! You've completed the learning journey for "${currentItem.topic}" and reached Level ${finalUserLevel}!`), 100);
      }
      
      if (currentItem.overallProgress === newOverallProgress && (currentItem.journeyCompleted || false) === (updatedItem.journeyCompleted || false)) {
        return prevItems;
      }
      
      const newHistory = [...prevItems];
      newHistory[itemIndex] = updatedItem;
      return newHistory;
    });
  }, [userLevel]);


  useEffect(() => {
    try {
      localStorage.setItem('adaptivaStudyHistory', JSON.stringify(historyItems));
      if (selectedHistoryItemId) {
        const itemExists = historyItems.some(item => item.id === selectedHistoryItemId);
        if (itemExists) {
          calculateAndUpdateJourneyProgress(selectedHistoryItemId);
        }
      }
    } catch (e) {
      console.error("Failed to save history to localStorage:", e);
    }
  }, [historyItems, selectedHistoryItemId, calculateAndUpdateJourneyProgress]);


  const resetQuizState = useCallback(() => {
    setQuiz(null);
    setCurrentQuizModuleInfo(null);
    setCurrentQuizQuestionIndex(0);
    setQuizAttemptCompleted(false);
  },[]);
  
  const resetExamState = useCallback(() => {
    setActiveExamModuleInfo(null);
    setExamViewMode('module_selection');
    setCurrentExamConfigForView(null);
    setCurrentExamQuestions(null);
    setCurrentExamAttempt(null);
    setCurrentExamQuestionIndex(0);
    setExamAttemptCompleted(false);
    if (examTimer.intervalId) clearInterval(examTimer.intervalId);
    setExamTimer({ timeLeft: 0, intervalId: null, isActive: false });
    setIsGeneratingExam(false);
  }, [examTimer.intervalId]);

  const resetFlashcardState = useCallback(() => {
    setActiveFlashcardModuleInfo(null);
    setCurrentFlashcardDeck(null);
    setFlashcardSubView('daftar');
    setCurrentFlashcardIndexInStack(0);
    setIsGeneratingFlashcards(false);
    setShowAddFlashcardModal(false);
    setFlashcardFormState({ term: '', definition: '' });
    setEditingFlashcardId(null);
    setFlippedFlashcardId(null);
    
    setFlashcardMatchGameItems([]);
    setSelectedMatchItemId(null);
    setMatchGameActive(false);
    setMatchGameStartTime(null);
    setMatchGameTimeElapsed(0);
    if (matchGameTimerIntervalIdRef.current) {
      clearInterval(matchGameTimerIntervalIdRef.current);
      matchGameTimerIntervalIdRef.current = null;
    }
  }, []);

  const resetResourcesState = useCallback(() => {
    setCurrentLearningResources(null);
    setIsFetchingResources(false);
    setFetchResourcesError(null);
  }, []);


  const resetAppState = useCallback((clearTopicAndLang = true) => {
    clearSessionCheckpoint();
    setViewMode('input'); 
    setCurriculum(null); 
    setSevenDayPlan(null); 
    resetQuizState();
    setReviewingQuiz(null); 
    resetExamState(); 
    setReviewingExam(null); 
    resetFlashcardState(); 
    setFlashcardDecks({});
    resetResourcesState();
    setTutorSession({ chat: null, history: [], initialTutorGreeting: '' }); 
    setError(null); 
    setLoadingStepMessage(null);
    setSelectedHistoryItemId(null);
    setActiveTab('curriculum');
    setCurriculumSubTab('syllabus');
    setSelectedMaterialModuleIndex(null);
    if (clearTopicAndLang) {
      setTopic('');
      setTargetLanguage('');
    }
  }, [resetQuizState, resetExamState, resetFlashcardState, resetResourcesState]);


  const handleFormSubmit = useCallback(async (submittedTopic: string, submittedTargetLanguage: string) => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return;
    }
    if ((user.points ?? 100) < 20) {
      setPointsModalInfo({ required: 20, remaining: user.points ?? 0, action: "Generate Kurikulum & 7-Day Plan" });
      setIsPointsModalOpen(true);
      return;
    }
    setViewMode('loading');
    setLoadingStepMessage("Analyzing topic and crafting curriculum outline...");
    setError(null);
    setTopic(submittedTopic);
    setTargetLanguage(submittedTargetLanguage);
    setSelectedHistoryItemId(null); 
    setReviewingQuiz(null);
    setReviewingExam(null);
    resetQuizState();
    resetExamState();
    resetFlashcardState();
    setFlashcardDecks({}); 
    resetResourcesState();
    setSelectedMaterialModuleIndex(null);

    let curriculumOutlineData: Curriculum | null = null;
    let planData: SevenDayPlan | null = null;
    let initialTutorMessage = "";
    let newChat: any = null; // Using 'any' for Chat due to potential library differences
    let fetchedResources: LearningResource | null = null;

    try {
      curriculumOutlineData = await generateInitialCurriculumOutline(submittedTopic, submittedTargetLanguage);
      if (!curriculumOutlineData) throw new Error("Failed to generate curriculum outline.");
      
      setLoadingStepMessage("Compiling your 7-day accelerated learning plan...");
      const moduleTitles = curriculumOutlineData.modules.map(module => module.title);
      planData = await generateSevenDayPlan(submittedTopic, curriculumOutlineData.syllabus, moduleTitles, submittedTargetLanguage); 
      if (!planData) throw new Error("Failed to generate 7-day plan.");
      
      setLoadingStepMessage("Initializing your AI tutor...");
      const langNameLower = submittedTargetLanguage.toLowerCase();
      if (langNameLower.includes("bahasa indonesia")) {
        initialTutorMessage = `Halo, saya tutor yang siap membantu kamu belajar materi tentang "${submittedTopic}", ada yang ingin ditanyakan atau didiskusikan seputar materi ini?`;
      } else if (langNameLower !== "english" && submittedTargetLanguage.trim() !== "") {
        initialTutorMessage = `Hello! I'm your personal tutor for ${submittedTopic} (in ${submittedTargetLanguage}). How can I help you get started?`;
      } else {
         initialTutorMessage = `Hello! I'm your personal tutor for ${submittedTopic}. How can I help you get started?`;
      }
      newChat = startChatSession(submittedTopic, submittedTargetLanguage);

      setLoadingStepMessage("Fetching learning resources...");
      try {
        fetchedResources = await fetchLearningResources(submittedTopic, submittedTargetLanguage);
        if (!fetchedResources) {
          setFetchResourcesError("Sumber belajar tidak ditemukan untuk topik ini.");
        }
      } catch (resErr) {
        console.warn("Failed to fetch learning resources during initial setup, but continuing:", resErr);
        setFetchResourcesError(formatAiError(resErr));
        fetchedResources = null;
      }
      
      // Update state after all essential parts are fetched or attempted
      const modulesWithLoadingErrorStatus = curriculumOutlineData.modules.map(m => ({ 
        ...m, 
        isLoading: false, 
        loadingError: null 
      }));
      const initializedCurriculum = { ...curriculumOutlineData, modules: modulesWithLoadingErrorStatus };
      setCurriculum(initializedCurriculum);
      setSevenDayPlan(planData); 
      setCurrentLearningResources(fetchedResources); // Set current resources for immediate display

      setTutorSession({ 
        chat: newChat, 
        history: [{ id: 'init', sender: 'ai', text: initialTutorMessage, timestamp: new Date() }],
        initialTutorGreeting: initialTutorMessage 
      });
      
      const initialModuleCompletionStatus: Record<string, { summaryLoaded: boolean; quizTaken: boolean; }> = {};
      initializedCurriculum.modules.forEach(module => {
        initialModuleCompletionStatus[module.title] = { summaryLoaded: false, quizTaken: false };
      });
      const initialPlanTaskCompletionStatus: Record<number, boolean> = {};
      planData.days.forEach(day => {
        initialPlanTaskCompletionStatus[day.day] = false;
      });

      const newHistoryItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        topic: submittedTopic,
        targetLanguage: submittedTargetLanguage,
        curriculum: initializedCurriculum,
        sevenDayPlan: planData, 
        initialTutorGreeting: initialTutorMessage,
        timestamp: Date.now(),
        moduleCompletionStatus: initialModuleCompletionStatus,
        planTaskCompletionStatus: initialPlanTaskCompletionStatus,
        planSubtaskCompletionStatus: {},
        overallProgress: 0,
        journeyCompleted: false,
        quizHistory: [], 
        examHistory: [],
        flashcardDecks: {},
        learningResources: fetchedResources, 
      };
      setHistoryItems(prev => [newHistoryItem, ...prev.filter(item => item.id !== newHistoryItem.id)].sort((a,b) => b.timestamp - a.timestamp));
      setSelectedHistoryItemId(newHistoryItem.id);
      
      setViewMode('results');
      setActiveTab('curriculum'); 
      setCurriculumSubTab('syllabus');
      if (initializedCurriculum.modules.length > 0) {
        setSelectedMaterialModuleIndex(0);
      }
      if (window.innerWidth < 768) setIsSidebarVisible(false);

    } catch (err) {
      console.error("Error during initial learning journey setup:", err);
      const errMsg = formatAiError(err);
      if (errMsg.includes("unauthorized") || (err instanceof Error && err.message.includes("unauthorized"))) {
        setIsAuthModalOpen(true);
      }
      setError(errMsg);
      setViewMode('error');
    } finally {
        setLoadingStepMessage(null);
        void refresh(); // Always re-sync points (including refunds) after any AI operation
    }
  }, [status, user, refresh, resetQuizState, resetExamState, resetFlashcardState, resetResourcesState, setIsSidebarVisible]); 
  
  const handleLoadModuleDetails = useCallback(async (moduleIndex: number): Promise<string | null> => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return null;
    }
    if ((user.points ?? 100) < 5) {
      setPointsModalInfo({ required: 5, remaining: user.points ?? 0, action: "Generate Materi Modul" });
      setIsPointsModalOpen(true);
      return null;
    }
    if (!curriculum || !curriculum.modules[moduleIndex] || !selectedHistoryItemId) return null;

    const moduleToLoad = curriculum.modules[moduleIndex];

    setCurriculum(prev => {
      if (!prev) return null;
      const updatedModules = [...prev.modules];
      updatedModules[moduleIndex] = { ...updatedModules[moduleIndex], isLoading: true, loadingError: null };
      return { ...prev, modules: updatedModules };
    });
    setError(null); 

    try {
      const detailData = await generateModuleLectureSummary(moduleToLoad.title, curriculum.topic, targetLanguage);
      if (detailData && detailData.moduleMaterial) {
        setCurriculum(prev => {
          if (!prev) return null;
          const updatedModules = [...prev.modules];
          updatedModules[moduleIndex] = { 
            ...updatedModules[moduleIndex], 
            moduleMaterial: detailData.moduleMaterial, 
            isLoading: false,
            loadingError: null
          };
          
          setHistoryItems(currentHistoryItems => {
            const itemIndex = currentHistoryItems.findIndex(h => h.id === selectedHistoryItemId);
            if (itemIndex === -1) return currentHistoryItems;

            const hItem = currentHistoryItems[itemIndex];
            const newModuleCompletionStatus = {
              ...hItem.moduleCompletionStatus,
              [moduleToLoad.title]: {
                ...(hItem.moduleCompletionStatus[moduleToLoad.title] || { quizTaken: false }),
                summaryLoaded: true
              }
            };
            const updatedHistModules = [...hItem.curriculum.modules];
            updatedHistModules[moduleIndex] = updatedModules[moduleIndex];
            const updatedHistCurriculum = {
                ...hItem.curriculum,
                modules: updatedHistModules
            };
            const newItems = [...currentHistoryItems];
            newItems[itemIndex] = {
              ...hItem,
              curriculum: updatedHistCurriculum,
              moduleCompletionStatus: newModuleCompletionStatus
            };
            return newItems;
          });
          return { ...prev, modules: updatedModules };
        });
        return detailData.moduleMaterial;
      } else {
        throw new Error(`Failed to load details for module: ${moduleToLoad.title}`);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = formatAiError(err) || `Error loading details for ${moduleToLoad.title}.`;
      setCurriculum(prev => {
        if (!prev) return null;
        const updatedModules = [...prev.modules];
        updatedModules[moduleIndex] = { 
            ...updatedModules[moduleIndex], 
            isLoading: false, 
            loadingError: errorMessage
        }; 
        setHistoryItems(currentHistoryItems => {
            const itemIndex = currentHistoryItems.findIndex(h => h.id === selectedHistoryItemId);
            if (itemIndex === -1) return currentHistoryItems;

            const hItem = currentHistoryItems[itemIndex];
            const updatedHistModules = [...hItem.curriculum.modules];
            updatedHistModules[moduleIndex] = updatedModules[moduleIndex];
            const updatedHistCurriculum = {
                ...hItem.curriculum,
                modules: updatedHistModules
            };
            const newItems = [...currentHistoryItems];
            newItems[itemIndex] = { ...hItem, curriculum: updatedHistCurriculum };
            return newItems;
        });
        return { ...prev, modules: updatedModules };
      });
      return null;
    } finally {
      void refresh(); // Re-sync points (including refunds) after module load
    }
  }, [status, user, refresh, curriculum, targetLanguage, selectedHistoryItemId]);


  const handleSelectHistoryItem = useCallback((id: string) => {
    const item = historyItems.find(h => h.id === id);
    if (item) {
      setTopic(item.topic);
      setTargetLanguage(item.targetLanguage);
      
      const curriculumFromHistory: Curriculum = {
        ...item.curriculum,
        modules: item.curriculum.modules.map(m => ({ 
            ...m,
            isLoading: false, 
            loadingError: m.loadingError || null 
        }))
      };
      setCurriculum(curriculumFromHistory);
      setSevenDayPlan(item.sevenDayPlan); 
      setFlashcardDecks(item.flashcardDecks || {});
      setCurrentLearningResources(item.learningResources || null);
      
      let initialGreeting = item.initialTutorGreeting;
      const langNameLower = item.targetLanguage.toLowerCase();
      
      if (langNameLower.includes("bahasa indonesia")) {
        initialGreeting = `Halo, saya tutor yang siap membantu kamu belajar materi tentang "${item.topic}", ada yang ingin ditanyakan atau didiskusikan seputar materi ini?`;
      } else if (langNameLower !== "english" && item.targetLanguage.trim() !== "") {
        initialGreeting = `Hello! I'm your personal tutor for ${item.topic} (in ${item.targetLanguage}). How can I help you get started?`;
      } else {
         initialGreeting = `Hello! I'm your personal tutor for ${item.topic}. How can I help you get started?`;
      }

      const newChat = startChatSession(item.topic, item.targetLanguage);
      setTutorSession({
        chat: newChat,
        history: [{ id: 'init-hist', sender: 'ai', text: initialGreeting, timestamp: new Date() }],
        initialTutorGreeting: initialGreeting 
      });

      resetQuizState();
      resetExamState(); 
      resetFlashcardState();
      // Do not resetResourcesState here, as it's loaded from history
      setFetchResourcesError(null); 
      setIsFetchingResources(false); 
      
      setReviewingQuiz(null);
      setReviewingExam(null);
      setError(null);
      setLoadingStepMessage(null);
      setSelectedHistoryItemId(id);
      setViewMode('results');
      setActiveTab('curriculum');
      setCurriculumSubTab('syllabus');
      setSelectedMaterialModuleIndex(item.curriculum.modules.length > 0 ? 0 : null);
      
      if (window.innerWidth < 768) setIsSidebarVisible(false);
    }
  }, [historyItems, resetQuizState, resetExamState, resetFlashcardState, setIsSidebarVisible]);

  const handleNewSession = useCallback(() => {
    resetAppState(true);
    clearSessionCheckpoint();
    if (window.innerWidth < 768) setIsSidebarVisible(false);
  }, [resetAppState, setIsSidebarVisible]);

  const handleClearHistory = useCallback(() => {
    setHistoryItems([]);
    setUserLevel(1); 
    localStorage.removeItem('adaptivaStudyUserLevel'); 
    clearSessionCheckpoint();
    handleNewSession(); 
  }, [handleNewSession]);

  const handleDeleteHistoryItem = useCallback((id: string) => {
    setHistoryItems(prevItems => prevItems.filter(item => item.id !== id));
    if (selectedHistoryItemId === id) {
        resetAppState(true); 
    }
  }, [selectedHistoryItemId, resetAppState]);
  
  const handleTogglePlanTask = useCallback((dayNumber: number, totalSubtasksCount: number = 0) => {
    if (!selectedHistoryItemId) return;

    setHistoryItems(prevItems => {
      const itemIndex = prevItems.findIndex(h => h.id === selectedHistoryItemId);
      if (itemIndex === -1) return prevItems;
      const item = prevItems[itemIndex];
      const isCurrentlyCompleted = item.planTaskCompletionStatus[dayNumber] || false;
      const nextCompleted = !isCurrentlyCompleted;

      const updatedSubtaskStatus = {
        ...(item.planSubtaskCompletionStatus || {})
      };

      if (totalSubtasksCount > 0) {
        for (let i = 0; i < totalSubtasksCount; i++) {
          updatedSubtaskStatus[`${dayNumber}_${i}`] = nextCompleted;
        }
      }

      const newPlanTaskCompletionStatus = {
        ...item.planTaskCompletionStatus,
        [dayNumber]: nextCompleted
      };

      const newItems = [...prevItems];
      newItems[itemIndex] = {
        ...item,
        planTaskCompletionStatus: newPlanTaskCompletionStatus,
        planSubtaskCompletionStatus: updatedSubtaskStatus
      };
      return newItems;
    });

    setTimeout(() => calculateAndUpdateJourneyProgress(selectedHistoryItemId), 0);
  }, [selectedHistoryItemId, calculateAndUpdateJourneyProgress]);

  const handleTogglePlanSubtask = useCallback((dayNumber: number, subtaskIndex: number, totalSubtasksCount: number) => {
    if (!selectedHistoryItemId) return;

    setHistoryItems(prevItems => {
      const itemIndex = prevItems.findIndex(h => h.id === selectedHistoryItemId);
      if (itemIndex === -1) return prevItems;
      const item = prevItems[itemIndex];
      const key = `${dayNumber}_${subtaskIndex}`;

      const currentSubtasksStatus = item.planSubtaskCompletionStatus || {};
      const dayIsCompleted = item.planTaskCompletionStatus[dayNumber] || false;

      let isSubtaskCompleted = false;
      if (key in currentSubtasksStatus) {
        isSubtaskCompleted = currentSubtasksStatus[key];
      } else {
        isSubtaskCompleted = dayIsCompleted;
      }

      const newSubtaskCompleted = !isSubtaskCompleted;
      const updatedSubtaskStatus = {
        ...currentSubtasksStatus,
        [key]: newSubtaskCompleted
      };

      let allCompleted = true;
      for (let i = 0; i < totalSubtasksCount; i++) {
        const subKey = `${dayNumber}_${i}`;
        const subVal = subKey in updatedSubtaskStatus 
          ? updatedSubtaskStatus[subKey] 
          : (i === subtaskIndex ? newSubtaskCompleted : dayIsCompleted);
        if (!subVal) {
          allCompleted = false;
          break;
        }
      }

      const newPlanTaskCompletionStatus = {
        ...item.planTaskCompletionStatus,
        [dayNumber]: allCompleted
      };

      const newItems = [...prevItems];
      newItems[itemIndex] = {
        ...item,
        planTaskCompletionStatus: newPlanTaskCompletionStatus,
        planSubtaskCompletionStatus: updatedSubtaskStatus
      };
      return newItems;
    });

    setTimeout(() => calculateAndUpdateJourneyProgress(selectedHistoryItemId), 0);
  }, [selectedHistoryItemId, calculateAndUpdateJourneyProgress]); 


  const handleGenerateQuiz = useCallback(async (module: CurriculumModule) => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return;
    }
    if ((user.points ?? 100) < 10) {
      setPointsModalInfo({ required: 10, remaining: user.points ?? 0, action: "Generate Kuis" });
      setIsPointsModalOpen(true);
      return;
    }
    if (!module.moduleMaterial) {
      setError("Please load the module material first before generating a quiz.");
      setCurriculumSubTab('material'); 
      if (curriculum) {
        const modEntry = activeCurriculumModulesMap.get(module.title);
        if (modEntry) setSelectedMaterialModuleIndex(modEntry.index);
      }
      return;
    }
    setViewMode('loading'); 
    setError(null);   
    resetQuizState();
    setReviewingQuiz(null); 
    setCurrentQuizModuleInfo({ title: module.title, moduleMaterial: module.moduleMaterial }); 

    try {
      const quizData = await generateQuiz(module.title, module.moduleMaterial, targetLanguage, 10); 
      
      if (quizData && quizData.length > 0) { 
        const initializedQuizData = quizData.map(q => ({
            ...q,
            userAnswer: undefined,
            isCorrect: undefined,
            feedbackShown: false,
        }));
        setQuiz(initializedQuizData);      
        setCurriculumSubTab('quiz'); 
        setViewMode('results'); 
      } else {
        setError("Failed to generate quiz questions for this module. The AI might not have found enough content or an issue occurred.");
        setViewMode('results'); 
        setCurriculumSubTab('quiz'); 
      }
    } catch (err) {
      console.error("Error in handleGenerateQuiz:", err);
      setError(formatAiError(err));
      setViewMode('results'); 
      setCurriculumSubTab('quiz');
      void refresh(); // Re-sync points (including refunds) after quiz generation
    }
  }, [targetLanguage, resetQuizState, curriculum, refresh]); 

  const handleQuizAnswer = (questionId: string, answer: string) => {
    if (!quiz || quizAttemptCompleted || reviewingQuiz || (quiz[currentQuizQuestionIndex] && quiz[currentQuizQuestionIndex].feedbackShown)) return;

    setQuiz(prevQuiz => 
      prevQuiz!.map((q, index) => 
        index === currentQuizQuestionIndex && q.id === questionId ? { ...q, userAnswer: answer } : q
      )
    );
  };

  const handleCheckCurrentQuestionAnswer = () => {
    if (!quiz || currentQuizQuestionIndex === -1 || quiz[currentQuizQuestionIndex].feedbackShown || reviewingQuiz) return;

    const currentQ = quiz[currentQuizQuestionIndex];
    const isAnswerCorrect = currentQ.userAnswer === currentQ.correctAnswer;

    setQuiz(prevQuiz => 
      prevQuiz!.map((q, index) => 
        index === currentQuizQuestionIndex 
        ? { ...q, isCorrect: isAnswerCorrect, feedbackShown: true } 
        : q
      )
    );
  };
  
  const handleQuizNavigation = (direction: 'next' | 'prev') => {
    const quizToNavigate = reviewingQuiz ? reviewingQuiz.quiz : quiz;
    if (!quizToNavigate) return;

    if (direction === 'next') {
      if (currentQuizQuestionIndex < quizToNavigate.length - 1) {
        setCurrentQuizQuestionIndex(prev => prev + 1);
      }
    } else if (direction === 'prev') {
      if (currentQuizQuestionIndex > 0) {
        setCurrentQuizQuestionIndex(prev => prev + 1); 
      }
    }
  };

  const handleViewQuizSummary = useCallback(() => {
     if (!quiz || !selectedHistoryItemId || !currentQuizModuleInfo) return;
     setQuizAttemptCompleted(true); 
     const newScore = quiz.reduce((acc, q) => acc + (q.isCorrect ? 1 : 0), 0);
     
     const newQuizAttempt: StoredQuizAttempt = {
        moduleId: currentQuizModuleInfo.title.replace(/\s+/g, '-').toLowerCase(),
        moduleTitle: currentQuizModuleInfo.title,
        quiz: quiz.map(q => ({
          ...q, 
          userAnswer: q.userAnswer || "", 
        })), 
        score: newScore,
        timestamp: Date.now(),
      };

      setHistoryItems(prevItems => {
        const itemIndex = prevItems.findIndex(h => h.id === selectedHistoryItemId);
        if (itemIndex === -1) return prevItems;
        const item = prevItems[itemIndex];

        const updatedModuleCompletionStatus = { ...item.moduleCompletionStatus };
        if (currentQuizModuleInfo && updatedModuleCompletionStatus[currentQuizModuleInfo.title]) {
          updatedModuleCompletionStatus[currentQuizModuleInfo.title] = {
            ...updatedModuleCompletionStatus[currentQuizModuleInfo.title],
            quizTaken: true,
          };
        }

        let updatedQuizHistory = [...(item.quizHistory || [])];

        let lastAttemptIndex = -1;
        if(currentQuizModuleInfo) {
          for (let i = updatedQuizHistory.length - 1; i >= 0; i--) {
            if (updatedQuizHistory[i].moduleTitle === currentQuizModuleInfo.title) {
              lastAttemptIndex = i;
              break;
            }
          }
        }

        if (lastAttemptIndex !== -1) {
          const lastAttempt = updatedQuizHistory[lastAttemptIndex];
          const lastAttemptScorePercentage = lastAttempt.quiz.length > 0 ? (lastAttempt.score / lastAttempt.quiz.length) * 100 : 0;
          const newScorePercentage = newQuizAttempt.quiz.length > 0 ? (newQuizAttempt.score / newQuizAttempt.quiz.length) * 100 : 0;

          if (lastAttemptScorePercentage < 50 && newScorePercentage >= 50) {
            updatedQuizHistory[lastAttemptIndex] = {
              ...newQuizAttempt,
              retakeInfo: targetLanguage.toLowerCase().includes("bahasa indonesia") ? "Lulus setelah percobaan sebelumnya." : "Passed on retake after a previous attempt.",
            };
          } else {
            updatedQuizHistory.push(newQuizAttempt);
          }
        } else {
          updatedQuizHistory.push(newQuizAttempt);
        }

        const newItems = [...prevItems];
        newItems[itemIndex] = {
          ...item,
          quizHistory: updatedQuizHistory.sort((a, b) => b.timestamp - a.timestamp),
          moduleCompletionStatus: updatedModuleCompletionStatus
        };
        return newItems;
      });
      setReviewingQuiz(newQuizAttempt); 
      setCurriculumSubTab('quiz'); 
  }, [quiz, selectedHistoryItemId, currentQuizModuleInfo, targetLanguage]);
  
  const handleLoadDetailedExplanation = useCallback(async (questionId: string, isExamQuestion: boolean = false) => {
    let targetQuestionSource: (QuizQuestion | ExamQuestion)[] | null = null;
    let contextModuleTitle: string | undefined;
    let contextModuleMaterialContent: string | undefined;
    let currentLearningJourney = currentLearningJourneyMemo;


    if (isExamQuestion) {
        targetQuestionSource = reviewingExam ? reviewingExam.questions : currentExamQuestions;
        contextModuleTitle = reviewingExam?.config.moduleTitle || activeExamModuleInfo?.title;
        contextModuleMaterialContent = activeExamModuleInfo?.moduleMaterial; 
        if (reviewingExam && !contextModuleMaterialContent && currentLearningJourney) {
            const originalModule = currentCurriculumModulesMap.get(reviewingExam.config.moduleTitle)?.module;
            contextModuleMaterialContent = originalModule?.moduleMaterial;
        }
    } else {
        targetQuestionSource = reviewingQuiz ? reviewingQuiz.quiz : quiz;
        contextModuleTitle = reviewingQuiz?.moduleTitle || currentQuizModuleInfo?.title;
        contextModuleMaterialContent = currentQuizModuleInfo?.moduleMaterial; 
        if (reviewingQuiz && !contextModuleMaterialContent && currentLearningJourney) {
            const originalModule = currentCurriculumModulesMap.get(reviewingQuiz.moduleTitle)?.module;
            contextModuleMaterialContent = originalModule?.moduleMaterial;
        }
    }
    
    if (!targetQuestionSource || !contextModuleTitle) {
      console.warn("Cannot load detailed explanation: missing context (question source, title).");
      return;
    }

    if (!contextModuleMaterialContent && currentLearningJourney && curriculum) { 
        const modEntry = currentCurriculumModulesMap.get(contextModuleTitle);
        if (modEntry) {
            const moduleIndex = modEntry.index;
            setViewMode('loading'); 
            const loadedMaterial = await handleLoadModuleDetails(moduleIndex); 
            setViewMode('results');
            if (loadedMaterial) {
                contextModuleMaterialContent = loadedMaterial;
            } else {
                 console.warn(`Failed to dynamically load material for ${contextModuleTitle} for detailed explanation.`);
            }
        }
    }
    
    if (!contextModuleMaterialContent) { 
        console.warn("Still no module material after attempting load for detailed explanation.");
        const qIdx = targetQuestionSource.findIndex(q => q.id === questionId);
        if (qIdx !== -1) {
            const updateFn = (prevQ: (QuizQuestion | ExamQuestion)[]) => {
                const updated = [...prevQ];
                updated[qIdx] = { ...updated[qIdx], isDetailedExplanationLoading: false, detailedExplanation: "Error: Module material unavailable for detailed explanation." };
                return updated;
            };
            if (isExamQuestion) {
                if (reviewingExam) setReviewingExam(prev => prev ? {...prev, questions: updateFn(prev.questions) as ExamQuestion[]} : null);
                else setCurrentExamQuestions(prev => prev ? updateFn(prev) as ExamQuestion[] : null);
            } else {
                if (reviewingQuiz) setReviewingQuiz(prev => prev ? {...prev, quiz: updateFn(prev.quiz) as QuizQuestion[]} : null);
                else setQuiz(prev => prev ? updateFn(prev) as QuizQuestion[] : null);
            }
        }
        return;
    }


    const questionIndex = targetQuestionSource.findIndex(q => q.id === questionId);
    if (questionIndex === -1) return;

    const currentQuestion = targetQuestionSource[questionIndex];
    if (currentQuestion.detailedExplanation && !currentQuestion.detailedExplanation.startsWith("Error:")) return; 
    if (currentQuestion.isDetailedExplanationLoading) return;


    const updateStateForExplanation = (updater: (prevQuestions: (QuizQuestion | ExamQuestion)[]) => (QuizQuestion | ExamQuestion)[]) => {
        if (isExamQuestion) {
            if (reviewingExam) setReviewingExam(prev => prev ? { ...prev, questions: updater(prev.questions) as ExamQuestion[] } : null);
            else setCurrentExamQuestions(prev => prev ? updater(prev) as ExamQuestion[] : null);
        } else {
            if (reviewingQuiz) setReviewingQuiz(prev => prev ? { ...prev, quiz: updater(prev.quiz) as QuizQuestion[] } : null);
            else setQuiz(prev => prev ? updater(prev) as QuizQuestion[] : null);
        }
    };
    
    updateStateForExplanation(prevQuestions => {
        const updated = [...prevQuestions];
        updated[questionIndex] = { ...updated[questionIndex], isDetailedExplanationLoading: true, detailedExplanation: undefined };
        return updated;
    });

    try {
        const adaptableQuestion: QuizQuestion = { 
            id: currentQuestion.id,
            question: (currentQuestion as ExamQuestion).questionText || (currentQuestion as QuizQuestion).question,
            options: currentQuestion.options || [],
            correctAnswer: currentQuestion.correctAnswer,
            explanation: currentQuestion.explanation,
        };

        const explanationData = await generateDetailedQuizExplanation(
            adaptableQuestion, 
            contextModuleTitle,
            contextModuleMaterialContent, 
            targetLanguage
        );

        if (explanationData && explanationData.detailedExplanation) {
            updateStateForExplanation(prevQuestions => {
                const updated = [...prevQuestions];
                updated[questionIndex] = { 
                    ...updated[questionIndex], 
                    detailedExplanation: explanationData.detailedExplanation, 
                    isDetailedExplanationLoading: false 
                };
                return updated;
            });
        } else {
            throw new Error("Failed to load detailed explanation (empty response).");
        }
    } catch (err) {
        console.error("Error loading detailed explanation:", err);
        updateStateForExplanation(prevQuestions => {
            const updated = [...prevQuestions];
            updated[questionIndex] = { ...updated[questionIndex], isDetailedExplanationLoading: false, detailedExplanation: `Error: Could not load more details. (${(err as Error).message})` };
            return updated;
        });
    }
  }, [quiz, reviewingQuiz, currentQuizModuleInfo, targetLanguage, curriculum, handleLoadModuleDetails, currentExamQuestions, reviewingExam, activeExamModuleInfo, historyItems, selectedHistoryItemId]);

  const handleRetakeQuiz = useCallback(async () => {
    let moduleToRetakeTitle: string | undefined;
    let moduleForRetake: CurriculumModule | undefined;
    let currentLearningJourney = currentLearningJourneyMemo;


    if (reviewingQuiz) { 
        moduleToRetakeTitle = reviewingQuiz.moduleTitle;
    } else if (quizAttemptCompleted && currentQuizModuleInfo) { 
        moduleToRetakeTitle = currentQuizModuleInfo.title;
    }


    if (!moduleToRetakeTitle || !currentLearningJourney || !curriculum) { 
        setError("Could not determine which quiz to retake. Please try again.");
        return;
    }
    
    const modEntry = currentCurriculumModulesMap.get(moduleToRetakeTitle);
    const moduleIndex = modEntry ? modEntry.index : -1;
    if (moduleIndex === -1) {
        setError(`Module "${moduleToRetakeTitle}" not found in current curriculum.`);
        return;
    }
    
    moduleForRetake = currentLearningJourney.curriculum.modules[moduleIndex];

    if (!moduleForRetake.moduleMaterial) {
        setViewMode('loading');
        setError(null);
        const loadedMaterial = await handleLoadModuleDetails(moduleIndex); 
        setViewMode('results'); 
        if (!loadedMaterial) {
            setError(`Failed to load material for "${moduleToRetakeTitle}" before retaking quiz. Please try loading it from the 'Material' tab first.`);
            setCurriculumSubTab('material');
            return;
        }
        currentLearningJourney = currentLearningJourneyMemo;
        let reFetchedModule: CurriculumModule | undefined;
        if (currentLearningJourney) {
            reFetchedModule = currentCurriculumModulesMap.get(moduleToRetakeTitle)?.module;
        } else if (curriculum) {
            reFetchedModule = activeCurriculumModulesMap.get(moduleToRetakeTitle)?.module;
        }

        if (reFetchedModule && reFetchedModule.moduleMaterial) {
            moduleForRetake = reFetchedModule;
        } else { 
            moduleForRetake = { ...moduleForRetake, moduleMaterial: loadedMaterial };
        }
    }
    
    resetQuizState();
    setReviewingQuiz(null); 
    setQuizAttemptCompleted(false); 
    
    if(moduleForRetake && moduleForRetake.moduleMaterial){
      setCurrentQuizModuleInfo({ title: moduleForRetake.title, moduleMaterial: moduleForRetake.moduleMaterial });
      await handleGenerateQuiz(moduleForRetake); 
    } else {
        setError(`Material for "${moduleToRetakeTitle}" is still missing. Cannot generate quiz.`);
        setCurriculumSubTab('material');
    }

  }, [reviewingQuiz, currentQuizModuleInfo, quizAttemptCompleted, curriculum, handleLoadModuleDetails, resetQuizState, handleGenerateQuiz, historyItems, selectedHistoryItemId, setError, setViewMode, setCurriculumSubTab]);


  const handleStartRetakeQuizFromHistoryList = useCallback(async (moduleTitleToRetake: string) => {
    let currentLearningJourney = currentLearningJourneyMemo;
    if (!currentLearningJourney || !selectedHistoryItemId || !curriculum) { 
        setError("Cannot retake quiz. Current learning session data is incomplete.");
        return;
    }
    setViewMode('loading');
    setError(null);

    let moduleForRetake: CurriculumModule | undefined;
    const modEntry = currentCurriculumModulesMap.get(moduleTitleToRetake);
    const moduleIndex = modEntry ? modEntry.index : -1;

    if (moduleIndex === -1) {
        setError(`Module "${moduleTitleToRetake}" not found in the current curriculum.`);
        setViewMode('results');
        return;
    }
    
    moduleForRetake = currentLearningJourney.curriculum.modules[moduleIndex];
    let material: string | null | undefined = moduleForRetake.moduleMaterial;

    if (!material) {
        material = await handleLoadModuleDetails(moduleIndex); 
        if (!material) {
            setError(`Failed to load material for "${moduleTitleToRetake}" to retake the quiz. Please try loading it from the 'Material' tab first.`);
            setViewMode('results');
            setCurriculumSubTab('material');
            return;
        }
        currentLearningJourney = currentLearningJourneyMemo;
        let reFetchedModule: CurriculumModule | undefined;
        if (currentLearningJourney) {
            reFetchedModule = currentCurriculumModulesMap.get(moduleTitleToRetake)?.module;
        } else if (curriculum) {
            reFetchedModule = activeCurriculumModulesMap.get(moduleTitleToRetake)?.module;
        }

        if (reFetchedModule && reFetchedModule.moduleMaterial) {
            moduleForRetake = reFetchedModule;
            material = reFetchedModule.moduleMaterial; 
        } else {
            moduleForRetake = { ...moduleForRetake, moduleMaterial: material };
        }
    }
    
    if (!material) { 
        setError(`Material for "${moduleTitleToRetake}" is still missing after attempting to load. Cannot generate quiz.`);
        setViewMode('results');
        setCurriculumSubTab('material');
        return;
    }

    resetQuizState();
    setReviewingQuiz(null); 
    setQuizAttemptCompleted(false); 
    setCurrentQuizModuleInfo({ title: moduleForRetake.title, moduleMaterial: material });
    
    await handleGenerateQuiz(moduleForRetake); 

  }, [curriculum, selectedHistoryItemId, handleLoadModuleDetails, resetQuizState, handleGenerateQuiz, historyItems, setCurrentQuizModuleInfo, setViewMode, setError, setCurriculumSubTab]);


  const handleTutorSendMessage = useCallback(async () => {
    if (!tutorInput.trim() || !tutorSession.chat || isTutorTyping) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: tutorInput,
      timestamp: new Date(),
    };
    
    setTutorSession(prev => ({ ...prev, history: [...prev.history, userMessage] }));
    setTutorInput('');
    setIsTutorTyping(true);

    const aiResponseId = `msg-${Date.now()}-ai`;
    let fullAiResponse = "";

    setTutorSession(prev => ({
      ...prev,
      history: [...prev.history, { id: aiResponseId, sender: 'ai', text: "...", timestamp: new Date() }]
    }));

    try {
        await sendMessageToTutorStream(tutorSession.chat, userMessage.text, (chunkText) => {
        fullAiResponse += chunkText;
        setTutorSession(prev => ({
            ...prev,
            history: prev.history.map(msg => 
            msg.id === aiResponseId ? { ...msg, text: fullAiResponse } : msg
            )
        }));
        });
    } catch (error) {
        console.error("Tutor send message stream error:", error);
        setTutorSession(prev => ({
            ...prev,
            history: prev.history.map(msg => 
            msg.id === aiResponseId ? { ...msg, text: "Sorry, I encountered an issue. Please try again." } : msg
            )
        }));
    } finally {
        setIsTutorTyping(false);
    }
  }, [tutorInput, tutorSession.chat, isTutorTyping]);

  const handleReviewQuizFromHistory = useCallback((quizRecord: StoredQuizAttempt) => {
    setReviewingQuiz(quizRecord);
    setCurrentQuizQuestionIndex(0);
    let currentLearningJourney = currentLearningJourneyMemo;
    const originalModule = currentCurriculumModulesMap.get(quizRecord.moduleTitle)?.module;

    if(originalModule && originalModule.moduleMaterial){
        setCurrentQuizModuleInfo({ title: quizRecord.moduleTitle, moduleMaterial: originalModule.moduleMaterial });
    } else {
        setCurrentQuizModuleInfo({ title: quizRecord.moduleTitle, moduleMaterial: "" }); 
    }
    setQuizAttemptCompleted(false); 
    setQuiz(null); 
    setCurriculumSubTab('quiz'); 
  }, [currentLearningJourneyMemo, currentCurriculumModulesMap]);

  const handleInitiateExamConfig = useCallback(async (module: CurriculumModule, initialConfig?: Partial<ExamConfiguration>) => {
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
        setError(`Module material for "${module.title}" must be loaded first. Please go to the 'Material' tab and load it.`);
        setCurriculumSubTab('material');
        if (curriculum) { 
            const modEntry = activeCurriculumModulesMap.get(module.title);
            if (modEntry) {
                const modIdx = modEntry.index;
                setSelectedMaterialModuleIndex(modIdx); 
                 setCurriculum(prev => { 
                    if(!prev) return null;
                    const updatedModules = [...prev.modules];
                    updatedModules[modIdx] = {...updatedModules[modIdx], loadingError: "Material must be loaded for exam generation."};
                    return {...prev, modules: updatedModules};
                 });
            }
        }
        setViewMode('results'); 
        return;
    }
    
    setActiveExamModuleInfo({ title: module.title, moduleMaterial: material });
    setCurrentExamConfigForView(initialConfig || null); 
    setExamViewMode('config');
    setCurriculumSubTab('exam'); 
    setViewMode('results'); 
  }, [curriculum, handleLoadModuleDetails, historyItems, selectedHistoryItemId]);


  const handleStartRetakeExamFromHistory = useCallback(async (examAttemptToRetake: ExamAttempt) => {
    let currentLearningJourney = currentLearningJourneyMemo;
    if (!currentLearningJourney || !selectedHistoryItemId) {
        setError("Cannot retake exam. Current learning session data is incomplete.");
        setCurriculumSubTab('study_log'); 
        return;
    }
    
    const moduleTitleToRetake = examAttemptToRetake.config.moduleTitle;
    const moduleForRetake = currentCurriculumModulesMap.get(moduleTitleToRetake)?.module;

    if (!moduleForRetake) {
        setError(`Module "${moduleTitleToRetake}" not found in the current curriculum.`);
        setCurriculumSubTab('study_log');
        return;
    }
    
    await handleInitiateExamConfig(moduleForRetake, examAttemptToRetake.config);

  }, [selectedHistoryItemId, handleInitiateExamConfig, setError, currentLearningJourneyMemo, currentCurriculumModulesMap]);

  const handleSubmitExam = useCallback((autoSubmitted = false) => {
    if (!currentExamQuestions || !currentExamAttempt || !currentExamAttempt.config || !selectedHistoryItemId) return; 
    if (examTimer.intervalId) clearInterval(examTimer.intervalId);
    setExamTimer(prev => ({ ...prev, isActive: false, intervalId: null }));

    let calculatedScore = 0;
    let calculatedMaxScore = 0;

    const processedQuestions = currentExamQuestions.map(q => {
        calculatedMaxScore += q.maxPoints;
        let questionScore = 0;
        let isQCorrect = false;
        if (q.userAnswer === q.correctAnswer) {
            questionScore = q.maxPoints;
            isQCorrect = true;
        }
        calculatedScore += questionScore;
        return { ...q, scoreAwarded: questionScore, isCorrect: isQCorrect, feedbackShown: true };
    });

    const finalAttempt: ExamAttempt = {
        ...currentExamAttempt,
        questions: processedQuestions,
        endTime: Date.now(),
        timeTakenSeconds: (Date.now() - currentExamAttempt.startTime) / 1000,
        totalScore: calculatedScore, 
        maxScore: calculatedMaxScore, 
        timestamp: currentExamAttempt.startTime 
    };
    
    setCurrentExamAttempt(finalAttempt); 
    setExamAttemptCompleted(true); 
    setReviewingExam(finalAttempt); 
    setCurriculumSubTab('exam'); 
    setExamViewMode('results'); 
    
    setHistoryItems(prevItems => {
        const itemIndex = prevItems.findIndex(h => h.id === selectedHistoryItemId);
        if (itemIndex === -1) return prevItems;
        const newItems = [...prevItems];
        newItems[itemIndex] = {
            ...prevItems[itemIndex],
            examHistory: [...(prevItems[itemIndex].examHistory || []), finalAttempt].sort((a,b) => b.timestamp - a.timestamp)
        };
        return newItems;
    });
    if (autoSubmitted) {
        alert("Time's up! Your exam has been automatically submitted.");
    }
  }, [currentExamQuestions, selectedHistoryItemId, currentExamAttempt, examTimer.intervalId]);


  const handleGenerateAndStartExam = useCallback(async (config: ExamConfiguration) => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return;
    }
    if ((user.points ?? 100) < 15) {
      setPointsModalInfo({ required: 15, remaining: user.points ?? 0, action: "Generate Ujian" });
      setIsPointsModalOpen(true);
      return;
    }
    if (!activeExamModuleInfo || !activeExamModuleInfo.moduleMaterial) {
        setError("Cannot generate exam: Active module information is missing.");
        setCurriculumSubTab('material'); 
        setExamViewMode('module_selection');
        return;
    }
    setIsGeneratingExam(true);
    setViewMode('loading'); 
    setError(null);
    
    try {
        const questions = await generateExamQuestions(
            activeExamModuleInfo.title,
            activeExamModuleInfo.moduleMaterial,
            config.numMultipleChoice,
            config.difficulty,
            targetLanguage
        );

        if (questions && questions.length > 0) {
            const initializedQuestions = questions.map(q => ({...q, userAnswer: '', scoreAwarded: 0, feedbackShown: false, type: 'multiple-choice' as ExamQuestionType}));
            setCurrentExamQuestions(initializedQuestions); 
            setCurrentExamQuestionIndex(0);
            setExamViewMode('taking'); 
            setExamAttemptCompleted(false);
            
            const startTime = Date.now();
            const durationSeconds = config.timeLimitEnabled && config.durationMinutes ? config.durationMinutes * 60 : 0;
            
            setCurrentExamAttempt({ 
                id: `exam-${Date.now()}`,
                config, 
                questions: initializedQuestions, 
                startTime,
                totalScore: 0, 
                maxScore: questions.reduce((sum, q) => sum + q.maxPoints, 0),
                timestamp: startTime
            });

            if (config.timeLimitEnabled && durationSeconds > 0) {
                setExamTimer(prev => {
                    if (prev.intervalId) clearInterval(prev.intervalId);
                    const newIntervalId = window.setInterval(() => { 
                        setExamTimer(currentTimer => {
                            if (currentTimer.timeLeft <= 1) {
                                clearInterval(newIntervalId);
                                handleSubmitExam(true); 
                                return { ...currentTimer, timeLeft: 0, isActive: false, intervalId: null };
                            }
                            return { ...currentTimer, timeLeft: currentTimer.timeLeft - 1 };
                        });
                    }, 1000);
                    return { timeLeft: durationSeconds, intervalId: newIntervalId, isActive: true };
                });
            }
        } else {
            throw new Error("Failed to generate exam questions or no questions were returned.");
        }
        setViewMode('results'); 
    } catch (err) {
        console.error("Error generating exam:", err);
        setError(formatAiError(err));
        setExamViewMode('config'); 
        setViewMode('results');
    } finally {
        setIsGeneratingExam(false);
        void refresh(); // Re-sync points (including refunds) after exam generation
    }
  }, [activeExamModuleInfo, targetLanguage, handleSubmitExam, refresh]); 

  const handleExamAnswer = (questionId: string, answer: string) => {
    if (!currentExamQuestions || examAttemptCompleted || reviewingExam) return;

    setCurrentExamQuestions(prevQuestions =>
        prevQuestions!.map((q, index) =>
            index === currentExamQuestionIndex && q.id === questionId ? { ...q, userAnswer: answer } : q
        )
    );
  };
  

  const handleExamNavigation = (direction: 'next' | 'prev') => {
    const questionsSource = reviewingExam ? reviewingExam.questions : currentExamQuestions;
    if (!questionsSource) return;

    if (direction === 'next' && currentExamQuestionIndex < questionsSource.length - 1) {
        setCurrentExamQuestionIndex(prev => prev + 1);
    } else if (direction === 'prev' && currentExamQuestionIndex > 0) {
        setCurrentExamQuestionIndex(prev => prev - 1);
    }
  };
  
  const handleReviewExamFromHistory = useCallback((examRecord: ExamAttempt) => {
    setReviewingExam(examRecord);
    setCurrentExamQuestionIndex(0);
    setExamViewMode('results'); 
    setCurriculumSubTab('exam'); 

    let currentLearningJourney = currentLearningJourneyMemo;
    const originalModule = currentCurriculumModulesMap.get(examRecord.config.moduleTitle)?.module;
    if(originalModule && originalModule.moduleMaterial){
        setActiveExamModuleInfo({ title: examRecord.config.moduleTitle, moduleMaterial: originalModule.moduleMaterial });
    } else {
        setActiveExamModuleInfo({ title: examRecord.config.moduleTitle, moduleMaterial: "" }); 
        console.warn(`Material for reviewed exam module "${examRecord.config.moduleTitle}" not readily available.`);
    }
    setCurrentExamQuestions(null);
    setCurrentExamAttempt(null);
    setExamAttemptCompleted(false);
  }, [currentLearningJourneyMemo, currentCurriculumModulesMap]);

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
        setError(`Module material for "${module.title}" must be loaded first.`);
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
        const newDeck: FlashcardDeck = { moduleId: module.title, moduleTitle: module.title, cards: [] };
        setFlashcardDecks(prev => ({ ...prev, [module.title]: newDeck }));
        setCurrentFlashcardDeck(newDeck);
    }
    
    setCurriculumSubTab('flashcards');
    setFlashcardSubView('daftar'); 
    setViewMode('results');
  }, [handleLoadModuleDetails, selectedHistoryItemId, flashcardDecks, curriculum]);


  const handleGenerateFlashcards = useCallback(async () => {
    if (status !== 'authenticated' || !user) {
      setIsAuthModalOpen(true);
      return;
    }
    if ((user.points ?? 100) < 5) {
      setPointsModalInfo({ required: 5, remaining: user.points ?? 0, action: "Generate Kartu Kilat" });
      setIsPointsModalOpen(true);
      return;
    }
    if (!activeFlashcardModuleInfo || !activeFlashcardModuleInfo.moduleMaterial || !selectedHistoryItemId) {
        setError("Cannot generate flashcards: Active module information or learning session is missing.");
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
            setError("No flashcards were generated. The AI might not have found distinct terms or an issue occurred.");
        }
    } catch (err) {
        console.error("Error generating flashcards:", err);
        setError(formatAiError(err));
    } finally {
        setIsGeneratingFlashcards(false);
        void refresh(); // Re-sync points (including refunds) after flashcard generation
    }
  }, [activeFlashcardModuleInfo, targetLanguage, selectedHistoryItemId, refresh]);

  const handleOpenAddFlashcardModal = (cardToEdit?: Flashcard) => {
    if (cardToEdit) {
        setFlashcardFormState({ term: cardToEdit.term, definition: cardToEdit.definition });
        setEditingFlashcardId(cardToEdit.id);
    } else {
        setFlashcardFormState({ term: '', definition: '' });
        setEditingFlashcardId(null);
    }
    setShowAddFlashcardModal(true);
  };

  const handleSaveFlashcard = () => {
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
  };
  
  const handleDeleteFlashcard = (cardId: string) => {
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
  };

  const handleAssessFlashcard = (cardId: string, difficulty: FlashcardDifficulty) => {
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
            if (difficulty === 'hard') {
                newStatus = 'learning'; nextReviewDate = now + oneDay;
            } else if (difficulty === 'medium') {
                newStatus = 'reviewing'; nextReviewDate = now + threeDays;
            } else { 
                newStatus = 'known'; nextReviewDate = now + sevenDays;
            }
            break;
        case 'reviewing':
            if (difficulty === 'hard') {
                newStatus = 'learning'; nextReviewDate = now + oneDay;
            } else if (difficulty === 'medium') {
                newStatus = 'reviewing'; nextReviewDate = now + fiveDays;
            } else { 
                newStatus = 'known'; nextReviewDate = now + tenDays;
            }
            break;
        case 'known':
            if (difficulty === 'hard') {
                newStatus = 'reviewing'; nextReviewDate = now + threeDays;
            } else if (difficulty === 'medium') {
                newStatus = 'known'; nextReviewDate = now + fourteenDays;
            } else { 
                newStatus = 'mastered'; nextReviewDate = now + thirtyDays;
            }
            break;
        case 'mastered':
            if (difficulty === 'hard') {
                newStatus = 'reviewing'; nextReviewDate = now + threeDays;
            } else if (difficulty === 'medium') {
                newStatus = 'known'; nextReviewDate = now + fourteenDays;
            } else { 
                newStatus = 'mastered'; nextReviewDate = now + sixtyDays;
            }
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
  };
  
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
  
  const flashcardStatusCounts = useMemo(() => {
    if (!currentFlashcardDeck) return { learning: 0, reviewing: 0, known: 0, mastered: 0 };
    return currentFlashcardDeck.cards.reduce((acc, card) => {
        acc[card.status] = (acc[card.status] || 0) + 1;
        return acc;
      }, {} as Record<FlashcardStatus, number>);
  }, [currentFlashcardDeck]);

  const sortedStackCards = useMemo(() => getSortedFlashcardsForStack(), [getSortedFlashcardsForStack]);

  const quizToShowInResultOrReview = useMemo(() => {
    const quizModuleTitleForDisplay = currentQuizModuleInfo?.title || reviewingQuiz?.moduleTitle;
    return reviewingQuiz || (quizAttemptCompleted && quiz ? {
        quiz: quiz,
        score: quiz.reduce((acc, q) => acc + (q.isCorrect ? 1 : 0), 0),
        moduleTitle: quizModuleTitleForDisplay || ""
    } as StoredQuizAttempt : null);
  }, [reviewingQuiz, quizAttemptCompleted, quiz, currentQuizModuleInfo?.title]);


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

  const handleStartFlashcardMatchGame = useCallback(() => {
    if (!currentFlashcardDeck || currentFlashcardDeck.cards.length === 0) {
      setError("No flashcards available to start the matching game. Please add or generate some flashcards first.");
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
      gameItems.push({
        id: `term-${card.id}`,
        flashcardId: card.id,
        type: 'term',
        text: card.term,
        isVisible: true,
      });
      gameItems.push({
        id: `def-${card.id}`,
        flashcardId: card.id,
        type: 'definition',
        text: card.definition,
        isVisible: true,
      });
    });
    setFlashcardMatchGameItems(shuffleArray(gameItems));
  }, [currentFlashcardDeck]);
  
  const handleFlashcardMatchAttempt = (itemId: string) => {
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
  };
  
  const formatMatchGameTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Resource Fetching Logic
  const handleFetchResources = useCallback(async () => {
    if (!selectedHistoryItemId || !topic) {
      setFetchResourcesError("No active topic to fetch resources for.");
      return;
    }
    setIsFetchingResources(true);
    setFetchResourcesError(null);
    setCurrentLearningResources(null); // Clear previous resources if any

    try {
      const resources = await fetchLearningResources(topic, targetLanguage);
      if (resources) {
        setCurrentLearningResources(resources);
        // Update history item
        setHistoryItems(prevItems => {
          const itemIndex = prevItems.findIndex(h => h.id === selectedHistoryItemId);
          if (itemIndex === -1) return prevItems;
          const newItems = [...prevItems];
          newItems[itemIndex] = { ...prevItems[itemIndex], learningResources: resources };
          return newItems;
        });
      } else {
        setFetchResourcesError("Tidak dapat menemukan sumber belajar untuk topik ini.");
      }
    } catch (err) {
      console.error("Error fetching resources:", err);
      setFetchResourcesError(formatAiError(err));
    } finally {
      setIsFetchingResources(false);
      void refresh(); // Re-sync points (including refunds) after resources fetch
    }
  }, [selectedHistoryItemId, topic, targetLanguage, refresh]);

  useEffect(() => {
    // This effect now primarily loads resources from history if available,
    // or if a new journey was just created, currentLearningResources would already be set.
    // The manual fetch is only if explicitly navigating to the tab and resources are missing for some reason.
    if (activeTab === 'resources' && selectedHistoryItemId && !isFetchingResources) {
      const currentItem = currentLearningJourneyMemo;
      if (currentItem) {
        if (currentItem.learningResources) {
            if (!currentLearningResources || currentLearningResources.content !== currentItem.learningResources.content) {
               setCurrentLearningResources(currentItem.learningResources);
            }
        } else if (!fetchResourcesError) { 
            // If not in history and no error previously, attempt fetch (e.g., if initial fetch failed silently or was skipped)
            handleFetchResources();
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedHistoryItemId, currentLearningJourneyMemo]); // Removed currentLearningResources, isFetchingResources, fetchResourcesError dependencies to simplify and avoid re-fetches



  useEffect(() => {
    return () => { 
      if (matchGameTimerIntervalIdRef.current) {
        clearInterval(matchGameTimerIntervalIdRef.current);
      }
      if (examTimer.intervalId) { 
        clearInterval(examTimer.intervalId);
      }
    };
  }, [examTimer.intervalId]);


  useEffect(() => { 
      const chatOutput = document.getElementById('chat-output');
      if (chatOutput) {
          chatOutput.scrollTop = chatOutput.scrollHeight;
      }
  }, [tutorSession.history]);

  // Auto-select first module material when 'material' tab is active and no module selected
  useEffect(() => {
    if (curriculumSubTab === 'material' && curriculum && curriculum.modules.length > 0 && selectedMaterialModuleIndex === null) {
      setSelectedMaterialModuleIndex(0);
      const firstModule = curriculum.modules[0];
      if (!firstModule.moduleMaterial && !firstModule.isLoading && !firstModule.loadingError) {
        handleLoadModuleDetails(0);
      }
    }
  }, [curriculumSubTab, curriculum, selectedMaterialModuleIndex, handleLoadModuleDetails]);


  const formatSevenDayTask = (taskContent: string): string => {
    if (!taskContent) return "";
    return taskContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  };

  const renderMainContent = () => {
    const largeTextBase = "text-lg md:text-xl text-brand-black dark:text-gray-200"; 
    const heading1Size = "text-2xl sm:text-3xl md:text-3xl font-bold text-brand-blue dark:text-blue-300";
    const heading2Size = "text-xl sm:text-2xl md:text-2xl font-semibold text-brand-blue dark:text-blue-300";

    const currentHistoryJourney = currentLearningJourneyMemo;

    const mainTabs: { name: ActiveTab, label: string, icon: React.ReactNode }[] = [
        { name: 'curriculum', label: 'Curriculum', icon: <Icons.BookOpen className="w-4 h-4 md:w-5 md:h-5" /> },
        { name: 'plan', label: '7-Day Plan', icon: <Icons.CalendarDays className="w-4 h-4 md:w-5 md:h-5" /> },
        { name: 'resources', label: 'Resources', icon: <Icons.LightBulb className="w-4 h-4 md:w-5 md:h-5" /> },
        { name: 'tutor', label: 'Tutor', icon: <Icons.ChatBubble className="w-4 h-4 md:w-5 md:h-5" /> },
    ];
    const curriculumSubTabsList: { name: CurriculumSubTab, label: string}[] = [
        { name: 'syllabus', label: 'Syllabus' },
        { name: 'material', label: 'Material' },
        { name: 'quiz', label: 'Quiz' }, 
        { name: 'exam', label: 'Exam' }, 
        { name: 'flashcards', label: 'Flashcards' },
        { name: 'study_log', label: 'Study Log' }
    ];


    switch (viewMode) {
      case 'input':
        return (
          <div className="flex items-center justify-center min-h-[calc(100vh-80px)] md:min-h-[calc(100vh-60px)] p-2 sm:p-4">
            <MemoizedTopicInputForm onSubmit={handleFormSubmit} isLoading={false} initialTopic={topic} initialLanguage={targetLanguage} />
          </div>
        );
      case 'loading':
        let determinedLoadingMessage = loadingStepMessage || "Generating your personalized learning experience...";
        if (!loadingStepMessage) { 
            if (isGeneratingExam) {
                determinedLoadingMessage = `Generating exam for ${activeExamModuleInfo?.title || 'selected module'}...`;
            } else if (isGeneratingFlashcards) {
                determinedLoadingMessage = `Generating flashcards for ${activeFlashcardModuleInfo?.title || 'selected module'}...`;
            } else if (curriculum?.modules.some(m => m.isLoading) && selectedMaterialModuleIndex !== null && curriculum.modules[selectedMaterialModuleIndex]?.isLoading) {
                const loadingModule = curriculum.modules[selectedMaterialModuleIndex];
                determinedLoadingMessage = `Loading material for ${loadingModule?.title || 'module'}...`;
            } else if (quiz?.some(q => q.isDetailedExplanationLoading) || reviewingQuiz?.quiz.some(q=>q.isDetailedExplanationLoading)) {
                determinedLoadingMessage = `Fetching more details for quiz question...`;
            } else if (currentExamQuestions?.some(q=> q.isDetailedExplanationLoading) || reviewingExam?.questions.some(q=>q.isDetailedExplanationLoading)) {
                determinedLoadingMessage = `Fetching more details for exam question...`;
            } else if (!quiz && curriculumSubTab === 'quiz' && currentQuizModuleInfo && !reviewingQuiz) {
                determinedLoadingMessage = `Generating quiz for ${currentQuizModuleInfo.title}...`;
            } else if (isFetchingResources && activeTab === 'resources') { // Show resource fetching message only if on resources tab or initial load
                determinedLoadingMessage = `Fetching learning resources for ${topic}...`;
            } else if (selectedHistoryItemId && !curriculum) { 
                determinedLoadingMessage = "Loading session...";
            }
        }
        return <LoadingSpinner message={determinedLoadingMessage} />;

      case 'error':
        return (
          <div className="text-center p-4 md:p-8 bg-brand-white dark:bg-brand-black rounded-lg shadow-md">
            <div className="flex justify-center mb-4"> <Icons.XCircle className="w-10 h-10 md:w-12 md:h-12 text-brand-red" /></div>
            <h2 className={`text-xl md:text-2xl font-semibold text-brand-red my-3`}>Oops! Something went wrong.</h2>
            <p className={`${largeTextBase} mb-6`}>{error || "An unknown error occurred."}</p>
            <button
              onClick={() => resetAppState(true)}
              className={`px-4 py-2 md:px-6 md:py-2 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg ${largeTextBase}`}
            >
              Start New Session
            </button>
          </div>
        );
      case 'results':
        if (!curriculum && !sevenDayPlan && !currentHistoryJourney) { 
          return (
             <div className="text-center p-4 md:p-8 dark:text-gray-400">
                <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>No content to display. Please start a new session or select one from history.</p>
             </div>
          );
        }

        const activeQuizForDisplay = quiz; 
        const quizModuleTitleForDisplay = currentQuizModuleInfo?.title || reviewingQuiz?.moduleTitle;
        const currentActiveQuizQuestionData = activeQuizForDisplay ? activeQuizForDisplay[currentQuizQuestionIndex] : null;
        
        const currentQuizQuestionForReviewView = quizToShowInResultOrReview ? quizToShowInResultOrReview.quiz[currentQuizQuestionIndex] : null;
        
        const examToShowInResultView = reviewingExam || (examAttemptCompleted ? currentExamAttempt : null);
        
        let examPercentageScore = 0;
        if (examToShowInResultView) {
            examPercentageScore = examToShowInResultView.maxScore > 0 
                ? Math.round((examToShowInResultView.totalScore / examToShowInResultView.maxScore) * 100) 
                : 0;
        }
        const examModuleTitleForTakingDisplay = activeExamModuleInfo?.title || currentExamAttempt?.config.moduleTitle || reviewingExam?.config.moduleTitle;

        const displayedModuleForMaterialView = curriculum && selectedMaterialModuleIndex !== null ? curriculum.modules[selectedMaterialModuleIndex] : null;


        return (
          <div className="w-full p-2 sm:p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-md">
             
                <>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 pb-4 border-b border-brand-mediumGray dark:border-gray-700">
                        <div className={`w-full sm:w-auto mb-2 sm:mb-0 text-center ${ activeTab === 'curriculum' && curriculumSubTab === 'material' ? 'sm:text-left' : 'sm:text-center'}`}> 
                            <h1 className={`text-2xl sm:text-3xl md:text-4xl font-bold text-brand-blue dark:text-blue-300 truncate`}>
                                Learning: <span className="text-brand-orange dark:text-orange-400">{topic || "N/A"}</span>
                            </h1>
                        </div>
                        {targetLanguage && <div className={`text-sm md:text-md text-brand-black/70 dark:text-gray-300 sm:ml-4 text-center sm:text-left`}>Language: <span className="font-semibold text-brand-blue dark:text-blue-400">{targetLanguage}</span></div>}
                    </div>
                    
                    {currentHistoryJourney && typeof currentHistoryJourney.overallProgress === 'number' && (
                    <div className="my-4 p-3 bg-brand-lightGray dark:bg-gray-700 rounded-lg shadow border border-brand-mediumGray dark:border-gray-600">
                        <div className="flex justify-between items-center mb-1">
                        <span className="text-brand-blue dark:text-blue-300 font-semibold text-md md:text-lg">Learning Progress:</span>
                        <span className="text-brand-green dark:text-green-400 font-bold text-md md:text-lg">{Math.round(currentHistoryJourney.overallProgress)}%</span>
                        </div>
                        <div className="w-full bg-brand-mediumGray dark:bg-gray-600 rounded-full h-2.5 md:h-3.5">
                        <div 
                            className="bg-brand-green h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, Math.max(0, currentHistoryJourney.overallProgress))}%` }}
                            aria-valuenow={currentHistoryJourney.overallProgress} aria-valuemin={0} aria-valuemax={100}
                        ></div>
                        </div>
                    </div>
                    )}

                    {error && (activeTab === 'curriculum' || (activeTab === 'resources' && fetchResourcesError) ) && ( 
                    <div className="mb-4 p-3 bg-brand-red/10 dark:bg-red-900/30 border border-brand-red dark:border-red-700 text-brand-red dark:text-red-400 rounded-md text-sm md:text-base">
                        Error: {error || fetchResourcesError}
                    </div>
                    )}
                </>
            

            <div className="mb-4 md:mb-6 border-b border-brand-mediumGray dark:border-gray-700">
              <nav className="flex space-x-1 sm:space-x-2 -mb-px overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {mainTabs.map((tabInfo) => ( 
                  <button
                    key={tabInfo.name}
                    onClick={() => { 
                        setActiveTab(tabInfo.name); 
                        // setError(null); // Keep general errors unless specifically for resources
                        if (tabInfo.name !== 'resources') setFetchResourcesError(null);
                    }}
                    className={`whitespace-nowrap py-3 px-2 sm:px-3 md:px-4 border-b-2 font-medium text-sm sm:text-md md:text-lg flex items-center space-x-1 md:space-x-2
                      ${activeTab === tabInfo.name 
                        ? 'border-brand-blue dark:border-blue-400 text-brand-blue dark:text-blue-400' 
                        : 'border-transparent text-brand-black/70 dark:text-gray-400 hover:text-brand-blue dark:hover:text-blue-400 hover:border-brand-orange dark:hover:border-orange-500'}
                    `}
                    role="tab"
                    aria-selected={activeTab === tabInfo.name}
                    disabled={!selectedHistoryItemId && viewMode === 'results'} 
                  >
                    {tabInfo.icon}
                    <span>{tabInfo.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {activeTab === 'curriculum' && curriculum && (
              <div>
                <div className="mb-4 overflow-x-auto scrollbar-hide">
                  <nav className="flex space-x-1 sm:space-x-2 md:space-x-3" aria-label="Curriculum SubTabs">
                    {curriculumSubTabsList.map((subTabInfo) => (
                      <button
                        key={subTabInfo.name}
                        onClick={() => { 
                            setCurriculumSubTab(subTabInfo.name); 
                            setError(null);
                            if (subTabInfo.name === 'study_log') { 
                                setReviewingQuiz(null); setQuiz(null); setQuizAttemptCompleted(false); 
                                setReviewingExam(null); setCurrentExamAttempt(null); setExamAttemptCompleted(false); setExamViewMode('module_selection');
                                setActiveFlashcardModuleInfo(null); setCurrentFlashcardDeck(null);
                            }
                            if (subTabInfo.name === 'exam' && examViewMode !== 'taking' && examViewMode !== 'config' && !reviewingExam) { 
                                setExamViewMode('module_selection'); 
                                setCurrentExamConfigForView(null); 
                            }
                            if (subTabInfo.name === 'quiz' && !reviewingQuiz && !activeQuizForDisplay) {
                                resetQuizState();
                            }
                            if (subTabInfo.name === 'flashcards') {
                                if (activeFlashcardModuleInfo) { 
                                    setCurrentFlashcardDeck(flashcardDecks[activeFlashcardModuleInfo.title] || null);
                                } else { 
                                    setActiveFlashcardModuleInfo(null);
                                    setCurrentFlashcardDeck(null);
                                }
                                setFlashcardSubView('daftar'); 
                                if (subTabInfo.name === 'flashcards' && flashcardSubView === 'permainan' && currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && !matchGameActive) {
                                    // Game start is handled by its own button
                                }
                            }
                        }}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 md:px-3.5 font-medium text-xs sm:text-sm md:text-base rounded-md whitespace-nowrap
                          ${curriculumSubTab === subTabInfo.name 
                            ? 'bg-brand-blue text-brand-white' 
                            : 'text-brand-blue dark:text-blue-300 hover:bg-brand-blue/80 dark:hover:bg-blue-700 hover:text-brand-white dark:hover:text-white bg-brand-white dark:bg-gray-700 border border-brand-blue dark:border-blue-500'}
                        `}
                         role="tab"
                         aria-selected={curriculumSubTab === subTabInfo.name}
                      >
                        {subTabInfo.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {curriculumSubTab === 'syllabus' && (
                  <Accordion title={<span className="font-semibold text-md md:text-lg text-brand-blue dark:text-blue-300">Overall Syllabus</span>} startOpen={true}>
                     <MemoizedMarkdownRenderer content={curriculum.syllabus} baseTextSize={largeTextBase} />
                  </Accordion>
                )}

                {curriculumSubTab === 'material' && (
                  <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
                    {/* Main Content Area for Material (Left) */}
                    <div className="w-full md:w-2/3 lg:w-3/4 bg-brand-white dark:bg-brand-black p-3 md:p-5 rounded-lg shadow-lg border border-brand-mediumGray dark:border-gray-700 h-auto min-h-[250px] max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-600">
                      {displayedModuleForMaterialView ? (
                        <>
                          <h2 className="text-xl sm:text-2xl md:text-2xl font-bold text-brand-orange dark:text-orange-400 mb-3 md:mb-4">{cleanModuleTitle(displayedModuleForMaterialView.title)}</h2>
                          {displayedModuleForMaterialView.isLoading && <LoadingSpinner message={`Loading material for ${cleanModuleTitle(displayedModuleForMaterialView.title)}...`} />}
                          {!displayedModuleForMaterialView.isLoading && displayedModuleForMaterialView.moduleMaterial && (
                            <>
                              <MemoizedMarkdownRenderer content={displayedModuleForMaterialView.moduleMaterial} baseTextSize={largeTextBase} />
                              <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 border-t border-brand-mediumGray dark:border-gray-600 pt-4">
                                  <button 
                                  onClick={() => { handleGenerateQuiz(displayedModuleForMaterialView); setReviewingQuiz(null); setQuizAttemptCompleted(false);}}
                                  disabled={!displayedModuleForMaterialView.moduleMaterial}
                                  className={`px-4 py-2 md:px-5 md:py-2.5 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                                  >
                                  Take Quiz
                                  </button>
                                  <button 
                                  onClick={() => handleInitiateExamConfig(displayedModuleForMaterialView)}
                                  disabled={!displayedModuleForMaterialView.moduleMaterial} 
                                  className={`px-4 py-2 md:px-5 md:py-2.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                                  >
                                  Create Exam
                                  </button>
                                  <button
                                    onClick={() => handleInitiateFlashcardGeneration(displayedModuleForMaterialView)}
                                    disabled={!displayedModuleForMaterialView.moduleMaterial}
                                    className={`px-4 py-2 md:px-5 md:py-2.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black text-md md:text-lg font-semibold rounded-lg sm:col-span-2 lg:col-span-1`}
                                  >
                                    Manage Flashcards
                                  </button>
                              </div>
                            </>
                          )}
                          {!displayedModuleForMaterialView.isLoading && !displayedModuleForMaterialView.moduleMaterial && !displayedModuleForMaterialView.loadingError && (
                            <button 
                              onClick={() => handleLoadModuleDetails(selectedMaterialModuleIndex!)}
                              className={`mt-2 md:mt-3 px-4 py-2 md:px-5 md:py-2.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                            >
                              Load Material Details
                            </button>
                          )}
                          {!displayedModuleForMaterialView.isLoading && displayedModuleForMaterialView.loadingError && (
                            <div className="mt-2">
                              <p className={`text-brand-red dark:text-red-400 text-sm md:text-md mb-2 md:mb-3`}>Could not load details: {displayedModuleForMaterialView.loadingError}</p>
                              <button 
                                onClick={() => handleLoadModuleDetails(selectedMaterialModuleIndex!)}
                                className={`px-4 py-2 md:px-5 md:py-2.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                              >
                                Retry Load
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400 text-center py-10`}>Select a module from the right to view its material.</p>
                      )}
                    </div>
                    
                    {/* Dynamic Module Sidebar (Right) */}
                    <div className="w-full md:w-1/3 lg:w-1/4 flex-shrink-0 bg-brand-lightGray dark:bg-gray-800 p-3 md:p-4 rounded-lg shadow border border-brand-mediumGray dark:border-gray-700 h-auto max-h-[calc(100vh-220px)] self-start flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-600">
                      <div className="flex justify-between items-center mb-3 border-b border-brand-mediumGray dark:border-gray-600 pb-2">
                        <h3 className="text-lg md:text-xl font-semibold text-brand-blue dark:text-blue-300">Modul</h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-blue/10 text-brand-blue dark:bg-blue-900/40 dark:text-blue-300">
                          {curriculum.modules.filter(m => currentHistoryJourney?.moduleCompletionStatus[m.title]?.summaryLoaded).length}/{curriculum.modules.length} Selesai
                        </span>
                      </div>
                      {curriculum.modules.length === 0 ? (
                        <p className="text-sm text-brand-black/70 dark:text-gray-400">No modules for this topic.</p>
                      ) : (
                        <nav className="space-y-2">
                          {curriculum.modules.map((module, index) => {
                            const isSelected = selectedMaterialModuleIndex === index;
                            const isCompleted = currentHistoryJourney?.moduleCompletionStatus[module.title]?.summaryLoaded;
                            const displayTitle = `${index + 1}. ${cleanModuleTitle(module.title)}`;
                            
                            return (
                              <button
                                key={index}
                                onClick={() => {
                                  setSelectedMaterialModuleIndex(index);
                                  if (!module.moduleMaterial && !module.isLoading && !module.loadingError) {
                                    handleLoadModuleDetails(index);
                                  }
                                }}
                                title={displayTitle}
                                className={`w-full text-left p-2.5 sm:p-3 rounded-md transition-all duration-150 flex items-center justify-between border ${
                                  isSelected 
                                    ? 'bg-brand-blue text-brand-white border-brand-blue shadow-md' 
                                    : 'bg-brand-white dark:bg-gray-700 hover:bg-brand-mediumGray dark:hover:bg-gray-600 text-brand-black dark:text-gray-200 border-brand-mediumGray dark:border-gray-600'
                                }`}
                                aria-current={isSelected ? 'page' : undefined}
                              >
                                <span className="flex-grow text-xs sm:text-sm md:text-base font-medium line-clamp-2 leading-snug break-words pr-2">
                                  {displayTitle}
                                </span>
                                <span className="flex-shrink-0 ml-1">
                                  {module.isLoading ? <Icons.LoadingAnimatedIcon className="w-4 h-4 text-current animate-spin" /> :
                                   isCompleted ? <Icons.CheckCircle className="w-4 h-4 text-brand-green" /> :
                                   module.loadingError ? <Icons.XCircle className="w-4 h-4 text-brand-red" /> :
                                   <span className="w-4 h-4 inline-block opacity-30">○</span> 
                                  }
                                </span>
                              </button>
                            );
                          })}
                        </nav>
                      )}
                    </div>
                  </div>
                )}
                
                {curriculumSubTab === 'quiz' && (
                    <div>
                        {activeQuizForDisplay && currentActiveQuizQuestionData && !quizAttemptCompleted && !reviewingQuiz ? (
                            <div className="bg-brand-white dark:bg-brand-black p-4 md:p-6 rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-3 md:mb-4">
                                <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 flex items-center mb-1 sm:mb-0`}>Quiz: {quizModuleTitleForDisplay}</h3>
                                <p className={`text-md md:text-lg font-semibold text-brand-black/80 dark:text-gray-300`}>
                                        Question {currentQuizQuestionIndex + 1} of {activeQuizForDisplay.length}
                                </p>
                                </div>
                                
                                <div className="mb-4 md:mb-6 p-3 md:p-4 border border-brand-mediumGray dark:border-gray-600 rounded-md bg-brand-lightGray/50 dark:bg-gray-700/50">
                                    <p className={`font-medium text-brand-black dark:text-gray-100 mb-2 md:mb-3 ${largeTextBase}`}>{currentActiveQuizQuestionData.question}</p>
                                    <div className="space-y-1.5 md:space-y-2">
                                    {currentActiveQuizQuestionData.options.map((option, i) => (
                                        <label key={i} className={`flex items-center p-2.5 md:p-3 bg-brand-white dark:bg-gray-700 hover:bg-brand-mediumGray dark:hover:bg-gray-600 rounded-md cursor-pointer transition-colors border border-brand-mediumGray dark:border-gray-600 ${largeTextBase} text-sm md:text-base`}>
                                        <input
                                            type="radio"
                                            name={currentActiveQuizQuestionData.id}
                                            value={option}
                                            checked={currentActiveQuizQuestionData.userAnswer === option}
                                            onChange={() => handleQuizAnswer(currentActiveQuizQuestionData.id, option)}
                                            disabled={currentActiveQuizQuestionData.feedbackShown}
                                            className="form-radio h-4 w-4 md:h-5 md:w-5 text-brand-blue dark:accent-blue-500 bg-brand-white dark:bg-gray-600 border-brand-mediumGray dark:border-gray-500 focus:ring-brand-blue dark:focus:ring-blue-500"
                                        />
                                        <span className="ml-2 md:ml-3 text-brand-black dark:text-gray-200">{option}</span>
                                        </label>
                                    ))}
                                    </div>
                                    {currentActiveQuizQuestionData.feedbackShown && (
                                        <div className={`mt-3 md:mt-4 pt-2 md:pt-3 border-t border-brand-mediumGray dark:border-gray-600 ${currentActiveQuizQuestionData.isCorrect ? 'text-brand-green dark:text-green-400' : 'text-brand-red dark:text-red-400'}`}>
                                            <p className={`text-md md:text-lg font-semibold`}>Your answer "{currentActiveQuizQuestionData.userAnswer || "Not answered"}" was {currentActiveQuizQuestionData.isCorrect ? 'Correct!' : 'Incorrect.'}</p>
                                            {!currentActiveQuizQuestionData.isCorrect && <p className={`text-md md:text-lg text-brand-black/90 dark:text-gray-300`}>Correct answer: <span className="font-semibold text-brand-green dark:text-green-400">{currentActiveQuizQuestionData.correctAnswer}</span></p>}
                                            {currentActiveQuizQuestionData.explanation && (
                                                <div className="mt-2">
                                                    <h5 className={`text-lg md:text-xl font-semibold text-brand-blue dark:text-blue-400 mb-1`}>Explanation:</h5>
                                                    <MemoizedMarkdownRenderer content={currentActiveQuizQuestionData.explanation} baseTextSize="text-sm md:text-lg" />
                                                </div>
                                            )}
                                            <div className="mt-2 md:mt-3">
                                            {currentActiveQuizQuestionData.isDetailedExplanationLoading ? (
                                                <div className="flex items-center text-brand-blue dark:text-blue-400">
                                                <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400"/> 
                                                <span className="ml-2 text-md md:text-lg">Loading more details...</span>
                                                </div>
                                            ) : currentActiveQuizQuestionData.detailedExplanation ? (
                                                <>
                                                <Accordion 
                                                    key={`detail-accordion-${currentActiveQuizQuestionData.id}${currentActiveQuizQuestionData.detailedExplanation && !currentActiveQuizQuestionData.detailedExplanation.startsWith("Error:") ? '-success' : '-fail-or-pending'}`}
                                                    title={<span className="text-lg md:text-xl font-semibold text-brand-orange dark:text-orange-400">Click Here to See Further Details:</span>}
                                                    startOpen={!!currentActiveQuizQuestionData.detailedExplanation && !currentActiveQuizQuestionData.isDetailedExplanationLoading && !currentActiveQuizQuestionData.detailedExplanation.startsWith("Error:")}
                                                >
                                                    <MemoizedMarkdownRenderer content={currentActiveQuizQuestionData.detailedExplanation} baseTextSize="text-sm md:text-lg" />
                                                </Accordion>
                                                {currentActiveQuizQuestionData.detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
                                                    <button
                                                    onClick={() => handleLoadDetailedExplanation(currentActiveQuizQuestionData.id, false)}
                                                    className="mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg text-sm"
                                                    >
                                                    Regenerate Details
                                                    </button>
                                                )}
                                                </>
                                            ) : (
                                                <button
                                                onClick={() => handleLoadDetailedExplanation(currentActiveQuizQuestionData.id, false)}
                                                className={`px-3 py-1.5 md:px-4 md:py-2 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-sm md:text-md font-semibold rounded-lg`}
                                                >
                                                Load More Details
                                                </button>
                                            )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex flex-col sm:flex-row justify-between items-center mt-6 md:mt-8 space-y-2 sm:space-y-0 sm:space-x-2">
                                    <button
                                        onClick={() => handleQuizNavigation('prev')}
                                        disabled={currentQuizQuestionIndex === 0 || (!currentActiveQuizQuestionData.feedbackShown && currentQuizQuestionIndex > 0) }
                                        className={`w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg disabled:opacity-50 ${largeTextBase} text-sm md:text-base`}
                                    >
                                        Previous
                                    </button>
                                    
                                    {!currentActiveQuizQuestionData.feedbackShown && (
                                        <button onClick={handleCheckCurrentQuestionAnswer} disabled={!currentActiveQuizQuestionData.userAnswer} className={`w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-green hover:bg-[#25632B] dark:hover:bg-green-700 text-brand-white font-semibold rounded-lg disabled:opacity-50 ${largeTextBase} text-sm md:text-base`}>
                                            Check Answer
                                        </button>
                                    )}
                                    {currentActiveQuizQuestionData.feedbackShown && currentQuizQuestionIndex < activeQuizForDisplay.length - 1 && (
                                        <button onClick={() => handleQuizNavigation('next')} className={`w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg ${largeTextBase} text-sm md:text-base`}>
                                            Next Question
                                        </button>
                                    )}
                                    {currentActiveQuizQuestionData.feedbackShown && currentQuizQuestionIndex === activeQuizForDisplay.length - 1 && (
                                        <button onClick={handleViewQuizSummary} className={`w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-green hover:bg-[#25632B] dark:hover:bg-green-700 text-brand-white font-semibold rounded-lg ${largeTextBase} text-sm md:text-base`}>
                                            View Summary
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : quizToShowInResultOrReview && currentQuizQuestionForReviewView ? (
                            <div className="bg-brand-white dark:bg-brand-black p-4 md:p-6 rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
                                <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-3 md:mb-4`}>Quiz Result: {quizToShowInResultOrReview.moduleTitle}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                                    <div className="p-3 md:p-4 bg-brand-lightGray dark:bg-gray-700 rounded-lg text-center">
                                        <p className="text-2xl md:text-4xl font-bold text-brand-blue dark:text-blue-400">{quizToShowInResultOrReview.score}/{quizToShowInResultOrReview.quiz.length}</p>
                                        <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 text-sm md:text-base`}>Score</p>
                                    </div>
                                    <div className="p-3 md:p-4 bg-brand-lightGray dark:bg-gray-700 rounded-lg text-center">
                                        <p className="text-2xl md:text-4xl font-bold text-brand-green dark:text-green-400">
                                            {quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0}%
                                        </p>
                                        <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 text-sm md:text-base`}>Percentage</p>
                                    </div>
                                    <div className="p-3 md:p-4 bg-brand-lightGray dark:bg-gray-700 rounded-lg text-center">
                                        <p className="text-2xl md:text-4xl font-bold text-brand-red dark:text-red-400">
                                            {quizToShowInResultOrReview.quiz.length - quizToShowInResultOrReview.score}
                                        </p>
                                        <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 text-sm md:text-base`}>Incorrect</p>
                                    </div>
                                </div>

                                <div className="mb-4 md:mb-6">
                                    <h4 className="text-xl md:text-2xl font-semibold text-brand-orange dark:text-orange-400 mb-1 md:mb-2">Performance Overview:</h4>
                                    <div className="flex h-6 md:h-8 w-full bg-brand-red/30 dark:bg-red-700/50 rounded-md overflow-hidden">
                                        <div 
                                            className="bg-brand-green dark:bg-green-500 h-full flex items-center justify-center text-brand-white text-xs md:text-sm font-semibold"
                                            style={{ width: `${quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0}%` }}
                                            title="Correct Answers"
                                        >
                                        {(quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0) > 10 ? `${(quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0)}%` : ''}
                                        </div>
                                    </div>
                                </div>
                                
                                <h4 className="text-xl md:text-2xl font-semibold text-brand-orange dark:text-orange-400 mb-2 md:mb-3">Review Your Answers:</h4>
                                {quizToShowInResultOrReview.quiz.map((q, index) => (
                                    <Accordion 
                                        key={q.id}
                                        title={
                                            <div className={`flex items-center w-full ${q.isCorrect ? 'text-brand-green dark:text-green-400' : 'text-brand-red dark:text-red-400'}`}>
                                                {q.isCorrect ? <Icons.CheckCircle className="w-4 h-4 md:w-5 md:h-5 mr-2" /> : <Icons.XCircle className="w-4 h-4 md:w-5 md:h-5 mr-2" />}
                                                <span className="font-semibold text-md md:text-lg text-brand-black dark:text-gray-200">{`Q${index + 1}: ${q.question}`}</span>
                                            </div>
                                        }
                                        startOpen={index === currentQuizQuestionIndex} 
                                    >
                                        <p className={`${largeTextBase} mb-1 text-sm md:text-base`}><strong>Your Answer:</strong> {q.userAnswer || "Not answered"}</p>
                                        <p className={`${largeTextBase} mb-2 text-sm md:text-base`}><strong>Correct Answer:</strong> {q.correctAnswer}</p>
                                        <h5 className={`text-lg md:text-xl font-semibold text-brand-blue dark:text-blue-400 mt-2 mb-1`}>Explanation:</h5>
                                        <MemoizedMarkdownRenderer content={q.explanation || "No explanation provided."} baseTextSize="text-sm md:text-lg" />
                                        <div className="mt-2 md:mt-3">
                                        {q.isDetailedExplanationLoading ? (
                                            <div className="flex items-center text-brand-blue dark:text-blue-400">
                                            <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400"/> 
                                            <span className="ml-2 text-md md:text-lg">Loading more details...</span>
                                            </div>
                                        ) : q.detailedExplanation ? (
                                            <>
                                            <Accordion 
                                                key={`detail-accordion-review-${q.id}${q.detailedExplanation && !q.detailedExplanation.startsWith("Error:") ? '-success' : '-fail-or-pending'}`}
                                                title={<span className="text-lg md:text-xl font-semibold text-brand-orange dark:text-orange-400">Further Details:</span>}
                                                startOpen={!!q.detailedExplanation && !q.isDetailedExplanationLoading && !q.detailedExplanation.startsWith("Error:")}
                                            >
                                                <MemoizedMarkdownRenderer content={q.detailedExplanation} baseTextSize="text-sm md:text-lg" />
                                            </Accordion>
                                            {q.detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
                                                <button
                                                onClick={() => handleLoadDetailedExplanation(q.id, false)}
                                                className="mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg text-sm"
                                                >
                                                Regenerate Details
                                                </button>
                                            )}
                                            </>
                                        ) : (
                                            <button
                                            onClick={() => handleLoadDetailedExplanation(q.id, false)}
                                            className={`px-3 py-1.5 md:px-4 md:py-2 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-sm md:text-md font-semibold rounded-lg`}
                                            >
                                            Load More Details
                                            </button>
                                        )}
                                        </div>
                                    </Accordion>
                                ))}
                                <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                                    {(quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0) < 50 && (
                                        <button
                                            onClick={handleRetakeQuiz}
                                            className={`w-full sm:w-auto px-4 py-2 md:px-5 md:py-2.5 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                                        >
                                            Retake Quiz (Score: {quizToShowInResultOrReview.quiz.length > 0 ? Math.round((quizToShowInResultOrReview.score / quizToShowInResultOrReview.quiz.length) * 100) : 0}%)
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => { 
                                            setReviewingQuiz(null);
                                            if (quizAttemptCompleted) { 
                                                resetQuizState(); 
                                                setCurriculumSubTab('study_log'); 
                                            } else { 
                                                setCurriculumSubTab('study_log');
                                            }
                                            setError(null);
                                        }} 
                                        className={`w-full sm:w-auto px-4 py-2 md:px-5 md:py-2.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-md md:text-lg font-semibold rounded-lg`}
                                    >
                                        {quizAttemptCompleted ? "Back to Study Log" : "Back to Study Log"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                           (!activeQuizForDisplay && !reviewingQuiz && !error) && 
                            <div className="text-center p-6 bg-brand-lightGray dark:bg-gray-800 rounded-lg shadow">
                                <Icons.QuestionMarkCircle className="w-12 h-12 text-brand-blue dark:text-blue-400 mx-auto mb-4" />
                                <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-3`}>Quiz Section</h3>
                                <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 mb-4`}>
                                    To take a quiz, please select a module from the <button onClick={() => setCurriculumSubTab('material')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Material</button> tab and click "Take Quiz", 
                                    or select a quiz from <button onClick={() => setCurriculumSubTab('study_log')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Study Log</button> to review.
                                </p>
                                <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>Ensure the module material is loaded before generating a quiz.</p>
                            </div>
                        )}
                         {error && curriculumSubTab === 'quiz' && <p className={`mt-4 text-brand-red dark:text-red-400 text-center`}>{error}</p>}
                    </div>
                )}

                {curriculumSubTab === 'study_log' && (
                  <div className="space-y-3 md:space-y-4">
                    <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mt-4 md:mt-6 mb-2 md:mb-3`}>Study Log for {topic}</h3>
                    
                    <Accordion title={<span className="font-semibold text-md md:text-lg text-brand-blue dark:text-blue-300">Quiz History</span>} startOpen={true}>
                        {!currentHistoryJourney?.quizHistory || currentHistoryJourney.quizHistory.length === 0 ? (
                        <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>No quizzes taken for this learning journey yet.</p>
                        ) : (
                        currentHistoryJourney.quizHistory.map((qh, index) => {
                            const historyPercentageScore = qh.quiz.length > 0 ? Math.round((qh.score / qh.quiz.length) * 100) : 0;
                            return (
                                <div key={`${qh.moduleId}-${qh.timestamp}-${index}`} className="p-3 mb-2 bg-brand-white dark:bg-gray-800 rounded-md border border-brand-mediumGray dark:border-gray-700">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full">
                                        <span className="font-semibold text-md text-brand-blue dark:text-blue-300 mb-1 sm:mb-0 truncate max-w-[70%] sm:max-w-none">{qh.moduleTitle}</span>
                                        <span className="text-xs sm:text-sm font-normal text-brand-black/80 dark:text-gray-400">
                                            Score: {qh.score}/{qh.quiz.length} ({historyPercentageScore}%) - Taken: {new Date(qh.timestamp).toLocaleDateString()}
                                            {qh.retakeInfo && <span className="ml-2 text-brand-green dark:text-green-300 italic">({qh.retakeInfo})</span>}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                                        <button
                                        onClick={() => handleReviewQuizFromHistory(qh)}
                                        className={`px-3 py-1.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-sm font-semibold rounded-lg`}
                                        >
                                        Review This Quiz
                                        </button>
                                        {historyPercentageScore < 50 && (
                                            <button
                                                onClick={() => handleStartRetakeQuizFromHistoryList(qh.moduleTitle)}
                                                className={`px-3 py-1.5 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-sm font-semibold rounded-lg`}
                                            >
                                            Retake Quiz ({historyPercentageScore}%)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                        )}
                    </Accordion>

                    <Accordion title={<span className="font-semibold text-md md:text-lg text-brand-blue dark:text-blue-300">Exam History</span>} startOpen={true}>
                        {!currentHistoryJourney?.examHistory || currentHistoryJourney.examHistory.length === 0 ? (
                            <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>No exams taken for this learning journey yet.</p>
                        ) : (
                            currentHistoryJourney.examHistory.map(attempt => {
                                const attemptScorePercentage = attempt.maxScore > 0 ? Math.round(attempt.totalScore / attempt.maxScore * 100) : 0;
                                return (
                                    <div key={attempt.id} className="p-3 mb-2 bg-brand-white dark:bg-gray-800 rounded-md border border-brand-mediumGray dark:border-gray-700">
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full">
                                            <span className="font-semibold text-md text-brand-blue dark:text-blue-300 truncate max-w-[70%] sm:max-w-none">{attempt.config.moduleTitle} (Exam)</span>
                                            <span className="text-xs sm:text-sm font-normal text-brand-black/80 dark:text-gray-400">
                                                Score: {attempt.totalScore}/{attempt.maxScore} ({attemptScorePercentage}%) - Taken: {new Date(attempt.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                                            <button
                                                onClick={() => handleReviewExamFromHistory(attempt)}
                                                className={`px-3 py-1.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-sm font-semibold rounded-lg`}
                                            >
                                            Review This Exam
                                            </button>
                                            {attemptScorePercentage < 50 && (
                                                <button
                                                    onClick={() => handleStartRetakeExamFromHistory(attempt)}
                                                    className={`px-3 py-1.5 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-sm font-semibold rounded-lg`}
                                                >
                                                Retake Exam ({attemptScorePercentage}%)
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </Accordion>
                    
                    <Accordion title={<span className="font-semibold text-md md:text-lg text-brand-blue dark:text-blue-300">Flashcard Decks</span>} startOpen={true}>
                        {!currentHistoryJourney?.flashcardDecks || Object.keys(currentHistoryJourney.flashcardDecks).length === 0 ? (
                            <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>No flashcard decks created for this learning journey yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {/* FIX: Cast deckData to FlashcardDeck to allow property access. */}
                                {Object.entries(currentHistoryJourney.flashcardDecks).map(([deckModuleId, deck]: [string, FlashcardDeck]) => {
                                    return (
                                    <button
                                        key={deckModuleId}
                                        onClick={() => {
                                            const moduleData = currentCurriculumModulesMap.get(deckModuleId)?.module;
                                            if (moduleData) {
                                                setActiveFlashcardModuleInfo({ title: moduleData.title, moduleMaterial: moduleData.moduleMaterial || "" });
                                                setCurrentFlashcardDeck(deck);
                                                setCurriculumSubTab('flashcards');
                                                setFlashcardSubView('daftar');
                                            } else {
                                                setError(`Could not find module data for flashcard deck: ${deckModuleId}`);
                                            }
                                        }}
                                        className="w-full text-left p-3 rounded-md transition-colors bg-brand-white dark:bg-gray-800 hover:bg-brand-mediumGray dark:hover:bg-gray-600 text-brand-black dark:text-gray-200 border border-brand-mediumGray dark:border-gray-700"
                                    >
                                        <span className="font-semibold text-md text-brand-blue dark:text-blue-300">{deck.moduleTitle}</span>
                                        <span className="text-xs block text-brand-black/70 dark:text-gray-400">{deck.cards.length} cards</span>
                                    </button>
                                )})}
                            </div>
                        )}
                    </Accordion>
                  </div>
                )}


                 {curriculumSubTab === 'exam' && (
                    <div>
                        {examViewMode === 'config' && activeExamModuleInfo && !isGeneratingExam && (
                           <ExamConfigView 
                                moduleTitle={activeExamModuleInfo.title} 
                                onSubmit={handleGenerateAndStartExam} 
                                isLoading={isGeneratingExam} 
                                initialConfig={currentExamConfigForView}
                           />
                        )}
                        {examViewMode === 'taking' && currentExamQuestions && currentExamQuestions[currentExamQuestionIndex] && currentExamAttempt && (
                            <ExamTakingView
                                question={currentExamQuestions[currentExamQuestionIndex]}
                                questionIndex={currentExamQuestionIndex}
                                totalQuestions={currentExamQuestions.length}
                                onAnswer={handleExamAnswer}
                                onNext={() => handleExamNavigation('next')}
                                onPrev={() => handleExamNavigation('prev')}
                                onSubmit={() => handleSubmitExam(false)}
                                timeLeft={examTimer.timeLeft}
                                timeLimitEnabled={currentExamAttempt.config.timeLimitEnabled}
                                examModuleTitle={examModuleTitleForTakingDisplay || "Exam"}
                            />
                        )}
                        {(reviewingExam || (examViewMode === 'results' && examAttemptCompleted)) && examToShowInResultView ? (
                             <ExamResultsView
                                examAttempt={examToShowInResultView}
                                onRetake={() => handleStartRetakeExamFromHistory(examToShowInResultView)}
                                onReviewQuestion={(qIdx) => {
                                    setCurrentExamQuestionIndex(qIdx);
                                }}
                                onBack={() => {
                                    setReviewingExam(null);
                                    setCurriculumSubTab('study_log'); 
                                    setExamViewMode('module_selection');
                                }}
                                onLoadDetailedExplanation={(qId) => handleLoadDetailedExplanation(qId, true)}
                            />
                        ) : (
                            examViewMode === 'module_selection' && !isGeneratingExam && !activeExamModuleInfo && !reviewingExam && !error && (
                                <div className="text-center p-6 bg-brand-lightGray dark:bg-gray-800 rounded-lg shadow">
                                    <Icons.LightBulb className="w-12 h-12 text-brand-yellow mx-auto mb-4" />
                                    <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-3`}>Create or Configure an Exam</h3>
                                    <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 mb-4`}>
                                        To start a new exam, please select a module from the <button onClick={() => setCurriculumSubTab('material')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Material</button> tab and click "Create Exam",
                                        or select an exam from <button onClick={() => setCurriculumSubTab('study_log')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Study Log</button> to review or retake.
                                    </p>
                                    <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>Ensure the module material is loaded before creating an exam. If you were configuring an exam and landed here, please re-select the module.</p>
                                </div>
                            )
                        )}
                         {error && curriculumSubTab === 'exam' && <p className={`mt-4 text-brand-red dark:text-red-400 text-center`}>{error}</p>}
                    </div>
                )}
                {curriculumSubTab === 'flashcards' && renderFlashcardInterface()}
              </div>
            )}


            {activeTab === 'plan' && sevenDayPlan && ( 
              <div className="space-y-4">
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-brand-mediumGray dark:border-gray-700">
                   <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-1 sm:mb-0`}>7-Day Accelerated Learning Plan</h3> 
                   <span className="text-xs md:text-sm font-medium text-brand-orange dark:text-orange-400 bg-brand-orange/10 dark:bg-orange-950/40 px-3 py-1 rounded-full w-max">7 Modul Terjadwal</span>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {sevenDayPlan.days.map((day: DailyPlan) => {
                    const subtasks = parseSubtasks(day.task);
                    const totalSubtasksCount = subtasks.length;
                    const subtaskCompletion = currentHistoryJourney?.planSubtaskCompletionStatus || {};

                    const completedSubtasksCount = subtasks.reduce((acc, _, idx) => {
                      const key = `${day.day}_${idx}`;
                      const isChecked = key in subtaskCompletion
                        ? subtaskCompletion[key]
                        : (currentHistoryJourney?.planTaskCompletionStatus[day.day] || false);
                      return acc + (isChecked ? 1 : 0);
                    }, 0);

                    const isCompleted = totalSubtasksCount > 0
                      ? completedSubtasksCount === totalSubtasksCount
                      : (currentHistoryJourney?.planTaskCompletionStatus[day.day] || false);

                    const cleanedFocusTitle = cleanModuleTitle(day.summaryFocus);
                    
                    return ( 
                      <div 
                        key={day.day} 
                        className={`p-3.5 sm:p-4 rounded-lg border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md ${
                          isCompleted 
                            ? 'bg-brand-green/5 dark:bg-green-950/20 border-brand-green/40 dark:border-green-800' 
                            : 'bg-brand-white dark:bg-gray-800 border-brand-mediumGray dark:border-gray-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-brand-mediumGray/60 dark:border-gray-700/60 flex-wrap gap-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand-blue text-brand-white">Hari {day.day}</span>
                              {totalSubtasksCount > 0 && (
                                <span className="text-[11px] font-semibold text-brand-blue/80 dark:text-blue-300/80 bg-brand-blue/10 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                                  {completedSubtasksCount}/{totalSubtasksCount} Subtugas
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleTogglePlanTask(day.day, totalSubtasksCount)}
                              disabled={!selectedHistoryItemId}
                              className={`flex items-center space-x-1 text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                isCompleted 
                                  ? 'bg-brand-green text-brand-white' 
                                  : 'bg-brand-lightGray dark:bg-gray-700 text-brand-black dark:text-gray-200 hover:bg-brand-mediumGray dark:hover:bg-gray-600'
                              }`}
                            >
                              {isCompleted ? <><Icons.CheckCircle className="w-3.5 h-3.5 inline mr-1" />Selesai</> : 'Tandai Selesai'}
                            </button>
                          </div>
                          <h4 className="font-semibold text-sm md:text-base text-brand-blue dark:text-blue-300 mb-2 line-clamp-2 leading-snug break-words" title={cleanedFocusTitle}>
                            {cleanedFocusTitle}
                          </h4>
                          {subtasks.length > 0 ? (
                            <div className="space-y-2 mt-2">
                              {subtasks.map((subtaskText, sIdx) => {
                                const key = `${day.day}_${sIdx}`;
                                const isSubtaskChecked = key in subtaskCompletion
                                  ? subtaskCompletion[key]
                                  : (currentHistoryJourney?.planTaskCompletionStatus[day.day] || false);

                                return (
                                  <label
                                    key={sIdx}
                                    className={`flex items-start space-x-2.5 p-2 rounded-md transition-colors cursor-pointer text-xs md:text-sm ${
                                      isSubtaskChecked
                                        ? 'bg-brand-green/10 dark:bg-green-900/20 text-brand-black/70 dark:text-gray-400'
                                        : 'bg-brand-lightGray/60 dark:bg-gray-700/50 hover:bg-brand-mediumGray/40 dark:hover:bg-gray-700 text-brand-black dark:text-gray-200'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSubtaskChecked}
                                      disabled={!selectedHistoryItemId}
                                      onChange={() => handleTogglePlanSubtask(day.day, sIdx, totalSubtasksCount)}
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-mediumGray text-brand-green focus:ring-brand-green dark:bg-gray-800 dark:border-gray-600 cursor-pointer accent-emerald-600"
                                    />
                                    <div className={`flex-1 select-none leading-snug min-w-0 ${isSubtaskChecked ? 'line-through opacity-70' : ''}`}>
                                      <MemoizedMarkdownRenderer content={subtaskText} baseTextSize="text-xs md:text-sm" inline />
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs md:text-sm text-brand-black/80 dark:text-gray-300">
                              <MemoizedMarkdownRenderer content={formatSevenDayTask(day.task)} baseTextSize="text-xs md:text-sm" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {activeTab === 'resources' && (
                 <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-lg border border-brand-mediumGray dark:border-gray-700">
                    <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-4`}>Learning Resources for: <span className="text-brand-orange dark:text-orange-400">{topic}</span></h3>
                    {isFetchingResources && <LoadingSpinner message="Fetching resources..." />}
                    {fetchResourcesError && (
                        <div className="text-brand-red dark:text-red-400">
                            <p>Error: {fetchResourcesError}</p>
                            <button 
                                onClick={handleFetchResources}
                                className="mt-2 px-3 py-1.5 bg-brand-orange hover:bg-orange-700 text-brand-white font-semibold rounded-md"
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    {!isFetchingResources && !fetchResourcesError && !currentLearningResources && (
                        <div className="text-center py-8">
                            <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400 mb-4`}>No resources loaded yet for this topic.</p>
                            <button 
                                onClick={handleFetchResources}
                                className="px-4 py-2 bg-brand-blue hover:bg-blue-700 text-brand-white font-semibold rounded-lg"
                            >
                                <Icons.Sparkles className="w-5 h-5 inline-block mr-2" />
                                Fetch Learning Resources
                            </button>
                        </div>
                    )}
                    {currentLearningResources && (
                       <>
                            <MemoizedMarkdownRenderer content={currentLearningResources.content} baseTextSize={largeTextBase} />
                            
                            {currentLearningResources.sources && currentLearningResources.sources.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-brand-mediumGray dark:border-gray-600">
                                    <h3 className="text-2xl font-semibold text-brand-orange dark:text-orange-400 mb-3">
                                        {targetLanguage && targetLanguage.toLowerCase().includes("bahasa indonesia") 
                                            ? "Situs Web & Sumber Lainnya (dari Google)" 
                                            : "Websites & Other Resources (from Google)"}
                                    </h3>
                                    <ul className="list-disc list-inside space-y-2">
                                        {currentLearningResources.sources.map((source, index) => (
                                            <li key={index} className={largeTextBase}>
                                                <a 
                                                    href={source.web.uri} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="text-brand-blue hover:text-brand-orange dark:text-blue-400 dark:hover:text-orange-400 underline"
                                                >
                                                    {source.web.title || source.web.uri}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeTab === 'tutor' && (
              <div className="flex flex-col h-[calc(100vh-280px)] sm:h-[calc(100vh-260px)] md:h-[calc(100vh-240px)] bg-brand-white dark:bg-brand-black rounded-lg shadow-xl overflow-hidden border border-brand-mediumGray dark:border-gray-700">
                <div id="chat-output" className="flex-grow p-2 sm:p-4 space-y-3 md:space-y-4 overflow-y-auto scroll-smooth bg-brand-lightGray/50 dark:bg-gray-700/50 scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  {tutorSession.history.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'ai' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-lg md:max-w-xl p-2.5 md:p-3 rounded-lg shadow flex items-end ${
                        msg.sender === 'ai' 
                          ? 'bg-brand-lightGray text-brand-black border border-brand-blue dark:bg-brand-blue dark:text-brand-white dark:border-transparent' 
                          : 'bg-brand-lightGray text-brand-black border border-brand-orange dark:bg-gray-700 dark:text-gray-100 dark:border-brand-orange dark:border-opacity-80'
                      }`}>
                        <div className={`whitespace-pre-wrap flex-grow text-sm sm:text-base md:text-lg`}>
                            {msg.text === "..." ? <span className="italic">Tutor is typing...</span> : <MemoizedMarkdownRenderer content={msg.text} baseTextSize="text-sm sm:text-base md:text-lg" />}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTutorTyping && tutorSession.history.length > 0 && tutorSession.history[tutorSession.history.length-1].sender !== 'ai' && (
                     <div className="flex justify-start">
                        <div className="max-w-lg md:max-w-xl p-2.5 md:p-3 rounded-lg shadow bg-brand-lightGray text-brand-black border border-brand-blue dark:bg-brand-blue dark:text-brand-white dark:border-transparent">
                            <p className={`italic text-sm sm:text-base md:text-lg`}>Tutor is typing...</p>
                        </div>
                    </div>
                  )}
                </div>
                <div className="p-2 sm:p-4 border-t border-brand-mediumGray dark:border-gray-700 bg-brand-white dark:bg-brand-black">
                  <form onSubmit={(e) => {e.preventDefault(); handleTutorSendMessage();}} className="flex space-x-2 md:space-x-3">
                    <input
                      type="text"
                      value={tutorInput}
                      onChange={(e) => setTutorInput(e.target.value)}
                      placeholder={tutorSession.chat ? "Ask your tutor..." : "Start a session to chat."}
                      className={`flex-grow px-3 py-2 md:px-4 bg-brand-white dark:bg-gray-700 border border-brand-mediumGray dark:border-gray-600 rounded-lg text-brand-black dark:text-gray-100 focus:ring-1 focus:ring-brand-blue dark:focus:ring-blue-500 focus:border-brand-blue dark:focus:border-blue-500 outline-none text-sm sm:text-base md:text-lg`}
                      disabled={isTutorTyping || !tutorSession.chat}
                      aria-label="Tutor input message"
                    />
                    <button
                      type="submit"
                      disabled={isTutorTyping || !tutorSession.chat || !tutorInput.trim()}
                      className={`px-4 py-2 md:px-5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg disabled:opacity-50 text-sm sm:text-base md:text-lg`}
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return <p className="dark:text-gray-300">Unknown view state.</p>;
    }
  };

  const renderFlashcardInterface = () => {
    const heading2Size = "text-xl sm:text-2xl md:text-2xl font-semibold text-brand-blue dark:text-blue-300";
    const largeTextBase = "text-lg md:text-xl text-brand-black dark:text-gray-200"; 

    if (!activeFlashcardModuleInfo) {
        return (
            <div className="text-center p-6 bg-brand-lightGray dark:bg-gray-800 rounded-lg shadow">
                <Icons.LightBulb className="w-12 h-12 text-brand-yellow mx-auto mb-4" />
                <h3 className={`${heading2Size} font-semibold text-brand-blue dark:text-blue-300 mb-3`}>Flashcards</h3>
                <p className={`${largeTextBase} text-brand-black/80 dark:text-gray-300 mb-4`}>
                    To manage or study flashcards, please select a module from the <button onClick={() => setCurriculumSubTab('material')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Material</button> tab and click "Manage Flashcards", or select a deck from <button onClick={() => setCurriculumSubTab('study_log')} className="text-brand-orange dark:text-orange-400 underline hover:text-brand-red dark:hover:text-red-500">Study Log</button>.
                </p>
                <p className={`${largeTextBase} text-brand-black/70 dark:text-gray-400`}>Ensure the module material is loaded before generating flashcards.</p>
            </div>
        );
    }
    
    const flashcardSubTabs: { name: FlashcardSubView, label: string, icon: React.ReactNode }[] = [
        { name: 'daftar', label: 'Daftar', icon: <Icons.QueueListIcon /> },
        { name: 'tumpukan', label: 'Tumpukan', icon: <Icons.RectangleStackIcon /> },
        { name: 'permainan', label: 'Permainan', icon: <Icons.PuzzlePieceIcon /> },
    ];

    
    const currentCardInStack = sortedStackCards[currentFlashcardIndexInStack];
    const gameIsCompleted = matchGameActive === false && flashcardMatchGameItems.length > 0 && flashcardMatchGameItems.every(item => !item.isVisible);


    return (
        <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
            <h2 className="text-2xl md:text-3xl font-bold text-brand-blue dark:text-blue-300 mb-4">
                Flashcards for: <span className="text-brand-orange dark:text-orange-400">{activeFlashcardModuleInfo.title}</span>
            </h2>

            <div className="mb-4 flex items-center space-x-2 border-b border-brand-mediumGray dark:border-gray-700 pb-3 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <button
                    onClick={handleGenerateFlashcards}
                    disabled={isGeneratingFlashcards}
                    className="flex-shrink-0 mr-2 px-3 py-2 bg-brand-green hover:bg-green-700 text-brand-white text-sm font-semibold rounded-md flex items-center disabled:opacity-50"
                >
                    {isGeneratingFlashcards ? <Icons.LoadingAnimatedIcon className="w-4 h-4 mr-2" /> : <Icons.Sparkles className="w-4 h-4 mr-2" />}
                    Generate AI Flashcards
                </button>
                {flashcardSubTabs.map(subTab => (
                    <button
                        key={subTab.name}
                        onClick={() => {
                            setFlashcardSubView(subTab.name);
                            if (subTab.name === 'permainan' && currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && !matchGameActive && !gameIsCompleted) {
                                // Game start is handled by its own button
                            }
                        }}
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
            {error && curriculumSubTab === 'flashcards' && <p className={`my-2 text-brand-red dark:text-red-400 text-center`}>{error}</p>}

            {flashcardSubView === 'daftar' && (
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300">Daftar Kartu ({currentFlashcardDeck?.cards?.length || 0})</h3>
                        <button
                            onClick={() => handleOpenAddFlashcardModal()}
                            className="px-3 py-1.5 bg-brand-blue hover:bg-blue-700 text-brand-white text-sm font-semibold rounded-md flex items-center"
                        >
                            <Icons.PlusIcon className="w-4 h-4 mr-1" /> Tambah Kartu
                        </button>
                    </div>
                    {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 ? (
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-600">
                            {currentFlashcardDeck.cards.map(card => (
                                <div key={card.id} className="p-3 bg-brand-lightGray dark:bg-gray-700 rounded-md shadow border border-brand-mediumGray dark:border-gray-600">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-brand-orange dark:text-orange-400">{card.term}</p>
                                            <p className="text-sm text-brand-black/80 dark:text-gray-300">{card.definition}</p>
                                        </div>
                                        <div className="flex space-x-1.5 flex-shrink-0">
                                            <button onClick={() => handleOpenAddFlashcardModal(card)} className="p-1.5 text-brand-blue hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200" title="Edit"><Icons.PencilIcon /></button>
                                            <button onClick={() => handleDeleteFlashcard(card.id)} className="p-1.5 text-brand-red hover:text-red-700 dark:text-red-400 dark:hover:text-red-200" title="Delete"><Icons.TrashIcon /></button>
                                        </div>
                                    </div>
                                     <p className="text-xs mt-1 text-brand-black/60 dark:text-gray-500">Status: {card.status}, Difficulty: {card.difficultyLevel}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-brand-black/70 dark:text-gray-400">No flashcards in this deck yet. Add some manually or generate them!</p>
                    )}
                </div>
            )}

            {flashcardSubView === 'tumpukan' && (
                <div>
                    <div className="flex justify-around mb-4 text-center text-sm">
                        <div><span className="font-bold text-brand-blue dark:text-blue-400">{flashcardStatusCounts.learning || 0}</span> Belajar</div>
                        <div><span className="font-bold text-brand-orange dark:text-orange-400">{flashcardStatusCounts.reviewing || 0}</span> Mengulang</div>
                        <div><span className="font-bold text-brand-yellow dark:text-yellow-400">{flashcardStatusCounts.known || 0}</span> Diketahui</div>
                        <div><span className="font-bold text-brand-green dark:text-green-400">{flashcardStatusCounts.mastered || 0}</span> Dikuasai</div>
                    </div>
                    {currentCardInStack ? (
                        <div 
                            className="p-4 md:p-6 bg-brand-lightGray dark:bg-gray-700 rounded-lg shadow-lg min-h-[200px] flex flex-col justify-center items-center text-center relative cursor-pointer hover:bg-brand-mediumGray dark:hover:bg-gray-600 transition-colors duration-150"
                            onClick={() => setFlippedFlashcardId(prev => prev === currentCardInStack.id ? null : currentCardInStack.id)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={flippedFlashcardId === currentCardInStack.id}
                            aria-label={`Flashcard: ${flippedFlashcardId === currentCardInStack.id ? 'Showing definition for' : 'Showing term'} ${currentCardInStack.term}. Click to flip.`}
                        >
                            <p className="text-xl md:text-2xl font-semibold text-brand-black dark:text-gray-100 mb-4 select-none">
                                {flippedFlashcardId === currentCardInStack.id ? currentCardInStack.definition : currentCardInStack.term}
                            </p>
                            
                            {flippedFlashcardId === currentCardInStack.id && (
                                <div className="mt-6 flex justify-around w-full max-w-xs">
                                    <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'hard');}} className="p-3 rounded-full hover:bg-brand-red/20 text-brand-red dark:text-red-400" title="Sulit/Tidak Paham"><Icons.FaceFrownIcon className="w-8 h-8" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'medium');}} className="p-3 rounded-full hover:bg-brand-yellow/20 text-brand-yellow dark:text-yellow-400" title="Cukup Paham"><Icons.FaceMehIcon className="w-8 h-8" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleAssessFlashcard(currentCardInStack.id, 'easy');}} className="p-3 rounded-full hover:bg-brand-green/20 text-brand-green dark:text-green-400" title="Mudah/Sudah Paham"><Icons.FaceSmileIcon className="w-8 h-8" /></button>
                                </div>
                            )}
                        </div>
                    ) : (
                         <p className="text-brand-black/70 dark:text-gray-400 text-center py-10">No cards due for review or in learning stack. Add more cards or wait for scheduled reviews!</p>
                    )}
                     {currentFlashcardDeck && currentFlashcardDeck.cards.length > 0 && sortedStackCards.length > 0 && (
                        <div className="mt-4 flex justify-between">
                            <button 
                                onClick={() => setCurrentFlashcardIndexInStack(prev => (prev - 1 + sortedStackCards.length) % sortedStackCards.length)} 
                                className="px-4 py-2 bg-brand-blue text-brand-white rounded-md text-sm font-semibold"
                                disabled={sortedStackCards.length <= 1}
                            >
                                Previous
                            </button>
                             <span className="text-sm text-brand-black/70 dark:text-gray-400 self-center">
                                Card {currentFlashcardIndexInStack + 1} of {sortedStackCards.length} (Sorted for Review)
                            </span>
                            <button 
                                onClick={() => setCurrentFlashcardIndexInStack(prev => (prev + 1) % sortedStackCards.length)} 
                                className="px-4 py-2 bg-brand-blue text-brand-white rounded-md text-sm font-semibold"
                                disabled={sortedStackCards.length <= 1}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}

            {flashcardSubView === 'permainan' && (
                <div>
                    <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300 mb-3">Permainan Pencocokan</h3>
                    {!matchGameActive && !gameIsCompleted && (
                        <>
                            <p className="text-brand-black/70 dark:text-gray-400 mb-4">Cocokkan istilah dengan definisinya. Klik "Mulai Permainan" untuk memulai.</p>
                            <button
                                onClick={handleStartFlashcardMatchGame}
                                disabled={!currentFlashcardDeck || currentFlashcardDeck.cards.length < 2} 
                                className="px-4 py-2 bg-brand-green hover:bg-green-700 text-brand-white font-semibold rounded-md disabled:opacity-50"
                            >
                                Mulai Permainan
                            </button>
                            {(!currentFlashcardDeck || currentFlashcardDeck.cards.length < 2) && <p className="text-xs text-brand-red dark:text-red-400 mt-1">Butuh minimal 2 kartu untuk bermain.</p>}
                        </>
                    )}
                     {error && flashcardSubView === 'permainan' && <p className={`my-2 text-brand-red dark:text-red-400 text-center`}>{error}</p>}

                    {matchGameActive && (
                        <div className="text-center mb-2">
                            <p className="text-lg font-semibold text-brand-orange dark:text-orange-400">Waktu: {formatMatchGameTime(matchGameTimeElapsed)}</p>
                        </div>
                    )}

                    {gameIsCompleted && (
                         <div className="text-center p-4 bg-brand-green/10 dark:bg-green-900/30 rounded-md">
                            <Icons.CheckCircle className="w-10 h-10 text-brand-green mx-auto mb-2" />
                            <p className="text-xl font-semibold text-brand-green dark:text-green-300">Selamat! Semua pasangan berhasil dicocokkan!</p>
                            <p className="text-md text-brand-black/80 dark:text-gray-300">Waktu Pengerjaan: {formatMatchGameTime(matchGameTimeElapsed)}</p>
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
            )}
            {showAddFlashcardModal && currentFlashcardDeck && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-brand-white dark:bg-brand-black p-5 rounded-lg shadow-xl w-full max-w-md border border-brand-mediumGray dark:border-gray-700">
                        <h3 className="text-xl font-semibold text-brand-blue dark:text-blue-300 mb-4">{editingFlashcardId ? 'Edit Kartu' : 'Tambah Kartu Baru'}</h3>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="fc-term" className="block text-sm font-medium text-brand-blue dark:text-blue-300">Istilah/Pertanyaan</label>
                                <input type="text" id="fc-term" value={flashcardFormState.term} onChange={e => setFlashcardFormState(s => ({...s, term: e.target.value}))} className="mt-1 w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100" />
                            </div>
                            <div>
                                <label htmlFor="fc-definition" className="block text-sm font-medium text-brand-blue dark:text-blue-300">Definisi/Jawaban</label>
                                <textarea id="fc-definition" value={flashcardFormState.definition} onChange={e => setFlashcardFormState(s => ({...s, definition: e.target.value}))} rows={3} className="mt-1 w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"></textarea>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end space-x-2">
                            <button onClick={() => setShowAddFlashcardModal(false)} className="px-3 py-1.5 text-sm font-medium text-brand-black/80 dark:text-gray-300 bg-brand-lightGray dark:bg-gray-600 hover:bg-brand-mediumGray dark:hover:bg-gray-500 rounded-md">Batal</button>
                            <button onClick={handleSaveFlashcard} className="px-3 py-1.5 text-sm font-medium text-brand-white bg-brand-green hover:bg-green-700 rounded-md">Simpan</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  };


  return (
    <div className="min-h-screen md:h-screen md:w-screen md:overflow-hidden bg-brand-white text-brand-black dark:bg-brand-black dark:text-gray-100 flex flex-col md:flex-row transition-colors duration-300">
        <HistorySidebar 
            historyItems={historyItems}
            selectedHistoryItemId={selectedHistoryItemId}
            userLevel={userLevel}
            darkMode={darkMode}
            isVisible={isSidebarVisible}
            onToggleVisibilityMain={toggleSidebarVisibility} 
            onCloseMobile={() => setIsSidebarVisible(false)}         
            onSelectItem={handleSelectHistoryItem}
            onNewSession={handleNewSession}
            onClearHistory={handleClearHistory}
            onToggleDarkMode={toggleDarkMode}
            onDeleteItem={handleDeleteHistoryItem}
        />
        
        <main className="flex-grow md:h-full md:overflow-y-auto transition-all duration-300 ease-in-out">
            <header className="md:hidden sticky top-0 z-30 bg-brand-white dark:bg-brand-black shadow-sm p-3 flex justify-between items-center border-b border-brand-mediumGray dark:border-gray-700">
                <button
                    onClick={toggleSidebarVisibility}
                    className="p-2 rounded-md text-brand-blue dark:text-blue-300 hover:bg-brand-lightGray dark:hover:bg-gray-700"
                    aria-label={isSidebarVisible ? "Close sidebar" : "Open sidebar"}
                    aria-expanded={isSidebarVisible}
                >
                    <Icons.MenuIcon className="w-6 h-6" />
                </button>
                <h1 className="text-lg font-semibold text-brand-blue dark:text-blue-300 truncate">
                    {topic || "Adaptiva Study"}
                </h1>
                <div className="flex items-center gap-2">
                    <PointsBadge />
                    <button
                        onClick={toggleDarkMode}
                        className="p-2 rounded-md text-brand-blue dark:text-blue-300 hover:bg-brand-lightGray dark:hover:bg-gray-700"
                        aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {darkMode ? <Icons.SunIcon className="w-5 h-5" /> : <Icons.MoonIcon className="w-5 h-5" />}
                    </button>
                    <AuthButton />
                </div>
            </header>
            {!isSidebarVisible && (
                <button
                    onClick={toggleSidebarVisibility}
                    className="fixed top-4 left-4 z-50 p-2 bg-brand-lightGray dark:bg-gray-700 text-brand-blue dark:text-blue-300 rounded-full shadow-lg hover:bg-brand-mediumGray dark:hover:bg-gray-600 hidden md:block"
                    title="Open Sidebar"
                    aria-label="Open Sidebar"
                >
                    <Icons.MenuIcon className="w-6 h-6"/>
                </button>
            )}

            <div className={`p-2 sm:p-3 md:p-4 lg:p-6 ${isSidebarVisible && typeof window !== 'undefined' && window.innerWidth >= 768 ? 'md:ml-0' : 'md:ml-0'}`}>
                <div className="hidden md:flex justify-end items-center gap-2 mb-3">
                    <PointsBadge />
                    <AuthButton />
                </div>
                 {renderMainContent()}
            </div>
            <AuthModal
              isOpen={isAuthModalOpen}
              onClose={() => setIsAuthModalOpen(false)}
            />
            <InsufficientPointsModal
              isOpen={isPointsModalOpen}
              onClose={() => setIsPointsModalOpen(false)}
              requiredPoints={pointsModalInfo.required}
              remainingPoints={pointsModalInfo.remaining}
              actionName={pointsModalInfo.action}
            />
        </main>
    </div>
  );
};

export default App;