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
      points: 100,
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

  it("updates points using updatePoints", async () => {
    const mockUser = {
      id: "123",
      email: "user@example.com",
      name: "Test User",
      points: 50,
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

    act(() => {
      result.current.updatePoints(150);
    });

    expect(result.current.user?.points).toBe(150);
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

  it("handles network error when /api/auth/me fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    expect(result.current.error).toBe("Network disconnect");
  });

  it("parses auth_error parameter variants from URL search and cleans up history state", async () => {
    window.history.pushState({}, "", "/?auth_error=email_not_verified");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.error).toBe("Your Google email is not verified.");
    });
  });

  it("parses access_denied and invalid_state auth_error variants", async () => {
    window.history.pushState({}, "", "/?auth_error=access_denied");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.error).toBe("Sign-in request was cancelled or denied.");
    });
  });

  it("triggers redirect to /api/auth/login on signIn and /api/auth/logout on signOut", async () => {
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
      result.current.signIn("/custom-path");
    });

    expect(locationMock.href).toBe("/api/auth/login?next=%2Fcustom-path");

    act(() => {
      result.current.signOut();
    });

    expect(locationMock.href).toBe("/api/auth/logout");

    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });
});
