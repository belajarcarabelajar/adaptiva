import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

describe('App', () => {
    it('handles localStorage errors gracefully when setting dark mode', () => {
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

        render(<App />);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Failed to save dark mode preference to localStorage:",
            mockError
        );

        consoleErrorSpy.mockRestore();
        setItemSpy.mockRestore();
        vi.restoreAllMocks();
    });
});
