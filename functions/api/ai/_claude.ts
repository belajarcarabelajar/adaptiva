// The only module that imports @anthropic-ai/sdk. The core and its tests talk
// to Claude through the ClaudeGateway interface returned here.
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "@anthropic-ai/sdk";
import type { TaskSpec } from "./_tasks";

export { APIConnectionError, APIConnectionTimeoutError, APIError };

const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface CompleteInput {
  prompt: string;
  system?: string;
}

export interface CompleteResult {
  text: string;
  stopReason: string;
  refusalCategory?: string | null;
}

export interface ClaudeGateway {
  complete(spec: TaskSpec, input: CompleteInput): Promise<CompleteResult>;
}

type FinalMessage = {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
};

export function createClaudeGateway(
  apiKey: string,
  fetchImpl?: typeof fetch,
): ClaudeGateway {
  // Built on first use: with an undefined key the SDK falls back to reading
  // process.env, which Workers do not have.
  let client: Anthropic | null = null;
  const getClient = () =>
    (client ??= new Anthropic({ apiKey, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));

  return {
    async complete(spec, input) {
      const params = {
        model: spec.model,
        max_tokens: spec.maxTokens,
        output_config: {
          effort: spec.effort,
          ...(spec.schema
            ? { format: { type: "json_schema" as const, schema: spec.schema } }
            : {}),
        },
        messages: [{ role: "user" as const, content: input.prompt }],
        ...(input.system !== undefined ? { system: input.system } : {}),
      };

      // Haiku has no server-side fallback, and a fallbacks list returns a 400
      // there, so only Sonnet goes through the beta endpoint.
      const message: FinalMessage =
        spec.model === "claude-sonnet-5-5"
          ? await getClient()
              .beta.messages.stream({
                ...params,
                betas: [SERVER_SIDE_FALLBACK_BETA],
                fallbacks: "default",
              } as any)
              .finalMessage()
          : await getClient().messages.stream(params as any).finalMessage();

      // Thinking blocks can precede the answer, so the text is found by type.
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return {
        text,
        stopReason: message.stop_reason ?? "",
        refusalCategory: message.stop_details?.category ?? null,
      };
    },
  };
}

export type GatewayErrorInfo = {
  kind: "api" | "network" | "unexpected";
  status?: number;
  detail: string;
};

export function classifyGatewayError(err: unknown): GatewayErrorInfo {
  // APIConnectionError extends APIError, so it has to be checked first.
  if (err instanceof APIConnectionError) {
    return { kind: "network", detail: String(err) };
  }
  if (err instanceof APIError) {
    const body = err.error as { error?: { message?: unknown } } | undefined;
    const message = body?.error?.message;
    return {
      kind: "api",
      status: err.status,
      detail: typeof message === "string" ? message : "",
    };
  }
  return { kind: "unexpected", detail: err instanceof Error ? err.message : String(err) };
}
