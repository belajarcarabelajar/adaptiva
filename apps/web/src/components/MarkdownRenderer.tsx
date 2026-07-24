import React, { memo } from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';

// Configure DOMPurify to enforce target="_blank" and rel="noopener noreferrer" on all links
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// Pre-compiled regular expressions for performance optimization
const HTML_ATTR_REGEXES = [
    /(\s+|\b)(target|rel|class|style|title|id|href|src)\s*=\s*("[^"]*"|'[^']*')/gi,
];
const UNCLOSED_QUOTE_ATTR_REGEX = /(\s*")(target|rel|class|style|title|id|href|src)\s*=\s*$/gi;
const UNCLOSED_ATTR_QUOTE_REGEX = /(\s*)(target|rel|class|style|title|id|href|src)\s*=\s*("|\')$/gi;
const ORPHANED_HTML_TAG_REGEX = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

const TARGET_ATTR_REGEX = /\s*target\s*=/i;
const REL_ATTR_REGEX = /\s*rel\s*=/i;
const CLASS_ATTR_REGEX = /\s*class\s*=/i;

const MALICIOUS_PROTOCOL_REGEX = /^(javascript|data):/i;

const MARKDOWN_LINK_REGEX = /\[([^\]]+)]\(([^)]+)\)/g;
const AUTOLINK_URL_REGEX = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi;

const BOLD_REGEX = /\*\*(.*?)\*\*|__(.*?)__/g;
const ITALIC_UNDERSCORE_REGEX = /(?<![a-zA-Z0-9_])_(?!_)(.*?)(?<!_)_(?![a-zA-Z0-9_])/g;
const ITALIC_ASTERISK_REGEX = /(^|\s)\*(?!\s|\*)(.+?)(?<!\s|\*)\*(?=\s|$)/g;

const NUMBERED_LIST_REGEX = /^(\d+)\.\s+/;
const BULLETED_LIST_REGEX = /^(\*|-)\s+/;
const NUMBERED_LIST_CHECK_REGEX = /^\d+\.\s/;
const HEADING_REGEX = /^(#{1,6})\s*(.*)/;

// DOMPurify configuration allowing KaTeX math SVG/HTML tags and attributes safely
const DOMPURIFY_CONFIG = {
  ADD_TAGS: [
    'a', 'span', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'math', 'annotation', 'semantics', 'mrow', 'msup', 'msub', 'mfrac', 'mover',
    'munder', 'msubsup', 'mspace', 'msqrt', 'mroot', 'mtable', 'mtr', 'mtd',
    'svg', 'path', 'use', 'g', 'line', 'rect', 'circle', 'strong', 'em', 'code', 'pre'
  ],
  ADD_ATTR: [
    'href', 'target', 'rel', 'class', 'style', 'id', 'xmlns', 'viewBox', 'd',
    'fill', 'stroke', 'aria-hidden', 'stroke-width', 'role', 'encoding'
  ]
};

// Helper function to render LaTeX expressions (inline & block display) using KaTeX
export const renderLatexInText = (text: string): string => {
  if (!text) return "";
  let processed = text;

  // 1. Block math: $$ ... $$ or \[ ... \]
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `$$${math}$$`;
    }
  });

  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `\\[${math}\\]`;
    }
  });

  // 2. Inline math: \( ... \) or $ ... $ (excluding dollar amounts like $5 or $100)
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `\\(${math}\\)`;
    }
  });

  // Inline $...$ math: dollar sign followed by non-space, containing math chars/letters, closed by dollar sign
  processed = processed.replace(/(^|\s|\()\$([^\$\n]+?)\$(?=\s|\)|[.,;:!?]|$)/g, (match, prefix, math) => {
    if (/^\d+(\.\d+)?$/.test(math.trim()) || math.startsWith(' ')) {
      return match;
    }
    try {
      const rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      return `${prefix}${rendered}`;
    } catch {
      return match;
    }
  });

  return processed;
};

// Helper function to apply inline Markdown formatting, em dash cleanup, and LaTeX to HTML
export const applyInlineFormatting = (text: string): string => {
  if (!text) return "";
  let formattedText = text;

  // 0. Em Dash Replacement Rule: Replace any em dashes (— / – / --) with ', ' or '. '
  formattedText = formattedText.replace(/\s*[\u2014\u2013]\s*/g, ', ');
  formattedText = formattedText.replace(/\s+--\s+/g, ', ');

  // Helper to strip common HTML attribute patterns from a string
  const stripHtmlAttributesFromString = (str: string): string => {
    let cleanedStr = str;

    HTML_ATTR_REGEXES.forEach(pattern => {
        cleanedStr = cleanedStr.replace(pattern, '');
    });

    cleanedStr = cleanedStr.replace(UNCLOSED_QUOTE_ATTR_REGEX, '$1');
    cleanedStr = cleanedStr.replace(UNCLOSED_ATTR_QUOTE_REGEX, '$1');
    cleanedStr = cleanedStr.replace(ORPHANED_HTML_TAG_REGEX, '');

    return cleanedStr.trim();
  };

  // 1. Render LaTeX before processing standard Markdown symbols
  formattedText = renderLatexInText(formattedText);

  // 2. Markdown links: [text](url)
  formattedText = formattedText.replace(MARKDOWN_LINK_REGEX, (match, rawLinkText, capturedUrlContent) => {
    let urlToUse = capturedUrlContent;

    const firstDoubleQuoteIndexUrl = urlToUse.indexOf('"');
    if (firstDoubleQuoteIndexUrl !== -1) {
        const suffix = urlToUse.substring(firstDoubleQuoteIndexUrl);
        if (TARGET_ATTR_REGEX.test(suffix) || REL_ATTR_REGEX.test(suffix) || CLASS_ATTR_REGEX.test(suffix) ||
            suffix.toLowerCase().startsWith('"target=') || suffix.toLowerCase().startsWith('"rel=') || suffix.toLowerCase().startsWith('"class=')) {
            urlToUse = urlToUse.substring(0, firstDoubleQuoteIndexUrl);
        }
    }
    const firstSingleQuoteIndexUrl = urlToUse.indexOf("'");
    if (firstSingleQuoteIndexUrl !== -1) {
        const suffix = urlToUse.substring(firstSingleQuoteIndexUrl);
        if (TARGET_ATTR_REGEX.test(suffix) || REL_ATTR_REGEX.test(suffix) || CLASS_ATTR_REGEX.test(suffix) ||
            suffix.toLowerCase().startsWith("'target=") || suffix.toLowerCase().startsWith("'rel=") || suffix.toLowerCase().startsWith("'class=")) {
            urlToUse = urlToUse.substring(0, firstSingleQuoteIndexUrl);
        }
    }
    urlToUse = stripHtmlAttributesFromString(urlToUse.trim());

    if (MALICIOUS_PROTOCOL_REGEX.test(urlToUse)) {
        return match;
    }

    let cleanedLinkText = stripHtmlAttributesFromString(rawLinkText);
    
    if (!cleanedLinkText.trim() && urlToUse) {
        cleanedLinkText = urlToUse;
    } else if (!cleanedLinkText.trim() && !urlToUse) {
        cleanedLinkText = rawLinkText || ""; 
    }
    
    if (!urlToUse.trim()) {
        return match; 
    }

    return `<a href="${urlToUse}" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">${cleanedLinkText}</a>`;
  });

  // 3. Autolink URLs
  formattedText = formattedText.replace(AUTOLINK_URL_REGEX, (urlMatch, p1, p2, p3, offset) => {
    const surroundingChars = formattedText.substring(
        Math.max(0, offset - 10),
        offset + urlMatch.length + 10
    );
    if (surroundingChars.includes('href="') || surroundingChars.includes('>') && surroundingChars.includes('</a>')) {
      return urlMatch;
    }

    let properUrl = urlMatch;
    if (urlMatch.toLowerCase().startsWith('www.')) {
      properUrl = 'http://' + urlMatch; 
    }
    if (MALICIOUS_PROTOCOL_REGEX.test(properUrl)) {
        return urlMatch; 
    }
    return `<a href="${properUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">${urlMatch}</a>`;
  });

  // 4. Strip emojis & clean raw asterisks so asterisks never leak into plain text
  formattedText = formattedText.replace(/\p{Extended_Pictographic}/gu, '');
  formattedText = formattedText.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  formattedText = formattedText.replace(BOLD_REGEX, (match, p1, p2) => p1 || p2);
  formattedText = formattedText.replace(/(\*\*\*|\*\*|\*)/g, '');

  // 5. Italic: _text_
  formattedText = formattedText.replace(ITALIC_UNDERSCORE_REGEX, '$1');

  return formattedText.trim();
};

interface MarkdownRendererProps {
  content: string;
  baseTextSize?: string;
  inline?: boolean;
}

function MarkdownRendererInternal({ content, baseTextSize = "text-xl", inline = false }: MarkdownRendererProps) {
  if (!content) return null;

  if (inline) {
    const formattedLine = applyInlineFormatting(content);
    const sanitizedLine = DOMPurify.sanitize(formattedLine, DOMPURIFY_CONFIG);
    return <span className={baseTextSize} dangerouslySetInnerHTML={{ __html: sanitizedLine }} />;
  }

  // Pre-process content: global em dash cleanup & emoji removal
  const cleanContent = content
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    .replace(/\p{Extended_Pictographic}/gu, '');

  const createMarkup = (line: string, key: string | number): React.ReactElement | null => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return null;

    const headingMatch = trimmedLine.match(HEADING_REGEX);
    const numberedListMatch = trimmedLine.match(NUMBERED_LIST_REGEX);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const titleText = headingMatch[2].trim();
      const formattedHtml = applyInlineFormatting(titleText);
      const sanitizedHtml = DOMPurify.sanitize(formattedHtml, DOMPURIFY_CONFIG);

      switch (level) {
        case 1:
          return <h1 key={key} className="text-2xl md:text-3xl font-bold my-4 md:my-5 leading-tight text-brand-blue dark:text-blue-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
        case 2:
          return <h2 key={key} className="text-xl md:text-2xl font-semibold my-3 md:my-4 leading-snug text-brand-blue dark:text-blue-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
        case 3:
          return <h3 key={key} className="text-lg md:text-xl font-semibold my-2.5 md:my-3 leading-snug text-brand-orange dark:text-orange-400" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
        case 4:
          return <h4 key={key} className="text-base md:text-lg font-semibold my-2 md:my-2.5 text-brand-orange dark:text-orange-400" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
        case 5:
          return <h5 key={key} className="text-sm md:text-base font-semibold my-1.5 md:my-2 text-brand-blue dark:text-blue-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
        case 6:
        default:
          return <h6 key={key} className="text-xs md:text-sm font-semibold my-1 md:my-1.5 text-brand-blue dark:text-blue-300" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
      }
    } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ') || trimmedLine.startsWith('✅ ') || numberedListMatch) {
      let contentPart = trimmedLine;
      let displayPrefix = '';

      if (trimmedLine.startsWith('✅ ')) {
        contentPart = trimmedLine.substring(2); 
        displayPrefix = '✅ ';
        if (BULLETED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(BULLETED_LIST_REGEX)![0].length);
        } else if (NUMBERED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(NUMBERED_LIST_REGEX)![0].length);
        }
      } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
        contentPart = trimmedLine.substring(2);
        if (BULLETED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(BULLETED_LIST_REGEX)![0].length);
        }
      } else if (numberedListMatch) {
        contentPart = trimmedLine.substring(numberedListMatch[0].length);
        const innerMatch = contentPart.match(NUMBERED_LIST_REGEX);
        if (innerMatch) {
            contentPart = contentPart.substring(innerMatch[0].length);
        }
      }
      
      const formattedContentPart = applyInlineFormatting(contentPart);
      const sanitizedContentPart = DOMPurify.sanitize(formattedContentPart, DOMPURIFY_CONFIG);
      return (
        <li key={key} className={`ml-6 md:ml-8 my-1 md:my-1.5 ${baseTextSize} dark:text-gray-200`}>
          {displayPrefix && <span className="mr-1">{displayPrefix}</span>}
          <span dangerouslySetInnerHTML={{ __html: sanitizedContentPart }} />
        </li>
      );
    }
    
    const formattedLine = applyInlineFormatting(trimmedLine);
    const sanitizedLine = DOMPurify.sanitize(formattedLine, DOMPURIFY_CONFIG);
    return <p key={key} className={`my-3 md:my-3.5 ${baseTextSize} dark:text-gray-200`} dangerouslySetInnerHTML={{ __html: sanitizedLine }} />;
  };
  
  const lines = cleanContent.split('\n');
  const processedLines = lines.filter(line => line.trim() !== ''); 

  const elements = processedLines.map((line, index) => {
      return createMarkup(line, index);
  }).filter((el): el is React.ReactElement => el !== null);

  const groupedElements: React.ReactElement[] = [];
  let currentListItems: React.ReactElement[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  elements.forEach((el, index) => {
    if (el && el.type === 'li') {
      const currentElementsIndex = elements.indexOf(el); 
      const originalLine = processedLines[currentElementsIndex]; 

      const isNumbered = originalLine && NUMBERED_LIST_CHECK_REGEX.test(originalLine.trim());
      const listTypeForThisItem = isNumbered ? 'ol' : 'ul';

      if (currentListType !== listTypeForThisItem && currentListItems.length > 0) {
        if (currentListType === 'ol') {
          groupedElements.push(<ol key={`ol-${index-currentListItems.length}`} className="mb-3 md:mb-4 list-decimal list-inside">{currentListItems}</ol>);
        } else {
          groupedElements.push(<ul key={`ul-${index-currentListItems.length}`} className="mb-3 md:mb-4 list-disc list-inside">{currentListItems}</ul>);
        }
        currentListItems = [];
      }
      currentListType = listTypeForThisItem;
      currentListItems.push(el);

    } else { 
      if (currentListItems.length > 0) { 
        if (currentListType === 'ol') {
          groupedElements.push(<ol key={`ol-${index-currentListItems.length}`} className="mb-3 md:mb-4 list-decimal list-inside">{currentListItems}</ol>);
        } else {
          groupedElements.push(<ul key={`ul-${index-currentListItems.length}`} className="mb-3 md:mb-4 list-disc list-inside">{currentListItems}</ul>);
        }
        currentListItems = [];
        currentListType = null;
      }
      if (el) { 
        groupedElements.push(el);
      }
    }
  });

  if (currentListItems.length > 0) {
     if (currentListType === 'ol') {
        groupedElements.push(<ol key={`ol-end`} className="mb-3 md:mb-4 list-decimal list-inside">{currentListItems}</ol>);
      } else {
        groupedElements.push(<ul key={`ul-end`} className="mb-3 md:mb-4 list-disc list-inside">{currentListItems}</ul>);
      }
  }

  return <div className={`max-w-none text-brand-black dark:text-gray-100 prose-headings:text-brand-blue dark:prose-headings:text-blue-300 ${baseTextSize}`}>{groupedElements}</div>;
}

const MemoizedMarkdownRenderer = memo(MarkdownRendererInternal);
export default MemoizedMarkdownRenderer;