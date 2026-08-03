import { Chat } from "@google/genai";
import { getAiClient, cleanAiOutput } from './core';
import { MODEL_CHAT } from './constants';

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

  const chat = getAiClient('tutor').chats.create(chatConfig);
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
      if (chunk.text) {
        onChunk(cleanAiOutput(chunk.text));
      }
    }
  } catch (error) {
    console.error("Error sending streaming message to tutor:", error);
    onChunk("I'm sorry, I encountered an error trying to respond. Please try again.");
  }
};
