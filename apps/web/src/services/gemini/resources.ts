import { GenerateContentResponse } from "@google/genai";
import { LearningResource } from '../../types';
import { callWithRetries, getAiClient, ai } from './core';
import { MODEL_RESOURCES } from './constants';

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
    - Your role is ONLY to suggest the names of resources and describe them. The application will handle finding and displaying verified web links separately from Google Search.
    - Do NOT invent or hallucinate resources. List only real, well-known, and credible books, articles, and videos.
    - Do NOT include a category for "Websites" or "Online Courses".
    - Do NOT add any conversational intro or outro. Your response must begin directly with the first Markdown heading.
    - If generating content for Bahasa Indonesia, use "kamu" instead of "Anda".
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_RESOURCES,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      `fetchLearningResources for ${topic}`
    );

    const content = response.text;
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(chunk => chunk.web && chunk.web.uri && chunk.web.title)
      .map(chunk => ({ web: { uri: chunk.web!.uri!, title: chunk.web!.title! } })) || [];

    if (content) {
      return { content, sources };
    }
    console.error("Failed to get content for learning resources from Gemini. Full response:", response);
    return null;
  } catch (firstError) {
    console.warn(`Search-grounded fetchLearningResources for "${topic}" failed. Retrying without search tool...`, firstError);
    // Fallback: Try generating resources without the googleSearch tool in case grounding service is failing
    try {
      const fallbackResponse = await callWithRetries<GenerateContentResponse>(
        () => ai.models.generateContent({
          model: MODEL_RESOURCES,
          contents: prompt,
        }),
        `fetchLearningResources (fallback) for ${topic}`
      );
      const content = fallbackResponse.text;
      if (content) {
        return { content, sources: [] };
      }
      return null;
    } catch (fallbackError) {
      console.error(`Error fetching learning resources for topic "${topic}" (both primary & fallback failed):`, fallbackError);
      throw fallbackError;
    }
  }
};