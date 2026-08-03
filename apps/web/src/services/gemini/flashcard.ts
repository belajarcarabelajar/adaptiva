import { GenerateContentResponse } from "@google/genai";
import {
  GeminiFlashcardItem,
  GeminiFlashcardResponse
} from '../../types';
import { callWithRetries, getAiClient, parseGeminiJsonResponse } from './core';
import { MODEL_FLASHCARDS } from './constants';

export type FlashcardDeck = GeminiFlashcardItem[];

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
      () => getAiClient('flashcard').models.generateContent({
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
