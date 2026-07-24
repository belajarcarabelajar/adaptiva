import { describe, it, expect } from 'vitest';
import { applyInlineFormatting, renderLatexInText } from './MarkdownRenderer';

describe('applyInlineFormatting', () => {
  it('should return empty string for empty input', () => {
    expect(applyInlineFormatting('')).toBe('');
  });

  describe('em dash replacement rule', () => {
    it('should replace unicode em dashes (— and –) with a comma', () => {
      expect(applyInlineFormatting('Adaptiva — AI Study Assistant')).toBe('Adaptiva, AI Study Assistant');
      expect(applyInlineFormatting('Concept–Definition')).toBe('Concept, Definition');
    });

    it('should replace isolated double hyphens with a comma', () => {
      expect(applyInlineFormatting('Primary concept -- secondary detail')).toBe('Primary concept, secondary detail');
    });
  });

  describe('LaTeX math rendering', () => {
    it('should render inline LaTeX math $E=mc^2$', () => {
      const output = renderLatexInText('$E=mc^2$');
      expect(output).toContain('katex');
      expect(output).toContain('E=mc');
    });

    it('should render block LaTeX math $$a^2 + b^2 = c^2$$', () => {
      const output = renderLatexInText('$$a^2 + b^2 = c^2$$');
      expect(output).toContain('katex-display');
      expect(output).toContain('a^2 + b^2 = c^2');
    });
  });

  describe('bold formatting and asterisk cleanup', () => {
    it('should clean **bold** text and asterisks', () => {
      expect(applyInlineFormatting('This is **bold** text')).toBe('This is bold text');
    });

    it('should clean __bold__ text', () => {
      expect(applyInlineFormatting('This is __bold__ text')).toBe('This is bold text');
    });

    it('should clean malformed prompt asterisks such as ***bold italic*** or stray **', () => {
      expect(applyInlineFormatting('***Important note***')).toBe('Important note');
      expect(applyInlineFormatting('**unclosed bold text')).toBe('unclosed bold text');
    });
  });

  describe('italic formatting', () => {
    it('should format _italic_ text', () => {
      expect(applyInlineFormatting('This is _italic_ text')).toBe('This is italic text');
    });

    it('should format *italic* text', () => {
      expect(applyInlineFormatting('This is *italic* text')).toBe('This is italic text');
    });
  });

  describe('emoji stripping', () => {
    it('should strip emojis from text', () => {
      expect(applyInlineFormatting('🚀 Clean Title 📚')).toBe('Clean Title');
    });
  });

  describe('markdown links', () => {
    it('should format simple links', () => {
      expect(applyInlineFormatting('Check out [Google](https://google.com)')).toBe(
        'Check out <a href="https://google.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">Google</a>'
      );
    });

    it('should prevent javascript: links', () => {
      expect(applyInlineFormatting('Malicious [link](javascript:alert(1))')).toBe(
        'Malicious [link](javascript:alert(1))'
      );
    });

    it('should handle data: links', () => {
      expect(applyInlineFormatting('Data [link](data:text/html,<script>alert(1)</script>)')).toBe(
        'Data [link](data:text/html,<script>alert(1)</script>)'
      );
    });

    it('should handle empty link text, falling back to URL', () => {
      expect(applyInlineFormatting('[](https://example.com)')).toBe(
        '[](<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">https://example.com</a>)'
      );
    });

    it('should strip HTML attributes from link text', () => {
       expect(applyInlineFormatting('[link class="abc"](https://example.com)')).toBe(
          '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">link</a>'
       );
    });

    it('should handle links with trailing attributes mistakenly kept in url', () => {
       expect(applyInlineFormatting('[link](https://example.com" class="abc")')).toBe(
          '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">link</a>'
       );
    });
  });

  describe('autolinks', () => {
    it('should autolink http/https URLs', () => {
      expect(applyInlineFormatting('Visit https://example.com today')).toBe(
        'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">https://example.com</a> today'
      );
    });

    it('should autolink www. URLs', () => {
      expect(applyInlineFormatting('Visit www.example.com today')).toBe(
        'Visit <a href="http://www.example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">www.example.com</a> today'
      );
    });

    it('should not double-link already linked URLs in markdown links', () => {
      expect(applyInlineFormatting('[https://example.com](https://example.com)')).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">https://example.com</a>'
      );
    });

    it('should not autolink javascript: urls', () => {
      expect(applyInlineFormatting('Visit javascript:alert(1)')).toBe(
        'Visit javascript:alert(1)'
      );
    });
  });
});
