import { Chat } from "@google/genai";

export interface CurriculumModule {
  title: string;
  moduleMaterial?: string; 
  lectureSummary?: string; // For backward compatibility with older data
  isLoading?: boolean;     
  loadingError?: string | null; 
}

export interface Curriculum {
  topic: string;
  syllabus: string;
  modules: CurriculumModule[]; 
}

export interface SevenDayPlan {
  topic: string;
  days: DailyPlan[];
}

export interface DailyPlan {
  day: number;
  task: string;
  summaryFocus: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string; 
  detailedExplanation?: string; 
  isDetailedExplanationLoading?: boolean; 
  userAnswer?: string; // User's selected answer for this question
  isCorrect?: boolean; // Was the user's answer correct?
  feedbackShown?: boolean; // Has feedback been shown for this question?
}

export interface ChatMessage {
  id:string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export interface GeminiCurriculumOutlineResponse {
  syllabus: string;
  moduleTitles: string[];
}

export interface GeminiModuleDetailResponse {
  moduleMaterial: string; 
}

export interface GeminiSevenDayPlanResponse {
  days: Array<{
    day: number;
    task: string;
    summaryFocus: string;
  }>;
}

export interface GeminiQuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string; 
  explanation?: string; 
}

export interface TutorSession {
  chat: Chat | null;
  history: ChatMessage[];
  initialTutorGreeting?: string; 
}

export interface StoredQuizAttempt {
  moduleId: string; 
  moduleTitle: string;
  quiz: QuizQuestion[]; // Now stores the full QuizQuestion objects with user answers and feedback status
  score: number;
  timestamp: number;
  retakeInfo?: string; // Added to store info about retakes
}

// New types for Exam Feature
export type ExamQuestionType = 'multiple-choice'; // Only multiple-choice

export interface ExamQuestion {
  id: string;
  type: ExamQuestionType; // Will always be 'multiple-choice'
  questionText: string;
  options: string[]; // Always present for multiple-choice
  correctAnswer: string; 
  explanation: string;
  difficulty: number; // 1-5
  maxPoints: number; // e.g., 1 for MC
  userAnswer?: string;
  isCorrect?: boolean; 
  scoreAwarded?: number; 
  feedbackShown?: boolean; 
  detailedExplanation?: string;
  isDetailedExplanationLoading?: boolean;
}

export interface ExamConfiguration {
  moduleId: string;
  moduleTitle: string;
  durationMinutes?: number; 
  timeLimitEnabled: boolean;
  numMultipleChoice: number;
  // numShortAnswer: number; // Removed
  difficulty: number; // 1-5
  initialConfig?: Partial<ExamConfiguration>; 
}

export interface ExamAttempt {
  id: string;
  config: ExamConfiguration;
  questions: ExamQuestion[]; 
  startTime: number;
  endTime?: number;
  timeTakenSeconds?: number;
  totalScore: number; 
  maxScore: number; 
  timestamp: number;
}

export interface GeminiExamQuestion {
  type: ExamQuestionType; // Will always be 'multiple-choice'
  questionText: string;
  options: string[]; // Always present
  correctAnswer: string;
  explanation: string;
  difficulty?: number; 
  maxPoints?: number; 
}

export interface GeminiExamResponse {
  questions: GeminiExamQuestion[];
}

// --- Flashcard Feature Types ---
export type FlashcardStatus = 'learning' | 'reviewing' | 'known' | 'mastered';
export type FlashcardDifficulty = 'hard' | 'medium' | 'easy';
export type FlashcardSubView = 'daftar' | 'tumpukan' | 'permainan';

export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  status: FlashcardStatus;
  lastReviewed: number; // Timestamp
  nextReview: number;   // Timestamp for spaced repetition
  difficultyLevel: FlashcardDifficulty;
  moduleId: string; // To associate with a learning module
}

export interface FlashcardDeck {
  moduleId: string; // Corresponds to module title or a unique ID derived from it
  moduleTitle: string;
  cards: Flashcard[];
}

export interface GeminiFlashcardItem {
  term: string;
  definition: string;
}
export interface GeminiFlashcardResponse {
  flashcards: GeminiFlashcardItem[];
}

export interface FlashcardMatchItem {
  id: string; // Unique ID for this game item (e.g., 'term-fc1', 'def-fc1')
  flashcardId: string; // ID of the original flashcard
  type: 'term' | 'definition';
  text: string;
  isVisible: boolean;
}
// --- End Flashcard Feature Types ---

// --- Learning Resources Types ---
export interface LearningResourceSource {
  web: {
    uri: string;
    title: string;
  };
}
export interface LearningResource {
  content: string;
  sources: LearningResourceSource[];
}
// --- End Learning Resources Types ---


export interface HistoryItem {
  id: string;
  topic: string;
  targetLanguage: string;
  curriculum: Curriculum; 
  sevenDayPlan: SevenDayPlan; 
  initialTutorGreeting: string;
  timestamp: number;
  moduleCompletionStatus: Record<string, { summaryLoaded: boolean; quizTaken: boolean; }>; 
  planTaskCompletionStatus: Record<number, boolean>; 
  planSubtaskCompletionStatus?: Record<string, boolean>; 
  overallProgress: number; 
  journeyCompleted: boolean; 
  quizHistory: StoredQuizAttempt[];
  examHistory?: ExamAttempt[]; 
  flashcardDecks?: Record<string, FlashcardDeck>; // Stores flashcard decks by module ID/title
  learningResources?: LearningResource | null; // Added to store fetched resources
}

export type ActiveTab = 'curriculum' | 'plan' | 'resources' | 'tutor'; // Added 'resources'
export type CurriculumSubTab = 
  | 'syllabus' 
  | 'material' 
  | 'quiz'           
  | 'exam'           
  | 'flashcards'
  | 'study_log'; // Replaces quiz_history, exam_history, flashcards_history

export type ViewMode = 'input' | 'loading' | 'results' | 'error';
export type ExamViewMode = 'config' | 'taking' | 'results' | 'history_summary' | 'module_selection';

export interface SessionCheckpoint {
  selectedHistoryItemId: string | null;
  viewMode: ViewMode;
  activeTab: ActiveTab;
  curriculumSubTab: CurriculumSubTab;
  selectedMaterialModuleIndex: number | null;
  
  // Feature-specific checkpoints
  currentQuizModuleTitle?: string | null;
  currentQuizQuestionIndex?: number;
  activeExamModuleTitle?: string | null;
  examViewMode?: ExamViewMode;
  currentExamQuestionIndex?: number;
  activeFlashcardModuleTitle?: string | null;
  flashcardSubView?: FlashcardSubView;
  currentFlashcardIndexInStack?: number;
  
  timestamp: number;
}