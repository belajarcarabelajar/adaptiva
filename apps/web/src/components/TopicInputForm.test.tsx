import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TopicInputForm from './TopicInputForm';

describe('TopicInputForm component', () => {
  it('renders input fields with default topic and target language', () => {
    render(<TopicInputForm onSubmit={vi.fn()} isLoading={false} />);

    expect(screen.getByLabelText(/Topic\/Skill to Learn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Language/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Learning Journey/i })).toBeInTheDocument();
  });

  it('populates initialTopic and initialLanguage when passed as props', () => {
    render(
      <TopicInputForm
        onSubmit={vi.fn()}
        isLoading={false}
        initialTopic="Quantum Computing"
        initialLanguage="English"
      />
    );

    expect(screen.getByLabelText(/Topic\/Skill to Learn/i)).toHaveValue('Quantum Computing');
    expect(screen.getByLabelText(/Target Language/i)).toHaveValue('en');
  });

  it('shows custom language input when "Other (Specify)" is selected', () => {
    render(<TopicInputForm onSubmit={vi.fn()} isLoading={false} />);

    const select = screen.getByLabelText(/Target Language/i);
    fireEvent.change(select, { target: { value: 'other' } });

    const customInput = screen.getByLabelText(/Specify Language Name/i);
    expect(customInput).toBeInTheDocument();

    fireEvent.change(customInput, { target: { value: 'Swahili' } });
    expect(customInput).toHaveValue('Swahili');
  });

  it('calls onSubmit with entered topic and selected language on form submission', () => {
    const mockOnSubmit = vi.fn();
    render(<TopicInputForm onSubmit={mockOnSubmit} isLoading={false} />);

    const topicInput = screen.getByLabelText(/Topic\/Skill to Learn/i);
    fireEvent.change(topicInput, { target: { value: 'Machine Learning' } });

    const langSelect = screen.getByLabelText(/Target Language/i);
    fireEvent.change(langSelect, { target: { value: 'en' } });

    const submitBtn = screen.getByRole('button', { name: /Start Learning Journey/i });
    fireEvent.click(submitBtn);

    expect(mockOnSubmit).toHaveBeenCalledWith('Machine Learning', 'English');
  });

  it('calls onSubmit with custom language name when "other" is selected', () => {
    const mockOnSubmit = vi.fn();
    render(<TopicInputForm onSubmit={mockOnSubmit} isLoading={false} />);

    fireEvent.change(screen.getByLabelText(/Topic\/Skill to Learn/i), {
      target: { value: 'Data Science' },
    });
    fireEvent.change(screen.getByLabelText(/Target Language/i), {
      target: { value: 'other' },
    });
    fireEvent.change(screen.getByLabelText(/Specify Language Name/i), {
      target: { value: 'Esperanto' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Start Learning Journey/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith('Data Science', 'Esperanto');
  });

  it('disables submit button and shows loading spinner when isLoading is true', () => {
    render(<TopicInputForm onSubmit={vi.fn()} isLoading={true} initialTopic="React" />);

    const submitBtn = screen.getByRole('button');
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });
});
