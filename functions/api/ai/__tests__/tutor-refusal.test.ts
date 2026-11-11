import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { handleAiRequest } from "../_core";
import { createTutorSseResponse, type streamTutorText, type TutorRunResult } from "../_tutor";

const ENV = { ANTHROPIC_API_KEY: "sk-test" };
const REFUNDED = "Poin Anda telah dikembalikan.";
const TUTOR = {
  task: "tutor.chat",
  system: "Kamu tutor.",
  messages: [{ role: "user", content: "Halo" }],
};

type Frame = { type: string; error?: string; message?: string; text?: string };
type TutorOpts = Parameters<typeof streamTutorText>[0];

function harness(stream: (o: TutorOpts) => Promise<TutorRunResult>) {
  const refundCalls: number[] = [];
  const deps = {
    gateway: { complete: async () => { throw new Error("unused"); } },
    deduct: async () => ({ success: true, remainingPoints: 80, session: { userId: "u1" } }),
    refund: async (_r: Request, _e: unknown, amount: number) => {
      refundCalls.push(amount);
      return { success: true, remainingPoints: 100 };
    },
    tutor: { stream: stream as typeof streamTutorText },
  };
  return { deps, refundCalls };
}

async function run(stream: (o: TutorOpts) => Promise<TutorRunResult>) {
  const h = harness(stream);
  const res = await handleAiRequest(
    new Request("https://adaptiva.app/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(TUTOR),
    }),
    ENV,
    h.deps,
  );
  return { frames: frames(await res.text()), refundCalls: h.refundCalls };
}

function frames(text: string): Frame[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

let originalError: typeof console.error;
beforeEach(() => {
  originalError = console.error;
  console.error = () => {};
});
afterEach(() => {
  console.error = originalError;
});

describe("tutor.chat refusal refund (D1)", () => {
  it("refunds once for a non-billed category refused before output", async () => {
    const out = await run(async () => ({ stopReason: "refusal", refusalCategory: "cyber" }));
    expect(out.refundCalls).toEqual([2]);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0].type).toBe("error");
    expect(out.frames[0].error).toBe("ai_generation_blocked");
    expect(out.frames[0].message?.endsWith(REFUNDED)).toBe(true);
  });

  it("keeps the charge for a billed category refused before output", async () => {
    const out = await run(async () => ({ stopReason: "refusal", refusalCategory: "bio" }));
    expect(out.refundCalls).toEqual([]);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0].error).toBe("ai_generation_blocked");
  });

  it("keeps the charge for a refusal after a delta", async () => {
    const out = await run(async (o) => {
      o.onDelta("Sebagian");
      return { stopReason: "refusal", refusalCategory: "cyber" };
    });
    expect(out.refundCalls).toEqual([]);
    expect(out.frames.map((f) => f.type)).toEqual(["delta", "error"]);
    expect(out.frames[1].error).toBe("ai_generation_blocked");
  });

  it("falls back to the plain blocked frame when the refusal hook throws", async () => {
    const res = createTutorSseResponse(
      async () => ({ stopReason: "refusal", refusalCategory: "cyber" }),
      {
        onErrorBeforeOutput: async () => ({ error: "x", message: "x" }),
        onRefusalBeforeOutput: async () => {
          throw new Error("refund store down");
        },
      },
    );
    const out = frames(await res.text());
    expect(out).toEqual([
      {
        type: "error",
        error: "ai_generation_blocked",
        message: "Permintaan ditolak oleh filter keamanan AI (kategori: cyber).",
      },
    ]);
  });
});
