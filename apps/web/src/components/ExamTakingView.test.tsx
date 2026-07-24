import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExamTakingView from './ExamTakingView';
import { ExamQuestion } from '../types';

describe('ExamTakingView component', () => {
  const sampleQuestion: ExamQuestion = {
    id: 'q1',
    type: 'multiple-choice',
    questionText: 'What is TypeScript?',
    options: ['A language', 'A browser', 'A database', 'An OS'],
    correctAnswer: 'A language',
    userAnswer: '',
    maxPoints: 10,
    scoreAwarded: 0,
    explanation: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
    difficulty: 3,
  };

  it('renders question text, options, and question index', () => {
    render(
      <ExamTakingView
        question={sampleQuestion}
        questionIndex={0}
        totalQuestions={3}
        onAnswer={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onSubmit={vi.fn()}
        timeLeft={300}
        timeLimitEnabled={true}
        examModuleTitle="TypeScript Basics"
      />
    );

    expect(screen.getByText('Exam: TypeScript Basics')).toBeInTheDocument();
    expect(screen.getByText(/Time Left: 5:00/)).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 3 (Max Points: 10)')).toBeInTheDocument();
    expect(screen.getByText('What is TypeScript?')).toBeInTheDocument();
    expect(screen.getByLabelText('A language')).toBeInTheDocument();
    expect(screen.getByLabelText('A browser')).toBeInTheDocument();
  });

  it('calls onAnswer when selecting a multiple choice option', () => {
    const mockOnAnswer = vi.fn();
    render(
      <ExamTakingView
        question={sampleQuestion}
        questionIndex={0}
        totalQuestions={3}
        onAnswer={mockOnAnswer}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onSubmit={vi.fn()}
        timeLeft={0}
        timeLimitEnabled={false}
        examModuleTitle="TypeScript Basics"
      />
    );

    const optionRadio = screen.getByLabelText('A language');
    fireEvent.click(optionRadio);

    expect(mockOnAnswer).toHaveBeenCalledWith('q1', 'A language');
  });

  it('disables Previous button on the first question and enables Next button', () => {
    const mockOnNext = vi.fn();
    render(
      <ExamTakingView
        question={sampleQuestion}
        questionIndex={0}
        totalQuestions={3}
        onAnswer={vi.fn()}
        onNext={mockOnNext}
        onPrev={vi.fn()}
        onSubmit={vi.fn()}
        timeLeft={0}
        timeLimitEnabled={false}
        examModuleTitle="TypeScript Basics"
      />
    );

    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
    
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('renders Submit Exam button on the final question', () => {
    const mockOnSubmit = vi.fn();
    render(
      <ExamTakingView
        question={sampleQuestion}
        questionIndex={2}
        totalQuestions={3}
        onAnswer={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onSubmit={mockOnSubmit}
        timeLeft={0}
        timeLimitEnabled={false}
        examModuleTitle="TypeScript Basics"
      />
    );

    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Submit Exam/i });
    expect(submitBtn).toBeInTheDocument();

    fireEvent.click(submitBtn);
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });
});
