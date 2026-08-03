import { expect, test, describe } from "bun:test";
import { timingSafeEqual } from "./_shared";

describe("timingSafeEqual", () => {
  test("returns true for identical strings", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true);
    expect(timingSafeEqual("password123", "password123")).toBe(true);
  });

  test("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  test("returns false for strings of different lengths", () => {
    expect(timingSafeEqual("hello", "hell")).toBe(false);
    expect(timingSafeEqual("hello", "hello ")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  test("returns false for strings of the same length but different content", () => {
    expect(timingSafeEqual("hello", "world")).toBe(false);
    expect(timingSafeEqual("hello", "hallo")).toBe(false);
    expect(timingSafeEqual("12345", "12346")).toBe(false);
  });

  test("handles special characters and unicode", () => {
    expect(timingSafeEqual("🦄🌈", "🦄🌈")).toBe(true);
    expect(timingSafeEqual("🦄🌈", "🦄☁️")).toBe(false);
    expect(timingSafeEqual("!@#$%", "!@#$%")).toBe(true);
    expect(timingSafeEqual("!@#$%", "^&*()")).toBe(false);
  });
});
