import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExamConfigView from './ExamConfigView';

describe('ExamConfigView component', () => {
  it('renders default configuration options for a given module', () => {
    render(<ExamConfigView moduleTitle="TypeScript Basics" onSubmit={vi.fn()} isLoading={false} />);

    expect(screen.getByText(/Configure Exam for:/i)).toBeInTheDocument();
    expect(screen.getByText('TypeScript Basics')).toBeInTheDocument();
    expect(screen.getByLabelText(/Number of Multiple Choice Questions/i)).toHaveValue(10);
    expect(screen.getByLabelText(/Difficulty/i)).toHaveValue('3');
    expect(screen.getByLabelText(/Enable Time Limit\?/i)).not.toBeChecked();
  });

  it('shows duration input when time limit checkbox is checked', () => {
    render(<ExamConfigView moduleTitle="TypeScript Basics" onSubmit={vi.fn()} isLoading={false} />);

    const checkbox = screen.getByLabelText(/Enable Time Limit\?/i);
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText(/Exam Duration \(minutes\)/i)).toBeInTheDocument();
  });

  it('submits configured exam configuration when form is submitted', () => {
    const mockOnSubmit = vi.fn();
    render(<ExamConfigView moduleTitle="TypeScript Basics" onSubmit={mockOnSubmit} isLoading={false} />);

    const numInput = screen.getByLabelText(/Number of Multiple Choice Questions/i);
    fireEvent.change(numInput, { target: { value: '5' } });

    const diffSelect = screen.getByLabelText(/Difficulty/i);
    fireEvent.change(diffSelect, { target: { value: '4' } });

    const checkbox = screen.getByLabelText(/Enable Time Limit\?/i);
    fireEvent.click(checkbox);

    const durationInput = screen.getByLabelText(/Exam Duration \(minutes\)/i);
    fireEvent.change(durationInput, { target: { value: '15' } });

    const submitBtn = screen.getByRole('button', { name: /Generate & Start Exam/i });
    fireEvent.click(submitBtn);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      moduleId: 'typescript-basics',
      moduleTitle: 'TypeScript Basics',
      numMultipleChoice: 5,
      difficulty: 4,
      timeLimitEnabled: true,
      durationMinutes: 15,
    });
  });

  it('disables submit button when questions count is 0 or when loading', () => {
    const { rerender } = render(
      <ExamConfigView moduleTitle="TypeScript Basics" onSubmit={vi.fn()} isLoading={false} />
    );

    const numInput = screen.getByLabelText(/Number of Multiple Choice Questions/i);
    fireEvent.change(numInput, { target: { value: '0' } });
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(<ExamConfigView moduleTitle="TypeScript Basics" onSubmit={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('syncs form state from initialConfig when prop is provided', () => {
    const initialConfig = {
      moduleId: 'typescript-basics',
      moduleTitle: 'TypeScript Basics',
      numMultipleChoice: 7,
      difficulty: 5,
      timeLimitEnabled: true,
      durationMinutes: 45,
    };

    render(
      <ExamConfigView
        moduleTitle="TypeScript Basics"
        onSubmit={vi.fn()}
        isLoading={false}
        initialConfig={initialConfig}
      />
    );

    expect(screen.getByLabelText(/Number of Multiple Choice Questions/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Difficulty/i)).toHaveValue('5');
    expect(screen.getByLabelText(/Enable Time Limit\?/i)).toBeChecked();
    expect(screen.getByLabelText(/Exam Duration \(minutes\)/i)).toHaveValue(45);
  });
});
