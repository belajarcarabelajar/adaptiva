import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { _resetAuthSharedStateForTesting } from './hooks/useAuth';

describe('App', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        _resetAuthSharedStateForTesting();
        vi.restoreAllMocks();
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        } as Response);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        localStorage.clear();
        sessionStorage.clear();
    });

    it('handles localStorage errors gracefully when setting dark mode', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const mockError = new Error('QuotaExceededError');

        // Mock matchMedia before render
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        // Mock localStorage.getItem so it doesn't throw during initial render
        const originalGetItem = Storage.prototype.getItem;
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
            if (key === 'adaptivaStudyDarkMode') {
                return null;
            }
            return originalGetItem.call(localStorage, key);
        });

        // Mock localStorage.setItem to throw the expected error
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
            if (key === 'adaptivaStudyDarkMode') {
                throw mockError;
            }
        });

        await act(async () => {
            render(<App />);
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Failed to save dark mode preference to localStorage:",
            mockError
        );

        consoleErrorSpy.mockRestore();
        setItemSpy.mockRestore();
    });

    it('restores navigation checkpoint from sessionStorage on standard refresh', async () => {
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const mockHistory = [
            {
                id: 'hist-module3',
                topic: 'TypeScript Advanced',
                targetLanguage: 'Bahasa Indonesia',
                curriculum: {
                    topic: 'TypeScript Advanced',
                    syllabus: 'Overview',
                    modules: [
                        { title: 'Module 1: Basics', moduleMaterial: 'Material 1' },
                        { title: 'Module 2: Generics', moduleMaterial: 'Material 2' },
                        { title: 'Module 3: Type Manipulation', moduleMaterial: 'Material 3' }
                    ]
                },
                sevenDayPlan: { topic: 'TypeScript Advanced', days: [] },
                initialTutorGreeting: 'Halo',
                timestamp: Date.now(),
                moduleCompletionStatus: {},
                planTaskCompletionStatus: {},
                overallProgress: 50,
                journeyCompleted: false,
                quizHistory: []
            }
        ];

        const mockCheckpoint = {
            selectedHistoryItemId: 'hist-module3',
            viewMode: 'results',
            activeTab: 'curriculum',
            curriculumSubTab: 'material',
            selectedMaterialModuleIndex: 2,
            timestamp: Date.now()
        };

        localStorage.setItem('adaptivaStudyHistory', JSON.stringify(mockHistory));
        sessionStorage.setItem('adaptivaSessionCheckpoint', JSON.stringify(mockCheckpoint));

        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
            { type: 'reload' } as PerformanceNavigationTiming
        ]);

        let rendered: any;
        await act(async () => {
            rendered = render(<App />);
        });

        expect(rendered.getByText('Module 3: Type Manipulation')).toBeInTheDocument();
        expect(rendered.getByText('Material 3')).toBeInTheDocument();
    });
});



