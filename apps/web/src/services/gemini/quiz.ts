import { GenerateContentResponse } from "@google/genai";
import {
  QuizQuestion,
  GeminiQuizQuestion,
  ExamQuestion,
  GeminiExamQuestion,
  GeminiExamResponse,
  ExamQuestionType
} from '../../types';
import { callWithRetries, getAiClient, parseGeminiJsonResponse } from './core';
import { MODEL_QUIZ_GENERATION, MODEL_QUIZ_EXPLANATION, MODEL_EXAM_QUESTIONS } from './constants';

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
      () => getAiClient('quiz').models.generateContent({
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
      () => getAiClient('quiz').models.generateContent({
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
      () => getAiClient('exam').models.generateContent({
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
