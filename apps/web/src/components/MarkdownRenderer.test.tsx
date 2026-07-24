import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MemoizedMarkdownRenderer, { applyInlineFormatting, renderLatexInText } from './MarkdownRenderer';

describe('MarkdownRenderer component', () => {
  it('renders null when content is empty', () => {
    const { container } = render(<MemoizedMarkdownRenderer content="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders inline span when inline prop is true', () => {
    render(<MemoizedMarkdownRenderer content="Inline **bold** text" inline={true} />);
    expect(screen.getByText('Inline bold text')).toBeInTheDocument();
  });

  it('renders inline with HTML sanitization (DOMPurify path)', () => {
    const { container } = render(<MemoizedMarkdownRenderer content="Plain inline text" inline={true} />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span?.innerHTML).toContain('Plain inline text');
  });

  it('renders Markdown headings 1 to 6', () => {
    const markdown = `
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
    `;
    render(<MemoizedMarkdownRenderer content={markdown} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading 1');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Heading 2');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Heading 3');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Heading 4');
    expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('Heading 5');
    expect(screen.getByRole('heading', { level: 6 })).toHaveTextContent('Heading 6');
  });

  it('renders bullet lists, check lists, and numbered lists', () => {
    const markdown = `
- Bullet item 1
- Bullet item 2
✅ Completed task
1. Numbered item 1
2. Numbered item 2
    `;
    render(<MemoizedMarkdownRenderer content={markdown} />);

    expect(screen.getByText('Bullet item 1')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();
    expect(screen.getByText('Numbered item 1')).toBeInTheDocument();
  });

  it('renders numbered list as an ol element', () => {
    const markdown = `
1. First numbered
2. Second numbered
3. Third numbered
    `;
    const { container } = render(<MemoizedMarkdownRenderer content={markdown} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('renders mixed bullet and numbered lists (ul → ol flush)', () => {
    const markdown = `
- Bullet A
- Bullet B
1. Numbered A
2. Numbered B
    `;
    const { container } = render(<MemoizedMarkdownRenderer content={markdown} />);
    // Both ul and ol should be rendered as separate list containers
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(screen.getByText('Bullet A')).toBeInTheDocument();
    expect(screen.getByText('Numbered A')).toBeInTheDocument();
  });

  it('renders checklist item with ✅ text (emoji stripped in preprocessing)', () => {
    // ✅ is an Extended_Pictographic emoji and is stripped before createMarkup runs.
    // So '✅ item text' becomes a plain bullet list item with just 'item text'.
    const markdown = '✅ item text';
    render(<MemoizedMarkdownRenderer content={markdown} />);
    expect(screen.getByText('item text')).toBeInTheDocument();
  });

  it('renders plain paragraph for non-list non-heading lines', () => {
    render(<MemoizedMarkdownRenderer content="This is a plain paragraph line." />);
    expect(screen.getByText('This is a plain paragraph line.')).toBeInTheDocument();
  });

  it('renders numbered list followed immediately by bullet list (ol→ul flush covers line 312 and ul-end covers line 341)', () => {
    // When an ol item is followed immediately by a ul item (no paragraph between),
    // the ol list must be flushed (line 312) before starting the ul.
    // The ul items at end-of-content trigger the ul-end flush (line 341).
    const markdown = '1. Numbered one\n2. Numbered two\n- Bullet alpha\n- Bullet beta';
    const { container } = render(<MemoizedMarkdownRenderer content={markdown} />);
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(screen.getByText('Numbered one')).toBeInTheDocument();
    expect(screen.getByText('Bullet alpha')).toBeInTheDocument();
  });

  it('renders numbered list followed by paragraph mid-content (ol flush at line 324)', () => {
    // When a non-list element follows an ol, the accumulated ol items must be flushed
    // mid-content (line 324), then the paragraph is pushed separately.
    const markdown = '1. Numbered item\nPlain paragraph text\n- Trailing bullet';
    render(<MemoizedMarkdownRenderer content={markdown} />);
    expect(screen.getByText('Numbered item')).toBeInTheDocument();
    expect(screen.getByText('Plain paragraph text')).toBeInTheDocument();
    expect(screen.getByText('Trailing bullet')).toBeInTheDocument();
  });

  it('renders deeply nested numbered list item (line 272: inner numbered match trimmed)', () => {
    // "1. 2. item" - the content after the outer "1. " is "2. item".
    // NUMBERED_LIST_REGEX matches "2. " inside contentPart (line 272).
    const markdown = '1. 2. Deeply nested item';
    render(<MemoizedMarkdownRenderer content={markdown} />);
    expect(screen.getByText('Deeply nested item')).toBeInTheDocument();
  });
});

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

  describe('inline mode formatting', () => {
    it('should format inline text without block paragraph tags or top/bottom margins', () => {
      const output = applyInlineFormatting('Fokus pada **konsep utama** fisika kuantum');
      expect(output).toBe('Fokus pada konsep utama fisika kuantum');
      expect(output).not.toContain('<p');
    });
  });
});
