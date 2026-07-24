/**
 * Parses raw task markdown into individual subtask strings by splitting lines,
 * trimming whitespace, and stripping leading bullet point, numbered, or checkbox markers.
 */
export const parseSubtasks = (taskContent: string): string[] => {
  if (!taskContent) return [];
  return taskContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Strip all leading bullet, number, or checkmark markers (including chained ones like "- 1. ")
      let text = line.replace(/^(([-*+✅]|\d+\.|\d+\))\s*)+/, '').trim();
      // Bold category prefixes (e.g., "Visual: ...", "Hands-on: ...", "Praktik: ...") if not already bolded
      if (/^[A-Za-z\s-]{2,15}:\s+/.test(text) && !text.startsWith('**')) {
        const colonIdx = text.indexOf(':');
        const prefix = text.substring(0, colonIdx).trim();
        const rest = text.substring(colonIdx + 1).trim();
        text = `**${prefix}:** ${rest}`;
      }
      return text;
    })
    .filter(text => text.length > 0);
};
