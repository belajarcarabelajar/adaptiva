import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SESSION_CHECKPOINT_KEY,
  isStandardRefresh,
  saveSessionCheckpoint,
  loadSessionCheckpoint,
  clearSessionCheckpoint
} from './sessionUtils';
import { SessionCheckpoint } from '../types';

describe('sessionUtils', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('saves and loads session checkpoint correctly', () => {
    const mockCheckpoint: SessionCheckpoint = {
      selectedHistoryItemId: 'hist-123',
      viewMode: 'results',
      activeTab: 'curriculum',
      curriculumSubTab: 'material',
      selectedMaterialModuleIndex: 2,
      timestamp: Date.now()
    };

    saveSessionCheckpoint(mockCheckpoint);
    const loaded = loadSessionCheckpoint();

    expect(loaded).toEqual(mockCheckpoint);
    expect(sessionStorage.getItem(SESSION_CHECKPOINT_KEY)).not.toBeNull();
  });

  it('clears session checkpoint correctly', () => {
    const mockCheckpoint: SessionCheckpoint = {
      selectedHistoryItemId: 'hist-123',
      viewMode: 'results',
      activeTab: 'curriculum',
      curriculumSubTab: 'material',
      selectedMaterialModuleIndex: 2,
      timestamp: Date.now()
    };

    saveSessionCheckpoint(mockCheckpoint);
    clearSessionCheckpoint();
    expect(loadSessionCheckpoint()).toBeNull();
  });

  it('returns null when sessionStorage is empty or invalid JSON', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(loadSessionCheckpoint()).toBeNull();

    sessionStorage.setItem(SESSION_CHECKPOINT_KEY, 'invalid json {{{');
    expect(loadSessionCheckpoint()).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('handles errors gracefully in saveSessionCheckpoint and clearSessionCheckpoint', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('StorageError');
    });

    const mockCheckpoint: SessionCheckpoint = {
      selectedHistoryItemId: 'hist-123',
      viewMode: 'results',
      activeTab: 'curriculum',
      curriculumSubTab: 'material',
      selectedMaterialModuleIndex: 2,
      timestamp: Date.now()
    };

    saveSessionCheckpoint(mockCheckpoint);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to save session checkpoint to sessionStorage:', expect.any(Error));

    clearSessionCheckpoint();
    expect(consoleSpy).toHaveBeenCalledWith('Failed to clear session checkpoint from sessionStorage:', expect.any(Error));
  });

  it('detects standard refresh correctly using performance entry and fallback', () => {
    const mockGetEntries = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as PerformanceNavigationTiming
    ]);

    expect(isStandardRefresh()).toBe(true);

    mockGetEntries.mockReturnValue([
      { type: 'navigate' } as PerformanceNavigationTiming
    ]);

    expect(isStandardRefresh()).toBe(false);

    // Fallback when getEntriesByType throws or returns empty
    mockGetEntries.mockImplementation(() => {
      throw new Error('Not supported');
    });

    (performance as any).navigation = { type: 1 };
    expect(isStandardRefresh()).toBe(true);

    (performance as any).navigation = { type: 0 };
    expect(isStandardRefresh()).toBe(false);
  });
});
