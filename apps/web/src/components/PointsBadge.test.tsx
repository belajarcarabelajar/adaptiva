import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PointsBadge from "./PointsBadge";
import * as useAuthModule from "../hooks/useAuth";

vi.mock("../hooks/useAuth");

describe("PointsBadge component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when unauthenticated", () => {
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: null,
      status: "unauthenticated",
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      updatePoints: vi.fn(),
    });

    const { container } = render(<PointsBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders user points balance when authenticated", () => {
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: {
        id: "usr_123",
        name: "Test User",
        email: "test@example.com",
        points: 85,
      },
      status: "authenticated",
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      updatePoints: vi.fn(),
    });

    render(<PointsBadge />);
    expect(screen.getByText("85 Poin")).toBeInTheDocument();
  });
});
