import { describe, it, expect } from "vitest";
import { randomHex, randomToken } from "./_shared.ts";

describe("randomHex", () => {
  it("should generate a 64-character string by default (32 bytes)", () => {
    const hex = randomHex();
    expect(hex.length).toBe(64);
  });

  it("should generate the correct length for a custom byte length", () => {
    const hex16 = randomHex(16);
    expect(hex16.length).toBe(32);

    const hex8 = randomHex(8);
    expect(hex8.length).toBe(16);
  });

  it("should contain only valid lowercase hexadecimal characters", () => {
    const hex = randomHex();
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it("should return cryptographically random and unique values", () => {
    const hex1 = randomHex();
    const hex2 = randomHex();
    expect(hex1).not.toBe(hex2);
  });
});

describe("randomToken", () => {
  it("should return a string of expected base64url length by default (32 bytes)", () => {
    const token = randomToken();
    // 32 bytes encoded in base64 without padding is Math.ceil(32 * 4 / 3) = 43 chars
    expect(token.length).toBe(43);
  });

  it("should return a string of expected base64url length for custom lengths", () => {
    const token16 = randomToken(16);
    // 16 bytes encoded in base64 without padding is Math.ceil(16 * 4 / 3) = 22 chars
    expect(token16.length).toBe(22);
  });

  it("should contain only valid base64url characters (no padding)", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
  });

  it("should return unique values", () => {
    const token1 = randomToken();
    const token2 = randomToken();
    expect(token1).not.toBe(token2);
  });
});
