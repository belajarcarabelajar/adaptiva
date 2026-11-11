import { describe, it, expect } from 'vitest';

import { cleanModuleTitle, cleanAiOutput } from './geminiService';

// Per-service behaviour lives in gemini/*.test.ts (curriculum, quiz, flashcard,
// chat, resources, aiClient); this file only checks the barrel's text helpers.

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
