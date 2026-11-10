import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTH_ERROR_MESSAGES, GENERIC_AUTH_ERROR, friendlyAuthError } from "./authErrors";

function emittedCodes(relativePath: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  const codes = new Set<string>();
  for (const m of source.matchAll(/auth_error=([a-z_]+)/g)) codes.add(m[1]);
  for (const m of source.matchAll(/auth_error=\$\{encodeURIComponent\("([a-z_]+)"\)\}/g)) codes.add(m[1]);
  return [...codes];
}

describe("friendlyAuthError", () => {
  it("shows the expired-session message for the code the callback sends", () => {
    expect(friendlyAuthError("invalid_or_expired_state")).toBe(
      "Sign-in session expired. Please try again.",
    );
  });

  it("shows a generic message instead of an unknown raw code", () => {
    expect(friendlyAuthError("something_new")).toBe(GENERIC_AUTH_ERROR);
  });

  it("has a message for every auth_error code the auth Functions emit", () => {
    const codes = [
      ...emittedCodes("../../../../functions/api/auth/callback.ts"),
      ...emittedCodes("../../../../functions/api/auth/login.ts"),
    ];
    // Guard against the extraction silently matching nothing.
    expect(codes).toContain("token_exchange_failed");
    expect(codes).toContain("invalid_or_expired_state");
    const missing = codes.filter((code) => !(code in AUTH_ERROR_MESSAGES));
    expect(missing).toEqual([]);
  });
});
