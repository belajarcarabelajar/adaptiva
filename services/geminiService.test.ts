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

import { generateInitialCurriculumOutline } from './geminiService';

// Suppress console statements for clean test output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

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
