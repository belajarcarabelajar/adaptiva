import { describe, it, expect } from 'vitest';
import { applyInlineFormatting } from './MarkdownRenderer';

describe('applyInlineFormatting', () => {
  it('should return empty string for empty input', () => {
    expect(applyInlineFormatting('')).toBe('');
  });

  describe('bold formatting', () => {
    it('should format **bold** text', () => {
      expect(applyInlineFormatting('This is **bold** text')).toBe('This is <strong>bold</strong> text');
    });

    it('should format __bold__ text', () => {
      expect(applyInlineFormatting('This is __bold__ text')).toBe('This is <strong>bold</strong> text');
    });

    it('should format multiple bold texts', () => {
      expect(applyInlineFormatting('**bold1** and __bold2__')).toBe('<strong>bold1</strong> and <strong>bold2</strong>');
    });
  });

  describe('italic formatting', () => {
    it('should format _italic_ text', () => {
      expect(applyInlineFormatting('This is _italic_ text')).toBe('This is <em>italic</em> text');
    });

    it('should format *italic* text', () => {
      expect(applyInlineFormatting('This is *italic* text')).toBe('This is <em>italic</em> text');
    });

    it('should format multiple italic texts', () => {
      expect(applyInlineFormatting('_italic1_ and *italic2*')).toBe('<em>italic1</em> and <em>italic2</em>');
    });
  });

  describe('combined formatting', () => {
    it('should handle both bold and italic', () => {
      expect(applyInlineFormatting('**bold** and _italic_')).toBe('<strong>bold</strong> and <em>italic</em>');
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
