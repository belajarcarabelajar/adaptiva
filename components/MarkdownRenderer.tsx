



import React, { memo } from 'react';
import DOMPurify from 'dompurify';

// Configure DOMPurify to enforce target="_blank" and rel="noopener noreferrer" on all links
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// Helper function to apply inline Markdown formatting to HTML

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

export const applyInlineFormatting = (text: string): string => {
  if (!text) return "";
  let formattedText = text;

  // Helper to strip common HTML attribute patterns from a string
  const stripHtmlAttributesFromString = (str: string): string => {
    let cleanedStr = str;

    // Remove common quoted attributes: "attr=value", 'attr=value', attr="value", attr='value'
    HTML_ATTR_REGEXES.forEach(pattern => {
        cleanedStr = cleanedStr.replace(pattern, '');
    });

    // Remove potentially unclosed/malformed attributes if they look like ` "attr=` or ` attr="` at string end
    cleanedStr = cleanedStr.replace(UNCLOSED_QUOTE_ATTR_REGEX, '$1'); // "attr=
    cleanedStr = cleanedStr.replace(UNCLOSED_ATTR_QUOTE_REGEX, '$1'); // attr=" or attr='

    // Remove orphaned HTML tags often mistakenly added by AI
    cleanedStr = cleanedStr.replace(ORPHANED_HTML_TAG_REGEX, '');


    return cleanedStr.trim();
  };


  // Markdown links: [text](url)
  formattedText = formattedText.replace(MARKDOWN_LINK_REGEX, (match, rawLinkText, capturedUrlContent) => {
    let urlToUse = capturedUrlContent;

    // Clean the URL part
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
    urlToUse = stripHtmlAttributesFromString(urlToUse.trim()); // Further clean and trim URL


    if (MALICIOUS_PROTOCOL_REGEX.test(urlToUse)) {
        return match; // Return original match if potentially malicious
    }

    // Clean the link text part
    let cleanedLinkText = stripHtmlAttributesFromString(rawLinkText);
    
    if (!cleanedLinkText.trim() && urlToUse) { // If link text becomes empty after cleaning, use URL as text
        cleanedLinkText = urlToUse;
    } else if (!cleanedLinkText.trim() && !urlToUse) { // Both empty, fallback to original raw link text or empty
        cleanedLinkText = rawLinkText || ""; 
    }
    
    // If URL is also empty after cleaning, it's not a valid link, return original text.
    if (!urlToUse.trim()) {
        return match; 
    }

    return `<a href="${urlToUse}" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">${cleanedLinkText}</a>`;
  });

  // Autolink URLs (should run after specific Markdown link parsing)
  formattedText = formattedText.replace(AUTOLINK_URL_REGEX, (urlMatch, p1, p2, p3, offset) => {
    // Check if this match is already part of an <a> tag's href or text created by the Markdown link rule above.
    // This is a simple check; more robust would involve parsing the HTML structure.
    const surroundingChars = formattedText.substring(
        Math.max(0, offset - 10),
        offset + urlMatch.length + 10
    );
    if (surroundingChars.includes('href="') || surroundingChars.includes('>') && surroundingChars.includes('</a>')) { // Heuristic
      return urlMatch; // Already linked, skip
    }

    let properUrl = urlMatch;
    if (urlMatch.toLowerCase().startsWith('www.')) {
      properUrl = 'http://' + urlMatch; 
    }
    if (MALICIOUS_PROTOCOL_REGEX.test(properUrl)) {
        return urlMatch; 
    }
    return `<a href="${properUrl}" class="text-brand-orange hover:text-brand-red dark:text-orange-400 dark:hover:text-red-500 underline">${urlMatch}</a>`;
  });
  
  // Bold: **text** or __text__
  formattedText = formattedText.replace(BOLD_REGEX, (match, p1, p2) => `<strong>${p1 || p2}</strong>`);
  
  // Italic: _text_ or *text*
  formattedText = formattedText.replace(ITALIC_UNDERSCORE_REGEX, '<em>$1</em>');
  formattedText = formattedText.replace(ITALIC_ASTERISK_REGEX, '$1<em>$2</em>');

  return formattedText;
};

interface MarkdownRendererProps {
  content: string;
  baseTextSize?: string;
}

function MarkdownRendererInternal({ content, baseTextSize = "text-xl" }: MarkdownRendererProps) {
  if (!content) return null;

  const createMarkup = (line: string, key: string | number): React.ReactElement | null => {
    const numberedListMatch = line.match(NUMBERED_LIST_REGEX);

    let htmlContentSource = ""; 

    if (line.startsWith('# ')) {
      htmlContentSource = line.substring(2);
      const formattedHtml = applyInlineFormatting(htmlContentSource);
      const sanitizedHtml = DOMPurify.sanitize(formattedHtml);
      return <h1 key={key} className={`text-4xl md:text-5xl font-bold my-5 md:my-6 text-brand-blue dark:text-blue-300`} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    } else if (line.startsWith('## ')) {
      htmlContentSource = line.substring(3);
      const formattedHtml = applyInlineFormatting(htmlContentSource);
      const sanitizedHtml = DOMPurify.sanitize(formattedHtml);
      return <h2 key={key} className={`text-3xl md:text-4xl font-semibold my-4 md:my-5 text-brand-blue dark:text-blue-300`} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    } else if (line.startsWith('### ')) {
      htmlContentSource = line.substring(4);
      const formattedHtml = applyInlineFormatting(htmlContentSource);
      const sanitizedHtml = DOMPurify.sanitize(formattedHtml);
      return <h3 key={key} className={`text-2xl md:text-3xl font-semibold my-3 md:my-4 text-brand-orange dark:text-orange-400`} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
    } else if (line.startsWith('* ') || line.startsWith('- ') || line.startsWith('✅ ') || numberedListMatch) {
      let contentPart = line;
      let displayPrefix = '';

      if (line.startsWith('✅ ')) {
        contentPart = line.substring(2); 
        displayPrefix = '✅ ';
        if (BULLETED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(BULLETED_LIST_REGEX)![0].length);
        } else if (NUMBERED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(NUMBERED_LIST_REGEX)![0].length);
        }
      } else if (line.startsWith('* ') || line.startsWith('- ')) {
        contentPart = line.substring(2);
        if (BULLETED_LIST_REGEX.test(contentPart)) {
            contentPart = contentPart.substring(contentPart.match(BULLETED_LIST_REGEX)![0].length);
        }
      } else if (numberedListMatch) {
        contentPart = line.substring(numberedListMatch[0].length);
        const innerMatch = contentPart.match(NUMBERED_LIST_REGEX);
        if (innerMatch) {
            contentPart = contentPart.substring(innerMatch[0].length);
        }
      }
      
      const formattedContentPart = applyInlineFormatting(contentPart);
      const sanitizedContentPart = DOMPurify.sanitize(formattedContentPart, { ADD_TAGS: ["a"], ADD_ATTR: ['href', 'target', 'rel', 'class'] });
      return (
        <li key={key} className={`ml-6 md:ml-8 my-1 md:my-1.5 ${baseTextSize} dark:text-gray-200`}>
          {displayPrefix && <span className="mr-1">{displayPrefix}</span>}
          <span dangerouslySetInnerHTML={{ __html: sanitizedContentPart }} />
        </li>
      );
    }
    
    htmlContentSource = line;
    const formattedLine = applyInlineFormatting(htmlContentSource);
    const sanitizedLine = DOMPurify.sanitize(formattedLine, { ADD_TAGS: ["a"], ADD_ATTR: ['href', 'target', 'rel', 'class'] });
    return <p key={key} className={`my-3 md:my-3.5 ${baseTextSize} dark:text-gray-200`} dangerouslySetInnerHTML={{ __html: sanitizedLine }} />;
  };
  
  const lines = content.split('\n');
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