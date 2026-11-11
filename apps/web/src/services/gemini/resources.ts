import { LearningResource } from '../../types';
import { callWithRetries } from './core';

const aiTaskUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/ai` : 'http://localhost:3000/api/ai';

type ResourcesReply = { text: string; sources: { url?: unknown; title?: unknown }[] };

// callAiTask returns only the text, and resources.search also returns sources. The thrown message keeps
// the "<status> <error>: <message>" form because callWithRetries matches on those substrings.
const callResourcesSearch = async (prompt: string): Promise<ResourcesReply> => {
  const response = await fetch(aiTaskUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'resources.search', prompt }),
  });
  const raw = await response.text();
  let data: { text?: unknown; sources?: unknown; error?: unknown; message?: unknown } | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = typeof data?.error === 'string' ? data.error : response.statusText;
    const message = typeof data?.message === 'string' ? data.message : '';
    throw new Error(`${response.status} ${error}: ${message}`);
  }
  return {
    text: typeof data?.text === 'string' ? data.text : '',
    sources: Array.isArray(data?.sources)
      ? data.sources.filter((s): s is { url?: unknown; title?: unknown } => typeof s === 'object' && s !== null)
      : [],
  };
};

export const fetchLearningResources = async (
  topic: string,
  targetLanguage?: string
): Promise<LearningResource | null> => {
  let languageInstruction = `Please provide the resources primarily in English. If good resources in ${targetLanguage} are available, please include them and specify the language.`;
  let booksCategoryName = "Books";
  let articlesCategoryName = "Academic Papers or Articles";
  let videosCategoryName = "Video Lectures or Channels";

  if (targetLanguage && targetLanguage.toLowerCase().includes("bahasa indonesia")) {
    languageInstruction = `Mohon berikan sumber daya utama dalam Bahasa Indonesia. Jika sumber daya yang baik dalam bahasa Inggris juga relevan, silakan sertakan dan sebutkan bahasanya.`;
    booksCategoryName = "Buku";
    articlesCategoryName = "Artikel atau Jurnal Akademik";
    videosCategoryName = "Video Kuliah atau Saluran";
  } else if (targetLanguage && targetLanguage.toLowerCase() === "english") {
    languageInstruction = `Please provide the resources primarily in English.`;
  }


  const prompt = `
    You are an expert librarian and research assistant.
    For the topic: "${topic}".
    ${languageInstruction}

    Please generate a list of recommended learning resources based on your knowledge and information found on the web. Your response should focus ONLY on the following categories:
    - ${booksCategoryName}
    - ${articlesCategoryName}
    - ${videosCategoryName}

    For each resource you list:
    - Provide the title, author/creator (if applicable), and a brief (1-2 sentences) explanation of its relevance to learning "${topic}".

    **CRITICAL INSTRUCTIONS:**
    - Your output must be PURE Markdown text.
    - **You are strictly forbidden from including any URLs or hyperlinks.** Do not use Markdown link syntax like \`[text](url)\`. Do not write out full URLs as plain text. Your entire response will be rejected if it contains a URL.
    - Your role is ONLY to suggest the names of resources and describe them.
    - Do NOT invent or hallucinate resources. List only real, well-known, and credible books, articles, and videos.
    - Do NOT include a category for "Websites" or "Online Courses".
    - Do NOT add any conversational intro or outro. Your response must begin directly with the first Markdown heading.
    - If generating content for Bahasa Indonesia, use "kamu" instead of "Anda".
  `;

  const response = await callWithRetries(
    () => callResourcesSearch(prompt),
    `fetchLearningResources for ${topic}`
  );

  if (!response.text) {
    console.error("Failed to get content for learning resources. Full response:", response);
    return null;
  }
  const sources = response.sources
    .filter((s): s is { url: string; title: string } =>
      typeof s.url === 'string' && s.url !== '' && typeof s.title === 'string' && s.title !== '')
    .map(s => ({ web: { uri: s.url, title: s.title } }));
  return { content: response.text, sources };
};
