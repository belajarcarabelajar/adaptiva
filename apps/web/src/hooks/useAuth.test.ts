import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuth, _resetAuthSharedStateForTesting } from "./useAuth";

describe("useAuth hook", () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    _resetAuthSharedStateForTesting();
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.pushState({}, "", "/");
  });

  it("fetches user session on mount and sets authenticated status when 200 OK", async () => {
    const mockUser = {
      id: "123",
      email: "user@example.com",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUser }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.error).toBeNull();
  });

  it("sets unauthenticated status when /api/auth/me returns 401", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    expect(result.current.user).toBeNull();
  });

  it("parses auth_error parameter from URL search and cleans up history state", async () => {
    window.history.pushState({}, "", "/?auth_error=domain_not_allowed");

    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.error).toBe("Email domain is not allowed for sign-in.");
    });

    expect(replaceStateSpy).toHaveBeenCalledWith({}, "", "/");
  });

  it("parses auth_error=not_configured parameter and shows user-friendly notice", async () => {
    window.history.pushState({}, "", "/?auth_error=not_configured");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.error).toBe("Google Sign-in is not configured on this deployment.");
    });
  });

  it("triggers redirect to /api/auth/login on signIn", () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const locationMock = { href: "http://localhost:3000/" };
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: locationMock,
    });

    const { result } = renderHook(() => useAuth());
    act(() => {
      result.current.signIn();
    });

    expect(locationMock.href).toBe("/api/auth/login?next=%2F");

    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });
});
