import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import InsufficientPointsModal from "./InsufficientPointsModal";

describe("InsufficientPointsModal component", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <InsufficientPointsModal
        isOpen={false}
        onClose={vi.fn()}
        requiredPoints={10}
        remainingPoints={4}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders required points and remaining points when open", () => {
    render(
      <InsufficientPointsModal
        isOpen={true}
        onClose={vi.fn()}
        requiredPoints={10}
        remainingPoints={4}
        actionName="Generate Kuis"
      />
    );

    expect(screen.getByText("Poin Anda Tidak Cukup")).toBeInTheDocument();
    expect(screen.getByText("10 Poin")).toBeInTheDocument();
    expect(screen.getByText("4 Poin")).toBeInTheDocument();
    expect(screen.getByText("-6 Poin")).toBeInTheDocument();
  });

  it("calls onClose when 'Saya Mengerti' is clicked", () => {
    const mockOnClose = vi.fn();
    render(
      <InsufficientPointsModal
        isOpen={true}
        onClose={mockOnClose}
        requiredPoints={10}
        remainingPoints={4}
      />
    );

    const button = screen.getByRole("button", { name: "Saya Mengerti" });
    fireEvent.click(button);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
