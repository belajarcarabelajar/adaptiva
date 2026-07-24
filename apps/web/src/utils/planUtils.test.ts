import { describe, it, expect } from 'vitest';
import { parseSubtasks } from './planUtils';

describe('parseSubtasks', () => {
  it('returns an empty array when input is empty or falsy', () => {
    expect(parseSubtasks('')).toEqual([]);
    expect(parseSubtasks(null as any)).toEqual([]);
  });

  it('parses dash bullet points correctly', () => {
    const markdown = `- Read section 1\n- Complete exercise 2\n- Submit feedback`;
    expect(parseSubtasks(markdown)).toEqual([
      'Read section 1',
      'Complete exercise 2',
      'Submit feedback'
    ]);
  });

  it('parses asterisk bullet points correctly', () => {
    const markdown = `* Learn React hooks\n* Practice state management`;
    expect(parseSubtasks(markdown)).toEqual([
      'Learn React hooks',
      'Practice state management'
    ]);
  });

  it('parses numbered lists correctly', () => {
    const markdown = `1. Step one\n2. Step two\n3. Step three`;
    expect(parseSubtasks(markdown)).toEqual([
      'Step one',
      'Step two',
      'Step three'
    ]);
  });

  it('handles mixed list styles and empty lines', () => {
    const markdown = `
    - Visual: Watch video tutorial

    1. Read article
    * Practice exercise
    `;
    expect(parseSubtasks(markdown)).toEqual([
      'Visual: Watch video tutorial',
      'Read article',
      'Practice exercise'
    ]);
  });
});
