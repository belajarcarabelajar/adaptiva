import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AuthButton from "./AuthButton";
import { _resetAuthSharedStateForTesting } from "../hooks/useAuth";

describe("AuthButton component", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetAuthSharedStateForTesting();
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders loading spinner initially while session is being checked", () => {
    // Keep fetch promise pending
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(<AuthButton />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders 'Sign in with Google' button when unauthenticated", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    render(<AuthButton />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    });
  });

  it("renders user avatar and dropdown menu when authenticated", async () => {
    const mockUser = {
      id: "456",
      email: "jane@example.com",
      name: "Jane Doe",
      picture: "https://example.com/jane.jpg",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUser }),
    } as Response);

    render(<AuthButton />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    // Click profile button to open menu
    const profileBtn = screen.getByRole("button", { name: /jane doe/i });
    fireEvent.click(profileBtn);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("displays full account name on desktop without truncation or max-width restriction", async () => {
    const mockUser = {
      id: "456",
      email: "alexander.supertramp@example.com",
      name: "Alexander Supertramp The Second",
      picture: "https://example.com/alexander.jpg",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUser }),
    } as Response);

    render(<AuthButton />);

    await waitFor(() => {
      const nameEl = screen.getByText("Alexander Supertramp The Second");
      expect(nameEl).toBeInTheDocument();
      expect(nameEl.className).not.toContain("truncate");
      expect(nameEl.className).not.toContain("max-w-[12ch]");
    });
  });
});

