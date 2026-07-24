import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: (...args: any[]) => mockGenerateContent(...args),
      };
      constructor() {}
    },
  };
});

import { generateInitialCurriculumOutline, cleanModuleTitle, cleanAiOutput } from './geminiService';

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
      text: "{\n  \"syllabus\": \"## Title\\n- Item 1\n- Item 2\",\n  \"moduleTitles\": [\"Modul 1\"]\n}"
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

  it('should format instruction correctly when targetLanguage is provided and is not English', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
        moduleTitles: ['Module 1']
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    await generateInitialCurriculumOutline('React', 'Indonesian');

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('Indonesian');
    expect(callArgs.contents).toContain('kamu');
  });

  it('should format instruction correctly when targetLanguage is English', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
        moduleTitles: ['Module 1']
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    await generateInitialCurriculumOutline('React', 'English');

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('Ensure the syllabus and module titles are in English');
  });

  it('should handle missing moduleTitles or syllabus', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('React');
    expect(result).toBeNull();
  });

  it('should filter out empty module titles', async () => {
    const mockResponse = {
      text: JSON.stringify({
        syllabus: '## My Syllabus',
        moduleTitles: ['Module 1', ' ', '', 'Module 2']
      })
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const result = await generateInitialCurriculumOutline('React');
    expect(result?.modules).toHaveLength(2);
    expect(result?.modules[0].title).toBe('Module 1');
    expect(result?.modules[1].title).toBe('Module 2');
  });

  it('should throw error when API call fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API Error'));

    await expect(generateInitialCurriculumOutline('React')).rejects.toThrow('API Error');
  }, 10000); // Increased timeout to account for exponential backoff retries
});
