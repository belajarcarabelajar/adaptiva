import { describe, expect, test } from "bun:test";
import { decodeIdTokenUnsafe } from "./_shared";

describe("decodeIdTokenUnsafe", () => {
  test("successfully decodes a valid JWT payload", () => {
    const payload = {
      sub: "1234567890",
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
    };

    // Create a mock JWT: header.payload.signature
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    // Use base64url encoding for the payload
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const signature = "mock-signature";

    const token = `${header}.${payloadB64}.${signature}`;

    const result = decodeIdTokenUnsafe(token);
    expect(result).toEqual(payload as any);
  });

  test("throws error when id_token is missing", () => {
    expect(() => decodeIdTokenUnsafe("")).toThrow("Missing id_token");
  });

  test("throws error when id_token is malformed", () => {
    expect(() => decodeIdTokenUnsafe("part1.part2")).toThrow("Malformed id_token");
    expect(() => decodeIdTokenUnsafe("part1")).toThrow("Malformed id_token");
    expect(() => decodeIdTokenUnsafe("part1.part2.part3.part4")).toThrow("Malformed id_token");
  });

  test("throws error when payload is not valid base64", () => {
    // payload is the second part
    const token = "header.invalid-base64-!@#.signature";
    // Depending on JS runtime, atob might throw DOMException
    expect(() => decodeIdTokenUnsafe(token)).toThrow();
  });

  test("throws error when payload is not valid JSON", () => {
    const invalidJsonB64 = btoa("not a valid json object").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `header.${invalidJsonB64}.signature`;
    expect(() => decodeIdTokenUnsafe(token)).toThrow(); // Should throw JSON parse error
  });
});
