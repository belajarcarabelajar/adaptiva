import Anthropic from "@anthropic-ai/sdk";

// pause_turn resumes are capped so a looping server-side search cannot bill forever.
const MAX_CONTINUATIONS = 2;

type SearchBlock = {
  type: string;
  text?: string;
  content?: unknown;
};

type SearchMessage = {
  content: SearchBlock[];
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
};

export type ResourceSearchResult = {
  text: string;
  sources: { url: string; title: string }[];
  stopReason: string | null;
  refusalCategory: string | null;
};

export async function runResourceSearch(opts: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  model: string;
  effort: "medium";
  maxTokens: number;
  prompt: string;
}): Promise<ResourceSearchResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}) });
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: opts.prompt },
  ];
  const sources: { url: string; title: string }[] = [];
  const seen = new Set<string>();

  let message: SearchMessage;
  let continuations = 0;
  for (;;) {
    message = (await client.beta.messages
      .stream({
        model: opts.model,
        max_tokens: opts.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: opts.effort },
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages,
      } as any)
      .finalMessage()) as unknown as SearchMessage;

    for (const block of message.content) {
      // An error result is an object, not an array, and simply yields no sources.
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const item of block.content as { type?: string; url?: string; title?: string }[]) {
        if (item?.type !== "web_search_result" || !item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        sources.push({ url: item.url, title: item.title ?? "" });
      }
    }

    if (message.stop_reason !== "pause_turn" || continuations >= MAX_CONTINUATIONS) break;
    continuations += 1;
    messages.push({ role: "assistant", content: message.content });
  }

  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  return {
    text,
    sources,
    stopReason: message.stop_reason ?? null,
    refusalCategory: message.stop_details?.category ?? null,
  };
}
