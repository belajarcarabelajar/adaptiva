import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { 
  GeminiCurriculumOutlineResponse, 
  GeminiModuleDetailResponse,
  GeminiSevenDayPlanResponse, 
  GeminiQuizQuestion, 
  QuizQuestion, 
  Curriculum, 
  SevenDayPlan, 
  CurriculumModule,
  ExamQuestion, 
  GeminiExamQuestion, 
  GeminiExamResponse, 
  ExamQuestionType,
  GeminiFlashcardItem,
  GeminiFlashcardResponse,
  LearningResource 
} from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set. Please ensure it's configured in your environment.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Model Constants updated to latest recommended models.
const MODEL_CURRICULUM_OUTLINE = 'gemini-2.5-flash';
const MODEL_MODULE_SUMMARY = 'gemini-2.5-pro';
const MODEL_SEVEN_DAY_PLAN = 'gemini-2.5-flash';
const MODEL_QUIZ_GENERATION = 'gemini-2.5-flash';
const MODEL_QUIZ_EXPLANATION = 'gemini-2.5-flash';
const MODEL_EXAM_QUESTIONS = 'gemini-2.5-pro';
const MODEL_FLASHCARDS = 'gemini-2.5-pro';
const MODEL_RESOURCES = 'gemini-2.5-flash';
const MODEL_CHAT = 'gemini-2.5-flash';


const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;


const callWithRetries = async <T,>(apiCallFn: () => Promise<T>, callName: string): Promise<T> => {
  let attempts = 0;
  let delay = INITIAL_DELAY_MS;
  while (attempts < MAX_RETRIES) {
    try {
      return await apiCallFn();
    } catch (error) {
      attempts++;
      console.warn(`API call "${callName}" failed on attempt ${attempts}. Error:`, error);
      if (attempts >= MAX_RETRIES) {
        console.error(`API call "${callName}" failed after ${MAX_RETRIES} attempts.`);
        throw error;
      }
      console.log(`Retrying "${callName}" in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  // This line should theoretically be unreachable due to the throw in the catch block,
  // but it's here to satisfy TypeScript's path checking if MAX_RETRIES could be 0.
  throw new Error(`API call "${callName}" failed definitively after ${MAX_RETRIES} attempts.`);
};


const parseGeminiJsonResponse = <T,>(responseText: string): T | null => {
  let originalTrimmedStr = responseText.trim();
  let currentStrToParse = originalTrimmedStr;

  try {
    return JSON.parse(currentStrToParse) as T;
  } catch (e: any) {
    console.warn(
      `Initial JSON.parse failed. Error: "${e.message || 'Unknown JSON parse error'}". Attempting fallbacks. Original text prefix (first 200 chars):`,
      currentStrToParse.substring(0, 200) + (currentStrToParse.length > 200 ? "..." : "")
    );
  }

  const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
  const match = currentStrToParse.match(fenceRegex);
  if (match && match[1]) {
    const fencedContent = match[1].trim();
    try {
      console.log("Attempting JSON.parse after markdown fence removal.");
      currentStrToParse = fencedContent; 
      return JSON.parse(currentStrToParse) as T;
    } catch (e: any) {
      console.warn(
        `JSON.parse after markdown fence removal failed. Error: "${e.message || 'Unknown JSON parse error'}". Text prefix (first 200 chars):`,
        currentStrToParse.substring(0, 200) + (currentStrToParse.length > 200 ? "..." : "")
      );
    }
  }
  
  const SPREADSHEET_JSON_PREFIX = "Default SpreadSheet Code:\n```json\n";
  if (currentStrToParse.startsWith(SPREADSHEET_JSON_PREFIX)) {
    let spreadsheetCleanedStr = currentStrToParse.substring(SPREADSHEET_JSON_PREFIX.length);
    if (spreadsheetCleanedStr.endsWith("```")) { 
        spreadsheetCleanedStr = spreadsheetCleanedStr.substring(0, spreadsheetCleanedStr.length - 3);
    }
    spreadsheetCleanedStr = spreadsheetCleanedStr.trim();
    try {
      console.log("Attempting JSON.parse after spreadsheet prefix removal.");
      currentStrToParse = spreadsheetCleanedStr; 
      return JSON.parse(currentStrToParse) as T;
    } catch (e: any) {
      console.warn(
        `JSON.parse after spreadsheet prefix removal failed. Error: "${e.message || 'Unknown JSON parse error'}". Text prefix (first 200 chars):`,
        currentStrToParse.substring(0, 200) + (currentStrToParse.length > 200 ? "..." : "")
      );
    }
  }

  if (currentStrToParse.includes('{') && currentStrToParse.includes('}')) {
    const firstBrace = currentStrToParse.indexOf('{');
    const lastBrace = currentStrToParse.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const potentialObjectJson = currentStrToParse.substring(firstBrace, lastBrace + 1);
      if (potentialObjectJson !== currentStrToParse || potentialObjectJson !== originalTrimmedStr) {
        try {
          console.log("Attempting JSON.parse on extracted object substring.");
          return JSON.parse(potentialObjectJson) as T;
        } catch (e: any) {
          console.warn(
            `JSON.parse on extracted object substring failed. Error: "${e.message || 'Unknown JSON parse error'}". Text prefix (first 200 chars):`,
            potentialObjectJson.substring(0, 200) + (potentialObjectJson.length > 200 ? "..." : "")
          );
        }
      }
    }
  }
  
  if (currentStrToParse.includes('[') && currentStrToParse.includes(']')) {
    const firstBracket = currentStrToParse.indexOf('[');
    const lastBracket = currentStrToParse.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const potentialArrayJson = currentStrToParse.substring(firstBracket, lastBracket + 1);
      if (potentialArrayJson !== currentStrToParse || potentialArrayJson !== originalTrimmedStr) {
         try {
          console.log("Attempting JSON.parse on extracted array substring.");
          return JSON.parse(potentialArrayJson) as T;
        } catch (e: any) {
          console.warn(
            `JSON.parse on extracted array substring failed. Error: "${e.message || 'Unknown JSON parse error'}". Text prefix (first 200 chars):`,
            potentialArrayJson.substring(0, 200) + (potentialArrayJson.length > 200 ? "..." : "")
          );
        }
      }
    }
  }

  console.error("All JSON parsing attempts failed for the response. Original text prefix:", originalTrimmedStr.substring(0,500) + "...");
  return null;
};

export const generateInitialCurriculumOutline = async (
  topic: string, 
  targetLanguage?: string
): Promise<Curriculum | null> => {
  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") { 
    languageInstruction = `
    The entire syllabus content and module titles should be primarily in ${targetLanguage}. 
    If the topic itself is about learning ${targetLanguage}, then the curriculum outline should be for a beginner in ${targetLanguage}.
    If the topic is something else (e.g. "Quantum Physics") and the target language is ${targetLanguage}, then provide the syllabus and module titles for "Quantum Physics" in ${targetLanguage}.
    `;
  } else if (targetLanguage) { 
     languageInstruction = `Ensure the syllabus and module titles are in English.`;
  }

  const prompt = `
    You are a professor creating a detailed curriculum syllabus.
    For the topic: "${topic}".
    ${languageInstruction}
    
    The output JSON should contain:
    1.  'syllabus': Start with Introductory A comprehensive syllabus.
    This MUST include the following sections, formatted with Markdown (e.g., ## Heading, Bullet points item):
        *   **Identitas Materi**
            *   Nama Mata Topik: ${topic}
            *   Jumlah Jam Pelajaran: (Calculate this based on the number of 'moduleTitles' you generate. Assume 1 module = 1 Jam Pelajaran (approx. 60 minutes). For example, if you generate 7 module titles, state "7 Jam Pelajaran per Minggu (@ 60 menit/modul)".)
        *   **Deskripsi Mata Pelajaran/Kuliah**
            *   Gambaran Umum Materi: (Provide a general overview of the topic.)
            *   Relevansi Mata Pelajaran/Kuliah: (Explain the relevance of studying this topic.)
            *   Manfaat yang Diharapkan: (List the expected benefits for the learner.)
        *   **Capaian Pembelajaran:**
        *   **Bahan Kajian/Materi Pokok**
            *   (List the 7 main topics or subjects that will be covered within this curriculum.)
        *   **Metode Pembelajaran**
            *   Modul Material
            *   Quiz
            *   Flashcards
            *   Tutor
            *   Exam
        *   A concluding paragraph for the syllabus.
    2.  'moduleTitles': A list of module titles. Each string in the 'moduleTitles' array must be a non-empty, meaningful title.
        - The number of module titles should be appropriate for the complexity and breadth of the topic, aiming for a comprehensive learning journey that could reasonably be introduced over 7 days of focused study (typically 5-10 modules). For example, a topic might have 7 modules for a 7-day plan, covering core aspects each day.

    CONTENT GUIDELINES for 'syllabus' and 'moduleTitles':
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis within the 'syllabus' or 'moduleTitles' strings, UNLESS it's for standard Markdown structural elements like headings (e.g., ##) or list items (e.g., - item). All other emphasis should be achieved through phrasing or context if necessary.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact and flow naturally.
    - Language Persona: If ${targetLanguage} is Bahasa Indonesia, use "kamu" instead of "Anda" for subjective address.
    - Don't halusinate, jjust stick into this prompt.

    Respond STRICTLY with a JSON object in the following format:
    {
      "syllabus": "## Identitas Materi\\n- Nama Mata Topik: ${topic}\\n- Jumlah SKS/Jam Pelajaran: [AI to fill based on number of modules generated, e.g., 7 SKS (7 Jam Pelajaran)]\\n\\n## Deskripsi Mata Pelajaran/Kuliah\\n- Gambaran Umum Materi: ...\\n- Relevansi Mata Pelajaran/Kuliah: ...\\n- Manfaat yang Diharapkan: ...\\n- Capaian Pembelajaran: \\n  - Outcome 1\\n  - Outcome 2\\n\\n## Bahan Kajian/Materi Pokok\\n- Topic 1\\n- Topic 2\\n\\n## Metode Pembelajaran\\n- Modul Material\\n- Quiz\\n- Exam\\n- Flashcards\\n- Tutor\\n\\n[Any other general syllabus text, formatted with Markdown as needed, following all guidelines.]",
      "moduleTitles": ["Module 1 Title", "Module 2 Title", "... (etc, as appropriate)"]
    }
    The entire response MUST be a single, valid JSON object. Do not include any text, explanations, or characters outside of this JSON object structure. Ensure all strings within the JSON are correctly quoted and escaped.
  `;
  
  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
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
      const validModules: CurriculumModule[] = parsedData.moduleTitles
        .map(title => typeof title === 'string' ? title.trim() : "") 
        .filter(title => title !== "") 
        .map(title => ({ title, moduleMaterial: undefined, isLoading: false, loadingError: null }));

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

export const generateModuleLectureSummary = async (
  moduleTitle: string, 
  overallTopic: string, 
  targetLanguage?: string
): Promise<{ moduleMaterial: string } | null> => {
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

# [Creative, Engaging Title for ${moduleTitle}]
*Use relevant emoji and make title inviting and specific to the module*

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
- **Bold** for key terms and important concepts (use Markdown syntax: **text**)
- *Italics* for emphasis and definitions (use Markdown syntax: *text*)
- ***Bold Italic*** = ***text***
- Use bullet points (- item) and numbered lists (1. item) appropriately.
- Write in clear, engaging paragraphs.
- If target language is Bahasa Indonesia, replace "Anda" with "kamu".
- Ensure proper Markdown syntax throughout.
- For mathematical topics, use Unicode symbols where appropriate: ÷ × ± √ ² ³ π ∞ ≤ ≥ ≠ ∑ ∏.

Rich format implementation:
**Bold Text** = **text**
*Italic Text* = *text***
***Bold Italic*** = ***text***
- Unordered List = - item
  - Nested List =   - item (with 2 spaces indent)
    - Deep Nested =     - item (with 4 spaces indent)

**Exclusions:**
- Do NOT include: assignments, reading lists, projects, or interaction suggestions.
- No #### Heading 4 (Sub-subsection)
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
      () => ai.models.generateContent({
        model: MODEL_MODULE_SUMMARY,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      }),
      `generateModuleLectureSummary for ${moduleTitle}`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiModuleDetailResponse>(rawResponseText);

    if (parsedData && typeof parsedData.moduleMaterial === 'string') {
      return { moduleMaterial: parsedData.moduleMaterial };
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

  const moduleTitlesListString = moduleTitles.map((title, index) => `Module ${index + 1}: "${title}"`).join('\n');
  
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
    - task: The main learning task for the day. This task description MUST be formatted as a Markdown bulleted list (e.g., starting lines with "- "). Each bullet point should represent a distinct sub-task or activity for the day. These sub-tasks should collectively incorporate diverse learning activities (e.g., "- Watch a 10-min video on X (visual/audio)\\n- Create a mind map of key concepts (visual/text)\\n- Attempt practice problems 1-3 (hands-on/examples)."). Ensure tasks are concise enough for a daily plan but cover key aspects from the syllabus context suitable for that day.
    - summaryFocus: This MUST be the title of the module (or modules, if combined) that the day's tasks are primarily focused on. Take this directly from the provided "Available Module Titles".

    CONTENT GUIDELINES:
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis within the 'task' or 'summaryFocus' strings, other than for actual Markdown list markers.
    - Markdown Usage: For the 'task' field, use Markdown's standard list items (starting with '-').
    - Plain Text: The 'summaryFocus' should be plain text.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact and flow naturally.
    - Emphasis: For any emphasis, use phrasing or context, not symbols.

    The entire response MUST be a single, valid JSON object. Do not include any text, explanations, or characters outside of this JSON object structure.
    **CRITICAL JSON RULE:** All string values inside the JSON MUST be valid. This means any double quote character (") within a string must be escaped with a backslash (like this: \\"). For example, if a task is "Read the chapter titled \\"Introduction\\"", it must be formatted that way in the JSON. This is the most common reason for parsing failure. Ensure all quotes are escaped.

    Respond STRICTLY with a JSON object in the following format:
    {
      "days": [
        {
          "day": 1,
          "task": "- Sub-task 1 for the day, incorporating diverse learning suggestions related to Module 1's title.\\n- Sub-task 2 for the day...",
          "summaryFocus": "Module 1 Title (taken from the provided list)"
        },
        {
          "day": 2,
          "task": "- Sub-task 1 for the day, related to Module 2's title.\\n- Sub-task 2 for the day...",
          "summaryFocus": "Module 2 Title (taken from the provided list)"
        } 
        // ... up to day 7, adapting based on the number of module titles.
      ]
    }
    Ensure the output is an array of 7 daily plans. The 'task' field must be a string containing Markdown bullet points.
    The 'summaryFocus' must be derived directly from the provided module titles.
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_SEVEN_DAY_PLAN,
        contents: prompt,
        config: { responseMimeType: "application/json" } 
      }),
      "generateSevenDayPlan"
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiSevenDayPlanResponse>(rawResponseText);

     if (parsedData && parsedData.days && parsedData.days.length === 7) { 
      return { days: parsedData.days, topic };
    }
    console.error("Failed to parse 7-day plan data from Gemini or plan is not 7 days. Full response text that failed parsing:", rawResponseText);
    return null;
  } catch (error) {
    console.error("Error generating 7-day plan (after retries):", error);
    throw error;
  }
};

export const generateQuiz = async (
  moduleTitle: string, 
  moduleMaterialContent: string, 
  targetLanguage?: string, 
  numQuestions: number = 10
): Promise<QuizQuestion[] | null> => { 
  if (!moduleMaterialContent || moduleMaterialContent.trim() === "") {
    console.warn(`Cannot generate quiz for "${moduleTitle}" because module material is empty.`);
    return null; 
  }
  
  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `
    All quiz content (questions, options, explanations) MUST be in ${targetLanguage}.
    `;
  } else if (targetLanguage) {
     languageInstruction = `Ensure all quiz content is in English.`;
  }

  const prompt = `
    You are a quiz generator. Based on the following module's comprehensive learning material (which may contain Markdown formatting for structure):
    Module Title: "${moduleTitle}"
    Module Learning Material Content: "${moduleMaterialContent}" 
    ${languageInstruction}
    Generate ${numQuestions} multiple-choice quiz questions. Each question should have 4 options and one correct answer.
    For each question, provide a comprehensive explanation for why the correct answer is right. 
    This explanation MUST:
    1. Clearly state why the chosen answer is correct.
    2. Briefly explain why the other options are incorrect, if not obvious.
    3. Be structured with at least 3 bullet points (e.g., using '*' or '-' at the start of each bullet point line) for readability. These bullet points should elaborate on the concept.
    4. The explanation should be suitable for direct display to the user immediately after they submit the quiz.

    CONTENT GUIDELINES:
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis within 'question', 'options', or 'explanation' strings, unless it's for Markdown list markers in the explanation.
    - Markdown Usage: Within the 'explanation' string, use Markdown's standard list items (starting with '-' or '*') for the bullet points.
    - Plain Text: 'question' and 'options' should be plain text.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact and flow naturally.
    - Emphasis: For any emphasis, use phrasing or context, not symbols.
    
    Respond STRICTLY with a JSON array of objects in the following format:
    [
      {
        "question": "Question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option C", 
        "explanation": "- Bullet point 1 explaining a core aspect.\\n- Bullet point 2 detailing another related concept.\\n- Bullet point 3 clarifying a common misconception or adding context."
      }
      // ... ${numQuestions-1} more questions
    ]
    The entire response MUST be a single, valid JSON array. Do not include any text, explanations, markdown formatting (beyond what's inside the explanation string for its own bullets), or any characters whatsoever outside of this JSON array structure. Ensure all strings within the JSON are correctly quoted and escaped, especially newlines within the explanation string (use \\n). There should be no extraneous characters before the opening bracket or after the final closing bracket of the array. Ensure you provide exactly ${numQuestions} questions.
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_QUIZ_GENERATION,
        contents: prompt,
        config: { responseMimeType: "application/json" } 
      }),
      `generateQuiz for ${moduleTitle}`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiQuizQuestion[]>(rawResponseText);

    if (parsedData) {
      return parsedData.map((q, index) => ({ 
        ...q, 
        id: `q-${moduleTitle.replace(/\s+/g, '-')}-${index}`,
        detailedExplanation: undefined,
        isDetailedExplanationLoading: false,
      }));
    }
    console.error("Failed to parse quiz data from Gemini. Full response text that failed parsing:", rawResponseText);
    return null;
  } catch (error) {
      console.error("Error generating quiz (after retries):", error);
      throw error;
  }
};

export const generateDetailedQuizExplanation = async (
  question: QuizQuestion, 
  moduleTitle: string, 
  moduleMaterialContent: string, 
  targetLanguage?: string
): Promise<{ detailedExplanation: string } | null> => {
  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `The detailed explanation MUST be in ${targetLanguage}.`;
  } else if (targetLanguage) {
    languageInstruction = `Ensure the detailed explanation is in English.`;
  }

  const prompt = `
    You are an expert tutor. A student has answered a quiz question and wants a more detailed explanation about the underlying concepts.
    Module Title: "${moduleTitle}"
    Original Quiz Question: "${question.question}"
    Correct Answer to the Question: "${question.correctAnswer}"
    Options Provided: ${JSON.stringify(question.options)}
    Relevant content from the module's learning material for context: 
    """
    ${moduleMaterialContent.substring(0, 1500)}... 
    """ 
    (Note: the above material might be truncated, use it for general context of the module's scope if helpful).

    ${languageInstruction}

    Provide a comprehensive and detailed explanation that goes deeper into the topic(s) related to the quiz question: "${question.question}". 
    Do not just repeat the initial explanation. Instead, expand on the concepts, explain related theories or principles, provide further examples, or clarify nuances that a beginner might miss.
    Imagine the student asked: "Can you tell me more about why '${question.correctAnswer}' is correct and the broader concepts involved here?"

    Structure your explanation clearly. You can use Markdown for formatting (headings like ## or ###, and lists using '-' or '*' or '1.'). 
    Body content should be plain text.

    CONTENT GUIDELINES:
    - Text Formatting: STRICTLY FORBIDDEN: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis within the 'detailedExplanation' string. ALL emphasis should be achieved through phrasing or context, or via standard Markdown structural elements if appropriate (e.g. headings, lists).
    - Markdown Usage: Use Markdown's standard structural elements (like '#', '##', '###' for headings, and '-' or '1.' for lists) ONLY for their intended structural purpose.
    - Plain Text: Paragraphs and general text content MUST be plain text. If something needs emphasis, rephrase or use context, DO NOT use '*' for bolding or italics.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact and flow naturally.
    - Emphasis: To reiterate, for any emphasis within plain text, use phrasing or context. ABSOLUTELY NO '*' SYMBOLS FOR BOLDING OR ITALICS. The output should be easily parsable and clean.
    
    Respond STRICTLY with a JSON object in the following format:
    {
      "detailedExplanation": "Your comprehensive, in-depth explanation here, formatted with Markdown (headings, lists, plain text body) for clarity. This should be a multi-paragraph string."
    }
    The entire response MUST be a single, valid JSON object. Ensure the Markdown is valid. No text or characters outside this JSON structure.
  `;
  
  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_QUIZ_EXPLANATION,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      }),
      `generateDetailedQuizExplanation for question "${question.question.substring(0, 20)}..."`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<{ detailedExplanation: string }>(rawResponseText);

    if (parsedData && typeof parsedData.detailedExplanation === 'string') {
      return { detailedExplanation: parsedData.detailedExplanation };
    }
    console.error("Failed to parse detailed quiz explanation from Gemini. Full response text:", rawResponseText);
    return null;
  } catch (error) {
    console.error(`Error generating detailed explanation for question "${question.question}" (after retries):`, error);
    throw error;
  }
};

export const generateExamQuestions = async (
  moduleTitle: string, 
  moduleMaterialContent: string, 
  numMC: number, 
  difficulty: number, 
  targetLanguage?: string
): Promise<ExamQuestion[] | null> => {
  if (!moduleMaterialContent || moduleMaterialContent.trim() === "") {
    console.warn(`Cannot generate exam for "${moduleTitle}" because module material is empty.`);
    return null;
  }

  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `All exam content (questions, options, explanations) MUST be in ${targetLanguage}.`;
  } else if (targetLanguage) {
    languageInstruction = `Ensure all exam content is in English.`;
  }

  const difficultyMap: {[key: number]: string} = {
    1: "very easy, suitable for a quick check of basic understanding",
    2: "easy, testing fundamental concepts",
    3: "medium, requiring some application of knowledge",
    4: "hard, challenging and requiring deeper understanding or synthesis",
    5: "very hard, expert-level questions that test nuanced understanding and critical thinking"
  };
  const difficultyDescription = difficultyMap[difficulty] || difficultyMap[3];

  const prompt = `
    You are an expert exam creator. Based on the following module's comprehensive learning material:
    Module Title: "${moduleTitle}"
    Module Learning Material Content: "${moduleMaterialContent}"
    ${languageInstruction}

    Generate an exam with ${numMC} multiple-choice questions.
    The overall difficulty for this exam should be: ${difficultyDescription} (difficulty level ${difficulty} out of 5).
    
    For EACH multiple-choice question, provide:
    1.  "type": "multiple-choice".
    2.  "questionText": The clear and unambiguous question.
    3.  "options": An array of 4 distinct string options.
    4.  "correctAnswer": The exact string of the correct option.
    5.  "explanation": A comprehensive explanation why the correct answer is right and briefly why other options are incorrect.
        The explanation MUST be structured with at least 3 bullet points (e.g., using '*' or '-' at the start of each bullet point line) for readability.
    6.  "maxPoints": Assign 1 point for each multiple-choice question.

    CONTENT GUIDELINES (apply to questionText, options, correctAnswer, explanation):
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis, unless for Markdown list markers in explanation.
    - Markdown Usage: Within the 'explanation' string, use Markdown's standard list items (starting with '-' or '*') for the bullet points.
    - Plain Text: 'questionText', 'options', 'correctAnswer' should be plain text.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact.
    - Emphasis: Use phrasing or context, not symbols like '*'.

    Respond STRICTLY with a JSON object containing a single key "questions", which is an array of question objects:
    {
      "questions": [
        {
          "type": "multiple-choice",
          "questionText": "MC Question 1 text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option C",
          "explanation": "- Bullet 1 for MC Q1.\\n- Bullet 2 for MC Q1.\\n- Bullet 3 for MC Q1.",
          "maxPoints": 1
        }
        // ... more multiple-choice questions up to the total of ${numMC}
      ]
    }
    Ensure the entire response is a single, valid JSON object. The "questions" array should contain exactly ${numMC} multiple-choice questions.
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_EXAM_QUESTIONS, 
        contents: prompt,
        config: { responseMimeType: "application/json" } 
      }),
      `generateExamQuestions for ${moduleTitle}`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiExamResponse>(rawResponseText);

    if (parsedData && parsedData.questions) {
      return parsedData.questions.map((q, index) => ({
        id: `exam-q-${moduleTitle.replace(/\s+/g, '-')}-${Date.now()}-${index}`,
        type: 'multiple-choice', 
        questionText: q.questionText,
        options: q.options, 
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: difficulty, 
        maxPoints: q.maxPoints || 1, 
        userAnswer: undefined,
        isCorrect: undefined,
        scoreAwarded: 0,
        feedbackShown: false,
        detailedExplanation: undefined,
        isDetailedExplanationLoading: false,
      }));
    }
    console.error("Failed to parse exam questions from Gemini or questions array is missing. Full response text:", rawResponseText);
    return null;
  } catch (error) {
    console.error("Error generating exam questions (after retries):", error);
    throw error;
  }
};

export const generateFlashcardsFromMaterial = async (
  moduleTitle: string,
  moduleMaterialContent: string,
  targetLanguage?: string,
  numFlashcards: number = 25
): Promise<GeminiFlashcardItem[] | null> => {
  if (!moduleMaterialContent || moduleMaterialContent.trim() === "") {
    console.warn(`Cannot generate flashcards for "${moduleTitle}" because module material is empty.`);
    return null;
  }

  let languageInstruction = "";
  if (targetLanguage && targetLanguage.toLowerCase() !== "english") {
    languageInstruction = `All flashcard content (terms and definitions) MUST be in ${targetLanguage}.`;
  } else if (targetLanguage) {
    languageInstruction = `Ensure all flashcard content is in English.`;
  }

  const prompt = `
    You are a flashcard generator. Based on the following module's comprehensive learning material:
    Module Title: "${moduleTitle}"
    Module Learning Material Content: "${moduleMaterialContent}"
    ${languageInstruction}

    Generate approximately ${numFlashcards} flashcards. Each flashcard should consist of a "term" (a key concept, vocabulary word, or short question) and a "definition" (a concise explanation, answer, or translation).
    Focus on the most important terms, concepts, and facts presented in the material.
    Terms should be relatively short. Definitions should be concise but informative.

    CONTENT GUIDELINES:
    - Text Formatting: Do NOT use raw '*' or '#' characters for bolding, italics, or any decorative emphasis within 'term' or 'definition' strings.
    - Plain Text: 'term' and 'definition' should be plain text.
    - Line Breaks: Avoid unnecessary blank lines. Content should be compact.
    - Emphasis: For any emphasis, use phrasing or context, not symbols like '*'.

    Respond STRICTLY with a JSON object containing a single key "flashcards", which is an array of flashcard objects:
    {
      "flashcards": [
        {
          "term": "Example Term 1",
          "definition": "Concise definition for Term 1."
        },
        {
          "term": "Example Term 2",
          "definition": "Concise definition for Term 2."
        }
        // ... more flashcards
      ]
    }
    Ensure the entire response is a single, valid JSON object. The "flashcards" array should contain approximately ${numFlashcards} items.
  `;

  try {
    const response = await callWithRetries<GenerateContentResponse>(
      () => ai.models.generateContent({
        model: MODEL_FLASHCARDS, 
        contents: prompt,
        config: { responseMimeType: "application/json" } 
      }),
      `generateFlashcards for ${moduleTitle}`
    );
    const rawResponseText = response.text;
    const parsedData = parseGeminiJsonResponse<GeminiFlashcardResponse>(rawResponseText);

    if (parsedData && parsedData.flashcards) {
      return parsedData.flashcards;
    }
    console.error("Failed to parse flashcards from Gemini or flashcards array is missing. Full response text:", rawResponseText);
    return null;
  } catch (error) {
    console.error("Error generating flashcards (after retries):", error);
    throw error;
  }
};


export const startChatSession = (
  topic: string, 
  targetLanguage?: string
): Chat => {
  let systemInstructionContent = `You are a helpful and patient personal tutor, an expert professor in the topic of "${topic}". Explain concepts clearly, provide examples, and encourage learning. Be concise and friendly. Use Markdown lists or plain text. Ensure there are no unnecessary blank lines in your output. Content should be compact and flow naturally without extra empty lines between paragraphs or list items unless specifically required for distinct separation by Markdown structure. IMPORTANT: Ensure that your responses do NOT contain raw '*' or '#' characters used for bolding, italics, or decorative purposes. Use these characters only for their standard Markdown structural use (like actual list items or headings). All other text should be plain. Prefer plain text for emphasis if not using a structural Markdown element.`;
  
  const langName = targetLanguage || "English"; 

  if (langName.toLowerCase().includes("bahasa indonesia")) {
    systemInstructionContent = `Kamu adalah tutor pribadi yang sabar dan membantu, seorang profesor ahli dalam topik "${topic}". Jelaskan konsep dengan jelas, berikan contoh, dan dorong pembelajaran. Bersikaplah ringkas dan ramah. Sesi ini akan berlangsung dalam Bahasa Indonesia. Gunakan daftar Markdown atau teks biasa. Pastikan tidak ada baris kosong yang tidak perlu dalam output kamu. Konten harus ringkas dan mengalir secara alami. PENTING: Pastikan respons kamu TIDAK mengandung karakter '*' atau '#' mentah yang digunakan untuk penebalan, miring, atau tujuan dekoratif. Gunakan karakter ini hanya untuk penggunaan struktural Markdown standar mereka (seperti item daftar atau judul). Semua teks lain harus polos. Utamakan teks biasa untuk penekanan jika tidak menggunakan elemen Markdown struktural.`;
  } else if (langName.toLowerCase() !== "english") {
    systemInstructionContent = `You are a helpful and patient personal tutor, an expert professor in the topic of "${topic}". 
    Please conduct the tutoring session primarily in ${langName}. 
    If the main topic is learning ${langName} itself, then act as a language tutor for ${langName}. 
    If the topic is something else (e.g. "Quantum Physics") and the target language is ${langName}, then explain "Quantum Physics" in ${langName}.
    Explain concepts clearly, provide examples, and encourage learning. Be concise and friendly. Use Markdown lists or plain text. Ensure there are no unnecessary blank lines in your output. Content should be compact and flow naturally. IMPORTANT: Ensure that your responses do NOT contain raw '*' or '#' characters used for bolding, italics, or decorative purposes. Use these characters only for their standard Markdown structural use (like actual list items or headings). All other text should be plain. Prefer plain text for emphasis if not using a structural Markdown element.`;
  }
  
  const chatConfig = {
    model: MODEL_CHAT,
    config: {
      systemInstruction: systemInstructionContent,
    },
  };

  const chat = ai.chats.create(chatConfig);
  return chat;
};

export const sendMessageToTutorStream = async (
    chat: Chat, 
    message: string, 
    onChunk: (chunkText: string) => void
  ): Promise<void> => {
  
  try {
    const responseStream = await chat.sendMessageStream({ message });
    for await (const chunk of responseStream) {
      onChunk(chunk.text);
    }
  } catch (error) {
    console.error("Error sending streaming message to tutor:", error);
    onChunk("I'm sorry, I encountered an error trying to respond. Please try again.");
  }
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
  } catch (error) {
    console.error(`Error fetching learning resources for topic "${topic}" (after retries):`, error);
    throw error; 
  }
};