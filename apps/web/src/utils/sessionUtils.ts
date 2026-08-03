import { SessionCheckpoint } from '../types';

export const SESSION_CHECKPOINT_KEY = 'adaptivaSessionCheckpoint';

/**
 * Checks if the current page load was triggered by a standard browser refresh (reload).
 */
export function isStandardRefresh(): boolean {
  if (typeof window === 'undefined' || !window.performance) return false;

  try {
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries && navEntries.length > 0) {
      return navEntries[0].type === 'reload';
    }
  } catch (e) {
    // Ignore errors reading performance timing
  }

  // Fallback for older browsers / JS DOM test environments
  try {
    return (performance as Performance & { navigation?: { type: number } })?.navigation?.type === 1;
  } catch (e) {
    return false;
  }
}

/**
 * Saves the current navigation session checkpoint into sessionStorage.
 */
export function saveSessionCheckpoint(checkpoint: SessionCheckpoint): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  } catch (e) {
    console.error('Failed to save session checkpoint to sessionStorage:', e);
  }
}

/**
 * Loads the saved navigation session checkpoint from sessionStorage.
 */
export function loadSessionCheckpoint(): SessionCheckpoint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionCheckpoint;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load session checkpoint from sessionStorage:', e);
  }
  return null;
}

/**
 * Clears the navigation session checkpoint from sessionStorage.
 */
export function clearSessionCheckpoint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_CHECKPOINT_KEY);
  } catch (e) {
    console.error('Failed to clear session checkpoint from sessionStorage:', e);
  }
}
