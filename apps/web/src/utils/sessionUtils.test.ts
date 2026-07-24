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
    expect(loadSessionCheckpoint()).toBeNull();

    sessionStorage.setItem(SESSION_CHECKPOINT_KEY, 'invalid json {{{');
    expect(loadSessionCheckpoint()).toBeNull();
  });

  it('detects standard refresh correctly using performance entry', () => {
    const mockGetEntries = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as PerformanceNavigationTiming
    ]);

    expect(isStandardRefresh()).toBe(true);

    mockGetEntries.mockReturnValue([
      { type: 'navigate' } as PerformanceNavigationTiming
    ]);

    expect(isStandardRefresh()).toBe(false);
  });
});
