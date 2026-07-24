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
        remainingPoints={5}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders required points, remaining points, and actionName when open", () => {
    render(
      <InsufficientPointsModal
        isOpen={true}
        onClose={vi.fn()}
        requiredPoints={10}
        remainingPoints={3}
        actionName="Generate Quiz"
      />
    );

    expect(screen.getByText("Poin Anda Tidak Cukup")).toBeInTheDocument();
    expect(screen.getByText("Generate Quiz")).toBeInTheDocument();
    expect(screen.getByText("3 Poin")).toBeInTheDocument();
    expect(screen.getByText("-7 Poin")).toBeInTheDocument();
  });

  it("calls onClose when 'Saya Mengerti' or close icon button is clicked", () => {
    const mockOnClose = vi.fn();
    render(
      <InsufficientPointsModal
        isOpen={true}
        onClose={mockOnClose}
        requiredPoints={10}
        remainingPoints={5}
      />
    );

    const closeBtn = screen.getByRole("button", { name: "Saya Mengerti" });
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    const iconCloseBtn = screen.getByRole("button", { name: "Tutup" });
    fireEvent.click(iconCloseBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });

  it("calls onClose when Escape key is pressed", () => {
    const mockOnClose = vi.fn();
    render(
      <InsufficientPointsModal
        isOpen={true}
        onClose={mockOnClose}
        requiredPoints={10}
        remainingPoints={5}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
