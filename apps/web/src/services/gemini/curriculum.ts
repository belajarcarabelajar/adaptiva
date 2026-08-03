import { GenerateContentResponse } from "@google/genai";
import {
  Curriculum,
  CurriculumModule,
  GeminiCurriculumOutlineResponse,
  GeminiModuleDetailResponse,
  GeminiSevenDayPlanResponse,
  SevenDayPlan
} from '../../types';
import { callWithRetries, getAiClient, parseGeminiJsonResponse, cleanModuleTitle } from './core';
import { MODEL_CURRICULUM_OUTLINE, MODEL_MODULE_SUMMARY, MODEL_SEVEN_DAY_PLAN } from './constants';

export const generateInitialCurriculumOutline = async (
  topic: string,
  targetLanguage?: string
): Promise<Curriculum | null> => {
  const isIndonesian = Boolean(targetLanguage && (
    targetLanguage.toLowerCase().includes("indonesia") ||
    targetLanguage.toLowerCase().includes("indonesian")
  ));
  const isEnglish = !targetLanguage || targetLanguage.toLowerCase() === "english";
  const langName = targetLanguage && targetLanguage.trim() !== "" ? targetLanguage : "English";

  let languageInstruction = "";
  let syllabusHeadersExample = "";

  if (isIndonesian) {
    languageInstruction = `
    Seluruh isi silabus dan judul modul HARUS dalam Bahasa Indonesia yang alami, ramah, dan profesional.
    Gunakan "kamu" untuk menyapa pembelajar secara ramah.
    JANGAN menerjemahkan istilah teknis universal secara kaku jika istilah aslinya lebih umum digunakan di industri/akademik.
    `;
    syllabusHeadersExample = `
        *   **Identitas Materi**
            *   Nama Mata Topik: ${topic}
            *   Jumlah Jam Pelajaran: (Contoh: 7 Jam Pelajaran (@ 60 menit/modul))
        *   **Deskripsi Mata Pelajaran/Kuliah**
            *   Gambaran Umum Materi: ...
            *   Relevansi Mata Pelajaran/Kuliah: ...
            *   Manfaat yang Diharapkan: ...
        *   **Capaian Pembelajaran**
        *   **Bahan Kajian/Materi Pokok**
        *   **Metode Pembelajaran**
    `;
  } else if (!isEnglish) {
    languageInstruction = `
    The entire syllabus content and module titles MUST be primarily in ${langName}.
    Ensure titles and content are fluent, natural, and accurate for native learners of ${langName}.
    `;
    syllabusHeadersExample = `
        *   **Course Identity**
            *   Topic Name: ${topic}
            *   Estimated Learning Duration: (e.g. 7 Lessons (@ 60 mins/module))
        *   **Course Description**
            *   Overview: ...
            *   Relevance: ...
            *   Expected Benefits: ...
        *   **Learning Outcomes**
        *   **Core Topics / Subjects**
        *   **Learning Methods**
    `;
  } else {
    languageInstruction = `Ensure the syllabus and module titles are in English.`;
    syllabusHeadersExample = `
        *   **Course Identity**
            *   Topic Name: ${topic}
            *   Estimated Learning Duration: (e.g. 7 Lessons (@ 60 mins/module))
        *   **Course Description**
            *   Overview: ...
            *   Relevance: ...
            *   Expected Benefits: ...
        *   **Learning Outcomes**
        *   **Core Topics / Subjects**
        *   **Learning Methods**
    `;
  }

  const prompt = `
    You are a distinguished university professor creating a detailed curriculum syllabus for: "${topic}".
    ${languageInstruction}

    The output JSON should contain:
    1. 'syllabus': A comprehensive syllabus formatted with standard Markdown headings and lists:
    ${syllabusHeadersExample}
    2. 'moduleTitles': A list of module titles (typically 5-10 modules for a structured study journey).
       CRITICAL RULE FOR 'moduleTitles': Do NOT prefix titles with "Module 1:", "Modul 1:", or numbers. Provide only clean, descriptive, engaging titles directly in ${langName} (e.g. ["Pengenalan Dasar Sistem", "Teori Dasar dan Aplikasi"]).

    Respond STRICTLY with a single, valid JSON object in the following format:
    {
      "syllabus": "Markdown formatted syllabus string...",
      "moduleTitles": ["Title 1", "Title 2", "..."]
    }
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => getAiClient('curriculum').models.generateContent({
        model: MODEL_CURRICULUM_OUTLINE,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      }),
      "generateInitialCurriculumOutline"
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiCurriculumOutlineResponse>(rawResponseText);

    if (parsedData && parsedData.moduleTitles && parsedData.syllabus) {
      const originalTitlesCount = parsedData.moduleTitles.length;
      const validModules: CurriculumModule[] = parsedData.moduleTitles.reduce<CurriculumModule[]>((acc, title) => {
        if (typeof title === 'string') {
          const cleanedTitle = cleanModuleTitle(title);
          if (cleanedTitle !== "") {
            acc.push({ title: cleanedTitle, moduleMaterial: undefined, isLoading: false, loadingError: null });
          }
        }
        return acc;
      }, []);

      if (originalTitlesCount > 0 && validModules.length === 0) {
        console.warn("All module titles received from Gemini were empty or whitespace after trimming. Curriculum may be incomplete or unusable for module generation.");
      } else if (validModules.length < originalTitlesCount) {
        console.warn(`Filtered out ${originalTitlesCount - validModules.length} empty or whitespace-only module titles.`);
      }

      return { topic, syllabus: parsedData.syllabus, modules: validModules };
    }
    console.error("Failed to parse initial curriculum outline from Gemini. Full response text:", rawResponseText);
    return null;
  } catch (error) {
    console.error("Error generating initial curriculum outline (after retries):", error);
    throw error;
  }
};

// Simple LRU Cache for module summaries to prevent redundant API calls
const moduleSummaryCache = new Map<string, { moduleMaterial: string }>();
const MAX_CACHE_SIZE = 50;

export const generateModuleLectureSummary = async (
  moduleTitle: string,
  overallTopic: string,
  targetLanguage?: string
): Promise<{ moduleMaterial: string } | null> => {
  const cacheKey = `${overallTopic}|${moduleTitle}|${targetLanguage || 'English'}`;
  if (moduleSummaryCache.has(cacheKey)) {
    // Move to end to mark as recently used
    const cachedResult = moduleSummaryCache.get(cacheKey)!;
    moduleSummaryCache.delete(cacheKey);
    moduleSummaryCache.set(cacheKey, cachedResult);
    return cachedResult;
  }

  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `
    The comprehensive module material MUST be in ${targetLanguage}.
    If the overall topic is about learning ${targetLanguage}, ensure the material aligns with that.
    If the overall topic is something else, explain this module's content (related to "${overallTopic}") in ${targetLanguage}.
    `;
  } else if (targetLanguage) {
    languageInstruction = `Ensure the comprehensive module material is in English.`;
  }

  const prompt = `
You are an expert professor in creating comprehensive learning materials. Generate in-depth educational content that explains concepts thoroughly, as if teaching directly to students.

**Context:**
- Overall Topic: "${overallTopic}"
- Module Title: "${moduleTitle}"
${languageInstruction}

**Content Requirements:**
Create detailed learning material, structured as a comprehensive textbook chapter. This should be substantive educational content, not a brief summary.

**Required Structure (use exact Markdown formatting):**

# [Clean, Engaging Title for ${moduleTitle}]

## Provide clear context within ${overallTopic}. This is the main content section - make it comprehensive. The section should consist of:
- Explain why this knowledge matters (in paragraph)
- Define all key terms and concepts thoroughly (in points)
- Break down all major theories, principles, and any other relevant components + explanation example
- Use ### subheadings to organize complex topics (in paragraph or in points)
- Explain each concept with detailed paragraphs + example (in paragraph)
- Include step-by-step processes where applicable (in points)
- Provide multiple concrete examples and case studies (in paragraph) and their connections to other fields
- Show practical applications and benefits (Connect theory to practice in bullet point)
- Conclusion (in paragraph)

**Formatting Standards:**
- ABSOLUTELY NO EMOJIS. Do NOT use any emojis or pictographs anywhere in titles, headings, or content.
- ABSOLUTELY NO ASTERISKS ('*'). Do NOT use double asterisks (**text**) or single asterisks (*text*) for bolding or italics. Express emphasis through clear phrasing and context alone. Paragraphs MUST be plain text.
- Use Markdown's structural elements (like '#', '##', '###' for headings, and '-' for lists) ONLY for their intended structural purpose.
- Write in clear, engaging, professional text.
- If target language is Bahasa Indonesia, use "kamu" to address the learner.
- Do NOT use em dashes ('—' or '--'). Instead, use a comma or a period as an alternative.
- For mathematical expressions, formulas, and calculations, use standard LaTeX syntax (e.g. $inline$ or $$display$$).

**Exclusions:**
- Do NOT include: assignments, reading lists, projects, or interaction suggestions.
- Don't give the output in table format.

**Output Format:**
Respond with valid JSON only:

{
  "moduleMaterial": "[Complete Markdown-formatted learning material following all above requirements. Ensure proper escaping of quotes and newlines for valid JSON.]"
}

The material should be comprehensive enough for thorough understanding of ${moduleTitle} within the context of ${overallTopic}.
`;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => getAiClient('module').models.generateContent({
        model: MODEL_MODULE_SUMMARY,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      }),
      `generateModuleLectureSummary for ${moduleTitle}`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiModuleDetailResponse>(rawResponseText);

    if (parsedData && typeof parsedData.moduleMaterial === 'string') {
      const result = { moduleMaterial: parsedData.moduleMaterial };

      moduleSummaryCache.set(cacheKey, result);
      if (moduleSummaryCache.size > MAX_CACHE_SIZE) {
        // Remove the oldest entry (first item in the Map)
        const firstKey = moduleSummaryCache.keys().next().value;
        if (firstKey) {
            moduleSummaryCache.delete(firstKey);
        }
      }

      return result;
    }
    console.error("Failed to parse module material from Gemini. Full response text:", rawResponseText);
    return null;
  } catch (error) {
    console.error(`Error generating module material for module "${moduleTitle}" (after retries):`, error);
    throw error;
  }
};


export const generateSevenDayPlan = async (
  topic: string,
  syllabusContent: string,
  moduleTitles: string[],
  targetLanguage?: string
): Promise<SevenDayPlan | null> => {
  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `
    The learning plan, including all tasks and summaries, should be presented primarily in ${targetLanguage}.
    If the topic is about learning ${targetLanguage}, the plan should guide a beginner through learning ${targetLanguage}.
    If the topic is something else, the plan to learn that topic should be delivered in ${targetLanguage}.
    `;
  } else if (targetLanguage) {
     languageInstruction = `Ensure all content is in English.`;
  }

  const moduleTitlesListString = moduleTitles.map((title, index) => `${index + 1}. "${cleanModuleTitle(title)}"`).join('\n');

  const prompt = `
    Create a step-by-step 7-day accelerated learning program for the topic: "${topic}".
    This plan should be synchronized with the following overall syllabus content to ensure relevance and logical progression:
    Syllabus Context: "${syllabusContent}"

    The curriculum has the following module titles. Use these module titles as the primary focus for each corresponding day in the 7-day plan.
    For example, Day 1 should focus on Module 1's title, Day 2 on Module 2's title, and so on.
    Available Module Titles:
    ${moduleTitlesListString}

    If there are more than 7 modules, focus the 7-day plan on the first 7 modules.
    If there are fewer than 7 modules, distribute the focus of these modules across the 7 days, perhaps dedicating more than one day to more complex modules or allowing for review/project days. Ensure each day still has a clear focus drawn from these module titles. The 'summaryFocus' for each day should directly reflect the title of the module(s) it is primarily covering.
    Do NOT prefix 'summaryFocus' with "Module 1:" or "Modul 1:".

    Assume the user is a complete beginner.
    The program should use active recall, spaced repetition, and real-world practice.
    ${languageInstruction}

    Crucially, each day's task should incorporate activities that appeal to a variety of learning styles:
    - Visual: Suggest diagrams, mind maps, or relevant videos.
    - Audio: Recommend podcasts, audio summaries, or verbalizing concepts.
    - Text: Include reading, writing summaries, or note-taking.
    - Hands-on: Propose practical exercises, coding, building, or experiments.
    - Examples: Use case studies, worked problems, or real-world applications.

    For each day, provide:
    - day: The day number (1-7).
    - task: The main learning task for the day formatted as a Markdown bulleted list.
    - summaryFocus: The clean title of the module(s) that the day's tasks cover.

    CONTENT GUIDELINES:
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis.
    - Markdown Usage: For the 'task' field, use Markdown's standard list items (starting with '-').
    - Plain Text: The 'summaryFocus' should be plain text without prefixes.
    - Do NOT use em dashes ('—' or '--'). Instead, use a comma or a period as an alternative.

    Respond STRICTLY with a single, valid JSON object in the following format:
    {
      "days": [
        {
          "day": 1,
          "task": "- Sub-task 1 for the day...\\n- Sub-task 2...",
          "summaryFocus": "Clean Title of Module 1"
        }
      ]
    }
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => getAiClient('curriculum').models.generateContent({
        model: MODEL_SEVEN_DAY_PLAN,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      }),
      "generateSevenDayPlan"
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiSevenDayPlanResponse>(rawResponseText);

    if (parsedData && parsedData.days && parsedData.days.length === 7) {
      const cleanedDays = parsedData.days.map(d => ({
        ...d,
        summaryFocus: cleanModuleTitle(d.summaryFocus)
      }));
      return { days: cleanedDays, topic };
    }
    console.error("Failed to parse 7-day plan data from Gemini or plan is not 7 days. Full response text that failed parsing:", rawResponseText);
    return null;
  } catch (error) {
    console.error("Error generating 7-day plan (after retries):", error);
    throw error;
  }
};
