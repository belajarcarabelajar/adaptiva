import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockCreateChat = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: (...args: any[]) => mockGenerateContent(...args),
      };
      chats = {
        create: (...args: any[]) => mockCreateChat(...args),
      };
      constructor() {}
    },
  };
});

import {
  generateInitialCurriculumOutline,
  generateSevenDayPlan,
  generateExamQuestions,
  generateModuleLectureSummary,
  generateQuiz,
  generateDetailedQuizExplanation,
  generateFlashcardsFromMaterial,
  fetchLearningResources,
  startChatSession,
  cleanModuleTitle,
  cleanAiOutput,
  sendMessageToTutorStream,
} from './geminiService';

// Suppress console statements for clean test output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('cleanModuleTitle', () => {
  it('should strip redundant Modul / Module / Day prefixes', () => {
    expect(cleanModuleTitle('Modul 1: Pengenalan Fisika Kuantum')).toBe('Pengenalan Fisika Kuantum');
    expect(cleanModuleTitle('Module 3 - Advanced Calculus')).toBe('Advanced Calculus');
    expect(cleanModuleTitle('Day 2: Machine Learning Fundamentals')).toBe('Machine Learning Fundamentals');
    expect(cleanModuleTitle('1. Teori dasar')).toBe('Teori dasar');
  });

  it('should clean quotes and em dashes', () => {
    expect(cleanModuleTitle('"Modul 2: Konsep Dasar — Aplikasi"')).toBe('Konsep Dasar, Aplikasi');
  });
});

describe('cleanAiOutput', () => {
  it('should strip emojis and asterisks from generated AI output', () => {
    expect(cleanAiOutput('🚀 **Pengenalan** Kuantum 📚')).toBe('Pengenalan Kuantum');
    expect(cleanAiOutput('Materi ini *penting* untuk dipahami.')).toBe('Materi ini penting untuk dipahami.');
  });
});

describe('generateInitialCurriculumOutline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid curriculum on successful API response', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
        moduleTitles: ['Module 1', 'Module 2']
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('React');
    expect(result).toEqual({
      topic: 'React',
      syllabus: '## My Syllabus',
      modules: [
        { title: 'Module 1', moduleMaterial: undefined, isLoading: false, loadingError: null },
        { title: 'Module 2', moduleMaterial: undefined, isLoading: false, loadingError: null }
      ]
    });
  });

  it('should parse JSON with literal unescaped newlines in syllabus text', async () => {
    const mockResponse = {
      text: "{\n  \"syllabus\": \"## Title\\n- Item 1\\n- Item 2\",\n  \"moduleTitles\": [\"Modul 1\"]\n}"
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('Digital Marketing');
    expect(result).not.toBeNull();
    expect(result?.syllabus).toContain('Item 1');
    expect(result?.modules).toHaveLength(1);
  });

  it('should parse JSON wrapped in markdown fences with preamble text', async () => {
    const mockResponse = {
      text: "Here is the syllabus:\n```json\n{\n  \"syllabus\": \"## Intro\",\n  \"moduleTitles\": [\"Modul 1\", \"Modul 2\",]\n}\n```\nHope this helps!"
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('Digital Marketing');
    expect(result).not.toBeNull();
    expect(result?.modules).toHaveLength(2);
  });

  it('should return null when parsing fails', async () => {
    const mockResponse = {
      text: 'not json'
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('React');
    expect(result).toBeNull();
  });

  it('should format instruction correctly when targetLanguage is provided', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
        moduleTitles: ['Module 1']
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    await generateInitialCurriculumOutline('React', 'Indonesian');
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('should throw error when API call fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Error'));

    await expect(generateInitialCurriculumOutline('React')).rejects.toThrow('API Error');
  }, 10000);
});

describe('generateSevenDayPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate valid 7-day learning plan', async () => {
    const mockPlanData = {
      days: Array.from({ length: 7 }, (_, i) => ({
        day: i + 1,
        task: `- Task for day ${i + 1}`,
        summaryFocus: i === 0 ? 'Basics' : `Module ${i + 1}`,
      })),
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockPlanData) });

    const result = await generateSevenDayPlan('JavaScript', 'Syllabus', ['Modul 1: Basics', 'Modul 2: Functions']);

    expect(result).not.toBeNull();
    expect(result?.topic).toBe('JavaScript');
    expect(result?.days).toHaveLength(7);
    expect(result?.days[0].summaryFocus).toBe('Basics');
  });
});

describe('generateExamQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return practice exam questions array', async () => {
    const mockExamData = {
      questions: [
        {
          id: 'q1',
          type: 'multiple-choice',
          questionText: 'What is JSX?',
          options: ['Syntax extension', 'Database query'],
          correctAnswer: 'Syntax extension',
          maxPoints: 10,
          explanation: 'JSX is syntax extension for JavaScript.',
        }
      ]
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockExamData) });

    const result = await generateExamQuestions('React Basics', 'Material content', 1, 3, 'English');

    expect(result).toHaveLength(1);
    expect(result![0].questionText).toBe('What is JSX?');
    expect(result![0].correctAnswer).toBe('Syntax extension');
  });
});

describe('generateModuleLectureSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return generated material string for a module', async () => {
    const mockMaterialData = {
      moduleMaterial: '## Comprehensive Module Material'
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockMaterialData) });

    const result = await generateModuleLectureSummary('Generics', 'TypeScript', 'English');

    expect(result).toEqual({ moduleMaterial: '## Comprehensive Module Material' });
  });
});

describe('generateQuiz and detailed explanation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate quiz questions from material content', async () => {
    const mockQuizData = [
      {
        question: 'What is a variable?',
        options: ['A container', 'A function', 'A loop', 'A class'],
        correctAnswer: 'A container',
        explanation: '- Bullet 1\n- Bullet 2\n- Bullet 3',
      }
    ];
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockQuizData) });

    const result = await generateQuiz('Variables', 'Material on variables', 'English', 1);

    expect(result).toHaveLength(1);
    expect(result![0].question).toBe('What is a variable?');
  });

  it('should return null when module material is empty', async () => {
    const result = await generateQuiz('Variables', '');
    expect(result).toBeNull();
  });

  it('should generate detailed quiz explanation', async () => {
    const mockDetail = { detailedExplanation: 'Detailed explanation text...' };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockDetail) });

    const result = await generateDetailedQuizExplanation(
      {
        id: 'q1',
        question: 'What is a variable?',
        options: ['A container'],
        correctAnswer: 'A container',
        explanation: 'Short explanation',
      },
      'Variables',
      'Material',
      'English'
    );

    expect(result).toEqual({ detailedExplanation: 'Detailed explanation text...' });
  });
});

describe('generateFlashcardsFromMaterial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate flashcard items array', async () => {
    const mockFlashcards = {
      flashcards: [
        { term: 'JSX', definition: 'JavaScript XML syntax' },
        { term: 'Props', definition: 'Component inputs' },
      ]
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockFlashcards) });

    const result = await generateFlashcardsFromMaterial('React', 'React material', 'English', 2);

    expect(result).toHaveLength(2);
    expect(result![0].term).toBe('JSX');
  });

  it('should return null for empty material', async () => {
    const result = await generateFlashcardsFromMaterial('React', '');
    expect(result).toBeNull();
  });
});

describe('fetchLearningResources and startChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch learning resources and return content + sources', async () => {
    const markdownContent = '## Books\n- Clean Code by Robert C. Martin';
    // fetchLearningResources uses googleSearch grounding and returns { content, sources }
    mockGenerateContent.mockResolvedValue({
      text: markdownContent,
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const result = await fetchLearningResources('Clean Code', 'Bahasa Indonesia');

    expect(result).toEqual({ content: markdownContent, sources: [] });
  });

  it('should include grounding sources when response contains web chunks', async () => {
    const content = '## Resources';
    mockGenerateContent.mockResolvedValue({
      text: content,
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.com', title: 'Example' } },
            { web: { uri: 'https://another.com', title: 'Another' } },
          ]
        }
      }],
    });
    const result = await fetchLearningResources('Topic', 'English');
    expect(result?.sources).toHaveLength(2);
    expect(result?.sources[0].web.uri).toBe('https://example.com');
  });

  it('should return null when primary call returns empty content (line 1032)', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '',
      candidates: [],
    });

    const result = await fetchLearningResources('Empty Topic', 'English');
    expect(result).toBeNull();
  });

  it('should fall back to non-grounded request when primary googleSearch call fails all retries', async () => {
    // callWithRetries makes 3 total attempts (original + 2 retries).
    // Reject 3 times to exhaust primary retries, then resolve on the fallback call.
    const fallbackContent = '## Books\n- The Pragmatic Programmer';
    vi.resetAllMocks();
    mockCreateChat.mockReturnValue({ sendMessageStream: vi.fn() });
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Search grounding unavailable'))
      .mockRejectedValueOnce(new Error('Search grounding unavailable'))
      .mockRejectedValueOnce(new Error('Search grounding unavailable'))
      .mockResolvedValueOnce({ text: fallbackContent, candidates: [] });

    const result = await fetchLearningResources('Pragmatic Programmer', 'English');

    expect(result).toEqual({ content: fallbackContent, sources: [] });
  }, 10000);

  it('should return null when fallback call returns empty content (line 1048)', async () => {
    vi.resetAllMocks();
    mockCreateChat.mockReturnValue({ sendMessageStream: vi.fn() });
    mockGenerateContent
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ text: '', candidates: [] });

    const result = await fetchLearningResources('Topic', 'English');
    expect(result).toBeNull();
  }, 10000);

  it('should throw when both primary and fallback fetchLearningResources calls fail', async () => {
    // callWithRetries retries multiple times; reset all mocks so no previous implementation
    // bleeds in, then reject every call to exhaust all retries on primary and fallback paths.
    vi.resetAllMocks();
    mockGenerateContent.mockRejectedValue(new Error('All calls failed'));

    await expect(fetchLearningResources('Topic', 'English')).rejects.toThrow('All calls failed');
  }, 15000);

  it('should initialize chat session in English with system instruction', () => {
    mockCreateChat.mockReturnValue({ sendMessageStream: vi.fn() });

    const chat = startChatSession('TypeScript', 'English');
    expect(mockCreateChat).toHaveBeenCalled();
    expect(chat).toBeDefined();
  });

  it('should initialize chat session with Bahasa Indonesia system instruction', () => {
    mockCreateChat.mockReturnValue({ sendMessageStream: vi.fn() });

    const chat = startChatSession('Fisika Kuantum', 'Bahasa Indonesia');
    expect(mockCreateChat).toHaveBeenCalled();
    expect(chat).toBeDefined();
  });
});

describe('sendMessageToTutorStream', () => {
  it('should stream text chunks and call onChunk for each', async () => {
    async function* mockStream() {
      yield { text: 'Hello ' };
      yield { text: 'world!' };
      yield {}; // chunk with no text — should be skipped
    }

    const mockChat = {
      sendMessageStream: vi.fn().mockResolvedValue(mockStream()),
    };

    const chunks: string[] = [];
    await sendMessageToTutorStream(mockChat as any, 'Hi', (chunk) => chunks.push(chunk));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('')).toContain('Hello');
  });

  it('should call onChunk with error message when streaming throws', async () => {
    const mockChat = {
      sendMessageStream: vi.fn().mockRejectedValue(new Error('Stream failed')),
    };

    const chunks: string[] = [];
    await sendMessageToTutorStream(mockChat as any, 'Hi', (chunk) => chunks.push(chunk));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toContain("I'm sorry");
  });
});

describe('generateModuleLectureSummary additional paths', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return null when curriculum outline JSON cannot be parsed', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not valid json' });
    const result = await generateInitialCurriculumOutline('Unknown', 'English');
    expect(result).toBeNull();
  });

  it('should return null when curriculum is missing required fields', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ moduleTitles: ['M1'] }) });
    const result = await generateInitialCurriculumOutline('Topic', 'English');
    expect(result).toBeNull();
  });

  it('should return cached result on second call with same arguments', async () => {
    const material = JSON.stringify({ moduleMaterial: 'Cached material content here' });
    mockGenerateContent.mockResolvedValue({ text: material });

    const result1 = await generateModuleLectureSummary('Cached Module', 'Topic', 'English');
    expect(result1?.moduleMaterial).toBe('Cached material content here');

    // Second call with same args should hit cache (no additional API call)
    mockGenerateContent.mockClear();
    const result2 = await generateModuleLectureSummary('Cached Module', 'Topic', 'English');
    expect(result2?.moduleMaterial).toBe('Cached material content here');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe('generateDetailedQuizExplanation additional paths', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return null when explanation JSON cannot be parsed', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'not valid json at all' });
    const mockQuestion = {
      id: 'q1',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswer: '4',
      explanation: 'Basic arithmetic.',
      type: 'multiple-choice' as const,
      maxPoints: 1,
      userAnswer: '4',
      isCorrect: true,
      scoreAwarded: 1,
      feedbackShown: false,
      difficulty: 3,
    };
    const result = await generateDetailedQuizExplanation(
      mockQuestion as any,
      'Module Title',
      'Material Content',
      'Bahasa Indonesia'
    );
    expect(result).toBeNull();
  });
});

describe('generateExamQuestions additional paths', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should use fallback difficulty description when difficulty is out of range', async () => {
    const mockExamData = {
      questions: [
        {
          id: 'q1',
          type: 'multiple-choice',
          questionText: 'Test?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          explanation: 'Exp',
        }
      ]
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockExamData) });

    await generateExamQuestions('Topic', 'Material content here', 1, 999, 'English');

    // Verify the prompt contains the medium difficulty description
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('medium, requiring some application of knowledge')
      })
    );
  });

  it('should return null when exam JSON cannot be parsed', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'invalid json' });
    const result = await generateExamQuestions('Topic', 'Material content here', 5, 3, 'English');
    expect(result).toBeNull();
  });

  it('should return null when questions array is missing from response', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ other: 'data' }) });
    const result = await generateExamQuestions('Topic', 'Material content here', 5, 3, 'English');
    expect(result).toBeNull();
  });
});

describe('generateFlashcardsFromMaterial & generateSevenDayPlan & startChatSession additional paths', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should generate exam questions with targetLanguage="Bahasa Indonesia" and difficulty=1', async () => {
    const mockExam = {
      questions: [
        {
          type: 'multiple-choice',
          questionText: 'Soal 1?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          explanation: '- Penjelasan 1\n- Penjelasan 2\n- Penjelasan 3',
          maxPoints: 1,
        },
      ],
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockExam) });

    const result = await generateExamQuestions('Pengenalan', 'Materi lengkap', 1, 1, 'Bahasa Indonesia');
    expect(result).toHaveLength(1);
    expect(result?.[0].questionText).toBe('Soal 1?');
  });

  it('should generate flashcards with targetLanguage="Bahasa Indonesia"', async () => {
    const mockFlashcards = {
      flashcards: [
        { term: 'Istilah 1', definition: 'Definisi 1' },
      ],
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(mockFlashcards) });

    const result = await generateFlashcardsFromMaterial('Pengenalan', 'Materi lengkap', 'Bahasa Indonesia');
    expect(result).toHaveLength(1);
    expect(result?.[0].term).toBe('Istilah 1');
  });

  it('should throw error when generateExamQuestions fails after retries', async () => {
    vi.resetAllMocks();
    mockGenerateContent.mockRejectedValue(new Error('API failure'));
    await expect(generateExamQuestions('Topic', 'Material content', 5, 3, 'English')).rejects.toThrow('API failure');
  });

  it('should return null when generateExamQuestions is called with empty material (lines 746-747)', async () => {
    const result = await generateExamQuestions('Topic', '', 5, 3, 'English');
    expect(result).toBeNull();
  });

  it('should throw error when generateFlashcardsFromMaterial fails after retries', async () => {
    vi.resetAllMocks();
    mockGenerateContent.mockRejectedValue(new Error('API failure'));
    await expect(generateFlashcardsFromMaterial('Topic', 'Material content', 'English')).rejects.toThrow('API failure');
  });

  it('should throw error when generateDetailedQuizExplanation fails after retries (lines 733-734)', async () => {
    vi.resetAllMocks();
    mockGenerateContent.mockRejectedValue(new Error('Quiz explanation failure'));
    const mockQuestion = {
      id: 'q1',
      question: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswer: '4',
      explanation: 'Basic arithmetic.',
      type: 'multiple-choice' as const,
      maxPoints: 1,
      userAnswer: '4',
      isCorrect: true,
      scoreAwarded: 1,
      feedbackShown: false,
      difficulty: 3,
    };
    await expect(
      generateDetailedQuizExplanation(mockQuestion as any, 'Module Title', 'Material Content', 'English')
    ).rejects.toThrow('Quiz explanation failure');
  });

  it('should return null when flashcards response cannot be parsed or flashcards array missing', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ invalid: true }) });
    const result = await generateFlashcardsFromMaterial('Topic', 'Material content here', 'English');
    expect(result).toBeNull();
  });

  it('should return null when seven day plan JSON cannot be parsed or days missing', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ noDays: true }) });
    const result = await generateSevenDayPlan('Topic', 'Syllabus', ['M1'], 'English');
    expect(result).toBeNull();
  });

  it('should initialize chat session in non-English, non-Indonesian language (e.g. Spanish)', () => {
    mockCreateChat.mockReturnValue({ sendMessageStream: vi.fn() });
    const chat = startChatSession('Physics', 'Spanish');
    expect(mockCreateChat).toHaveBeenCalled();
    expect(chat).toBeDefined();
  });
});

