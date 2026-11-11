import { cleanAiOutput } from './core';
import type { TutorChat } from '../../types';

const aiTaskUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/ai` : 'http://localhost:3000/api/ai';

// The server rejects more than 40 turns and requires the first one to be a user turn.
const MAX_TURNS = 40;

const APOLOGY = "I'm sorry, I encountered an error trying to respond. Please try again.";

export const startChatSession = (
  topic: string,
  targetLanguage?: string
): TutorChat => {
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

  return { system: systemInstructionContent, history: [] };
};

const capTurns = (messages: TutorChat['history']): TutorChat['history'] => {
  if (messages.length <= MAX_TURNS) return messages;
  const kept = messages.slice(-MAX_TURNS);
  return kept[0].role === 'user' ? kept : kept.slice(1);
};

type TutorFrame = { type?: unknown; text?: unknown };

export const sendMessageToTutorStream = async (
    chat: TutorChat,
    message: string,
    onChunk: (chunkText: string) => void
  ): Promise<void> => {

  try {
    const response = await fetch(aiTaskUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'tutor.chat',
        system: chat.system,
        messages: capTurns([...chat.history, { role: 'user', content: message }]),
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`tutor.chat failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    let emitted = '';
    let finished = false;

    // cleanAiOutput trims, so cleaning each small delta on its own would drop the
    // spaces between words; clean the whole reply so far and emit only the new tail.
    const emitCleaned = () => {
      const cleaned = cleanAiOutput(reply);
      if (!cleaned.startsWith(emitted)) return;
      const tail = cleaned.slice(emitted.length);
      if (tail) onChunk(tail);
      emitted = cleaned;
    };

    const handleFrame = (rawFrame: string) => {
      const data = rawFrame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) return;
      const parsed = JSON.parse(data) as TutorFrame;
      if (parsed.type === 'delta' && typeof parsed.text === 'string' && parsed.text) {
        reply += parsed.text;
        emitCleaned();
      } else if (parsed.type === 'done') {
        emitCleaned();
        finished = true;
      } else if (parsed.type === 'error') {
        throw new Error(`tutor.chat stream error: ${data}`);
      }
    };

    while (!finished) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1 && !finished) {
        handleFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      if (done) {
        buffer += decoder.decode();
        if (!finished && buffer.trim()) handleFrame(buffer);
        break;
      }
    }
    if (!finished) {
      throw new Error('tutor.chat stream ended without a done frame');
    }

    chat.history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
  } catch (error) {
    console.error("Error sending streaming message to tutor:", error);
    onChunk(APOLOGY);
  }
};
