import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AuthModal from "./AuthModal";
import * as useAuthModule from "../hooks/useAuth";

vi.mock("../hooks/useAuth");

describe("AuthModal component", () => {
  const mockSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: null,
      status: "unauthenticated",
      error: null,
      signIn: mockSignIn,
      signOut: vi.fn(),
      refresh: vi.fn(),
      updatePoints: vi.fn(),
    });
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(<AuthModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders modal title, description, and Google button when isOpen is true", () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText("Login Diperlukan")).toBeInTheDocument();
    expect(screen.getByText(/Silakan masuk dengan akun Google Anda/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lanjut dengan Google/i })).toBeInTheDocument();
  });

  it("calls signIn when Google button is clicked", () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Lanjut dengan Google/i });
    fireEvent.click(button);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button or Batal is clicked", () => {
    const mockOnClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={mockOnClose} />);
    const cancelBtn = screen.getByRole("button", { name: "Batal" });
    fireEvent.click(cancelBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed while modal is open", () => {
    const mockOnClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={mockOnClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
