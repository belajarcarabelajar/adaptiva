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
    .map(line => line.replace(/^([-*+]\s*|\d+\.\s*|✅\s*)/, '').trim())
    .filter(text => text.length > 0);
};
