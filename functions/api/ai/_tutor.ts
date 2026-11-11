import Anthropic from "@anthropic-ai/sdk";

export type TutorMessage = { role: "user" | "assistant"; content: string };
export type TutorBody = { system: string; messages: TutorMessage[] };
export type TutorRunResult = { stopReason: string | null; refusalCategory: string | null };

const MAX_TURNS = 40;
const MAX_CONTENT_CHARS = 8000;

export function validateTutorBody(body: unknown): TutorBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { system, messages } = body as { system?: unknown; messages?: unknown };
  if (typeof system !== "string" || system.length === 0) return null;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_TURNS) return null;

  const turns: TutorMessage[] = [];
  for (const turn of messages) {
    if (!turn || typeof turn !== "object") return null;
    const { role, content } = turn as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_CONTENT_CHARS) {
      return null;
    }
    turns.push({ role, content });
  }
  if (turns[turns.length - 1].role !== "user") return null;
  return { system, messages: turns };
}

export async function streamTutorText(opts: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  model: string;
  effort: "low" | "medium";
  maxTokens: number;
  system: string;
  messages: TutorMessage[];
  onDelta: (text: string) => void;
}): Promise<TutorRunResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, fetch: opts.fetchImpl });
  // Haiku 5.5 takes no server fallback, temperature or thinking:disabled (each is a 400).
  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
    output_config: { effort: opts.effort },
  });
  stream.on("text", (text) => opts.onDelta(text));
  const message = await stream.finalMessage();
  const details = (message as { stop_details?: { category?: string | null } | null }).stop_details;
  return { stopReason: message.stop_reason ?? null, refusalCategory: details?.category ?? null };
}

export function createTutorSseResponse(
  run: (onDelta: (t: string) => void) => Promise<TutorRunResult>,
  hooks: {
    onErrorBeforeOutput: (err: unknown) => Promise<{ error: string; message: string }>;
    onRefusalBeforeOutput?: (category: string | null) => Promise<{ error: string; message: string }>;
    headers?: HeadersInit;
  },
): Response {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let started = false;
  let chain: Promise<void> = Promise.resolve();

  const send = (frame: Record<string, unknown>) => {
    const bytes = encoder.encode(`data: ${JSON.stringify(frame)}\n\n`);
    chain = chain.then(() => writer.write(bytes)).catch(() => {});
    return chain;
  };

  void (async () => {
    try {
      const result = await run((text) => {
        if (!text) return;
        started = true;
        void send({ type: "delta", text });
      });
      if (result.stopReason === "refusal") {
        const category = result.refusalCategory ?? "unknown";
        let payload = {
          error: "ai_generation_blocked",
          message: `Permintaan ditolak oleh filter keamanan AI (kategori: ${category}).`,
        };
        if (!started && hooks.onRefusalBeforeOutput) {
          try {
            payload = await hooks.onRefusalBeforeOutput(result.refusalCategory);
          } catch {
            // Keep the plain blocked frame; the stream must still close cleanly.
          }
        }
        await send({ type: "error", error: payload.error, message: payload.message });
      } else {
        await send({ type: "done" });
      }
    } catch (err) {
      if (started) {
        // Output was already billed, so there is no refund hook here.
        await send({ type: "error", error: "ai_generation_failed", message: "Respons AI terputus." });
      } else {
        let payload: { error: string; message: string };
        try {
          payload = await hooks.onErrorBeforeOutput(err);
        } catch {
          payload = { error: "ai_generation_failed", message: "Respons AI gagal." };
        }
        await send({ type: "error", error: payload.error, message: payload.message });
      }
    } finally {
      await chain;
      await writer.close().catch(() => {});
    }
  })();

  const headers = new Headers(hooks.headers);
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-cache");
  return new Response(readable, { status: 200, headers });
}
