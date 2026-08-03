/**
 * Parses raw task markdown into individual subtask strings by splitting lines,
 * trimming whitespace, and stripping leading bullet point, numbered, or checkbox markers.
 */
export const parseSubtasks = (taskContent: string): string[] => {
  if (!taskContent) return [];

  const result: string[] = [];
  const lines = taskContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    // Strip all leading bullet, number, or checkmark markers (including chained ones like "- 1. ")
    let text = line.replace(/^(([-*+✅]|\d+\.|\d+\))\s*)+/, '').trim();

    if (text.length === 0) continue;

    // Bold category prefixes (e.g., "Visual: ...", "Hands-on: ...", "Praktik: ...") if not already bolded
    if (/^[A-Za-z\s-]{2,15}:\s+/.test(text) && !text.startsWith('**')) {
      const colonIdx = text.indexOf(':');
      const prefix = text.substring(0, colonIdx).trim();
      const rest = text.substring(colonIdx + 1).trim();
      text = `**${prefix}:** ${rest}`;
    }

    result.push(text);
  }

  return result;
};
