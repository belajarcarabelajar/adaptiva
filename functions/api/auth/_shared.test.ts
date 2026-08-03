import { describe, it, expect } from "bun:test";
import { parseCookies } from "./_shared.ts";

describe("parseCookies", () => {
  it("should return an empty object if no cookie header is present", () => {
    const request = new Request("http://localhost/");
    expect(parseCookies(request)).toEqual({});
  });

  it("should return an empty object if cookie header is empty", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "" },
    });
    expect(parseCookies(request)).toEqual({});
  });

  it("should parse a single cookie", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "session=12345" },
    });
    expect(parseCookies(request)).toEqual({ session: "12345" });
  });

  it("should parse multiple cookies", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "session=12345; user=alice; theme=dark" },
    });
    expect(parseCookies(request)).toEqual({
      session: "12345",
      user: "alice",
      theme: "dark",
    });
  });

  it("should ignore invalid parts (missing '=')", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "session=12345; invalid_cookie; theme=dark" },
    });
    expect(parseCookies(request)).toEqual({
      session: "12345",
      theme: "dark",
    });
  });

  it("should trim keys and values", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "  session  =  12345  ;  user=alice  " },
    });
    expect(parseCookies(request)).toEqual({
      session: "12345",
      user: "alice",
    });
  });

  it("should decode URI component in values", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "data=hello%20world" },
    });
    expect(parseCookies(request)).toEqual({ data: "hello world" });
  });

  it("should handle empty values", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "empty=" },
    });
    expect(parseCookies(request)).toEqual({ empty: "" });
  });

  it("should ignore empty keys", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: "=value" },
    });
    expect(parseCookies(request)).toEqual({});
  });
});
