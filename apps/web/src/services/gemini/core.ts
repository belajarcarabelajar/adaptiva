import { GoogleGenAI } from "@google/genai";

// Use the proxy configured in vite.config.ts to avoid exposing the API key on the client side.
const proxyBaseUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/gemini`
    : "http://localhost:3000/api/gemini";

export const getAiClient = (actionName = "default") => {
  return new GoogleGenAI({
    apiKey: "proxy_key", // Dummy key; actual key is attached by the Vite proxy
    httpOptions: {
      baseUrl: proxyBaseUrl,
      headers: { "x-adaptiva-action": actionName } as Record<string, string>,
    },
  });
};

export const ai = getAiClient("default");

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

export const callWithRetries = async <T>(
  apiCallFn: () => Promise<T>,
  callName: string,
): Promise<T> => {
  let attempts = 0;
  let delay = INITIAL_DELAY_MS;
  while (attempts < MAX_RETRIES) {
    try {
      return await apiCallFn();
    } catch (error) {
      const errStr = String(error);

      // Auth errors — do not retry
      if (
        errStr.includes("401") ||
        errStr.toLowerCase().includes("unauthorized")
      ) {
        throw new Error("unauthorized: Sign in required to use AI features.");
      }

      // Insufficient points — do not retry
      if (errStr.includes("429") || errStr.includes("insufficient_points")) {
        throw new Error(
          "insufficient_points: Poin Anda tidak cukup untuk melakukan aksi ini.",
        );
      }

      // AI generation failed (HTTP 4xx/5xx from upstream) — proxy already refunded points
      if (errStr.includes("ai_generation_failed")) {
        const msgMatch = errStr.match(/ai_generation_failed[:\s]+(.+)/i);
        throw new Error(
          `ai_generation_failed: ${msgMatch?.[1] ?? "Layanan AI mengalami kendala. Poin Anda telah dikembalikan."}`,
        );
      }

      // AI content blocked by safety filter — proxy already refunded points
      if (errStr.includes("ai_generation_blocked")) {
        const msgMatch = errStr.match(/ai_generation_blocked[:\s]+(.+)/i);
        throw new Error(
          `ai_generation_blocked: ${msgMatch?.[1] ?? "Konten tidak dapat dibuat oleh AI. Poin Anda telah dikembalikan."}`,
        );
      }

      // Network error reaching AI upstream — proxy already refunded points
      if (errStr.includes("ai_upstream_network_error")) {
        throw new Error(
          "ai_upstream_network_error: Gagal terhubung ke layanan AI. Poin Anda telah dikembalikan.",
        );
      }

      attempts++;
      console.warn(
        `API call "${callName}" failed on attempt ${attempts}. Error:`,
        error,
      );
      if (attempts >= MAX_RETRIES) {
        console.error(
          `API call "${callName}" failed after ${MAX_RETRIES} attempts.`,
        );
        throw error;
      }
      console.log(`Retrying "${callName}" in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error(
    `API call "${callName}" failed definitively after ${MAX_RETRIES} attempts.`,
  );
};

export const cleanAiOutput = (text: string): string => {
  if (!text) return text;
  let cleaned = text;
  // Replace em dashes (— / – / --) with a comma or a period
  cleaned = cleaned.replace(/\s*[\u2014\u2013]\s*/g, ", ");
  cleaned = cleaned.replace(/\s+--\s+/g, ", ");

  // Strip all emoji pictograms
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, "");

  // Clean raw bold/italic asterisks while keeping markdown structure
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, "$1");
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "$1");
  cleaned = cleaned.replace(
    /(^|\s)\*(?!\s|\*)(.+?)(?<!\s|\*)\*(?=\s|$)/g,
    "$1$2",
  );
  cleaned = cleaned.replace(/\*\*/g, "");

  return cleaned.trim();
};

// Recursive helper to clean strings in parsed JSON objects
const cleanParsedObject = <T>(obj: T): T => {
  if (typeof obj === "string") {
    return cleanAiOutput(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanParsedObject) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const cleanedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      cleanedObj[key] = cleanParsedObject(value);
    }
    return cleanedObj as unknown as T;
  }
  return obj;
};

const sanitizeJsonString = (str: string): string => {
  // 1. Remove trailing commas before closing object/array delimiters
  const clean = str.replace(/,\s*([}\]])/g, "$1");

  // 2. Escape literal control characters inside double-quoted JSON string values
  return clean.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    // Fast path: if no unescaped control characters exist, return the match as is
    if (!/[\x00-\x1F]/.test(match)) {
      return match;
    }
    // Escape unescaped literal control characters
    return match.replace(/[\x00-\x1F]/g, (ch) => {
      switch (ch) {
        case "\n":
          return "\\n";
        case "\r":
          return "\\r";
        case "\t":
          return "\\t";
        default:
          return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
      }
    });
  });
};

const tryParseCandidate = <T>(candidate: string): T | null => {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      return JSON.parse(sanitizeJsonString(candidate)) as T;
    } catch {
      return null;
    }
  }
};

export const parseGeminiJsonResponse = <T>(responseText?: string): T | null => {
  if (!responseText) return null;
  const originalTrimmedStr = responseText.trim();

  // Attempt 1: Direct or sanitized parse on full text
  let parsed = tryParseCandidate<T>(originalTrimmedStr);
  if (parsed) return cleanParsedObject(parsed);

  // Attempt 2: Extract content from markdown fences (```json ... ``` or ``` ... ```)
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const match = originalTrimmedStr.match(fenceRegex);
  if (match && match[1]) {
    parsed = tryParseCandidate<T>(match[1].trim());
    if (parsed) return cleanParsedObject(parsed);
  }

  // Attempt 3: Spreadsheet prefix removal
  const SPREADSHEET_JSON_PREFIX = "Default SpreadSheet Code:\n```json\n";
  if (originalTrimmedStr.startsWith(SPREADSHEET_JSON_PREFIX)) {
    let spreadsheetCleanedStr = originalTrimmedStr.substring(
      SPREADSHEET_JSON_PREFIX.length,
    );
    if (spreadsheetCleanedStr.endsWith("```")) {
      spreadsheetCleanedStr = spreadsheetCleanedStr.substring(
        0,
        spreadsheetCleanedStr.length - 3,
      );
    }
    parsed = tryParseCandidate<T>(spreadsheetCleanedStr.trim());
    if (parsed) return cleanParsedObject(parsed);
  }

  // Attempt 4: Extract JSON object substring { ... }
  if (originalTrimmedStr.includes("{") && originalTrimmedStr.includes("}")) {
    const firstBrace = originalTrimmedStr.indexOf("{");
    const lastBrace = originalTrimmedStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const potentialObjectJson = originalTrimmedStr.substring(
        firstBrace,
        lastBrace + 1,
      );
      parsed = tryParseCandidate<T>(potentialObjectJson);
      if (parsed) return cleanParsedObject(parsed);
    }
  }

  // Attempt 5: Extract JSON array substring [ ... ]
  if (originalTrimmedStr.includes("[") && originalTrimmedStr.includes("]")) {
    const firstBracket = originalTrimmedStr.indexOf("[");
    const lastBracket = originalTrimmedStr.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const potentialArrayJson = originalTrimmedStr.substring(
        firstBracket,
        lastBracket + 1,
      );
      parsed = tryParseCandidate<T>(potentialArrayJson);
      if (parsed) return cleanParsedObject(parsed);
    }
  }

  console.error(
    "All JSON parsing attempts failed for the response. Original text prefix:",
    originalTrimmedStr.substring(0, 500) + "...",
  );
  return null;
};

export const cleanModuleTitle = (title: string): string => {
  if (!title) return "";
  let cleaned = title.trim();
  // First strip surrounding quotes or markdown asterisks
  cleaned = cleaned.replace(/^["'*]+|["'*]+$/g, "").trim();
  // Strip redundant raw prefixes like "Modul 1:", "Module 1:", "1. ", "Day 1:" ONLY if followed by remaining title text
  const match =
    cleaned.match(/^(?:modul|module|day|hari)\s*\d+[\s.:-]+\s*(.+)/i) ||
    cleaned.match(/^\d+[\s.:-]+\s*(.+)/i);
  if (match && match[1] && match[1].trim()) {
    cleaned = match[1].trim();
  }
  cleaned = cleaned.replace(/^["'*]+|["'*]+$/g, "").trim();
  cleaned = cleaned.replace(/\s*[:;-]+$/, "");
  return cleanAiOutput(cleaned);
};
