import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExamResultsView from './ExamResultsView';
import { ExamAttempt } from '../types';

describe('ExamResultsView component', () => {
  const sampleAttempt: ExamAttempt = {
    id: 'attempt-1',
    moduleId: 'ts-basics',
    timestamp: Date.now(),
    config: {
      moduleId: 'ts-basics',
      moduleTitle: 'TypeScript Basics',
      numMultipleChoice: 2,
      difficulty: 3,
      timeLimitEnabled: false,
    },
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        questionText: 'What is TS?',
        options: ['Typed JS', 'CSS framework'],
        correctAnswer: 'Typed JS',
        userAnswer: 'Typed JS',
        isCorrect: true,
        scoreAwarded: 10,
        maxPoints: 10,
        explanation: 'TypeScript is typed JS.',
      },
      {
        id: 'q2',
        type: 'multiple-choice',
        questionText: 'What is HTML?',
        options: ['Markup language', 'Programming language'],
        correctAnswer: 'Markup language',
        userAnswer: '',
        isCorrect: false,
        scoreAwarded: 0,
        maxPoints: 10,
        explanation: '',
      },
    ],
    totalScore: 10,
    maxScore: 20,
  };

  it('renders overall score and percentage breakdown', () => {
    render(
      <ExamResultsView
        examAttempt={sampleAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={vi.fn()}
      />
    );

    expect(screen.getByText('Exam Results:')).toBeInTheDocument();
    expect(screen.getByText('TypeScript Basics')).toBeInTheDocument();
    // Score is rendered inside a <p> as "10\n / \n20" with whitespace — match using a function
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /10\s*\/\s*20/.test(el.textContent || ''))).toBeInTheDocument();
    // Percentage is always visible
    expect(screen.getByText('50%')).toBeInTheDocument();
    // Accordion summary items are always visible (the question title row)
    expect(screen.getByText(/Q1: What is TS/)).toBeInTheDocument();
    expect(screen.getByText(/Q2: What is HTML/)).toBeInTheDocument();
  });

  it('renders zero percentage when maxScore is 0', () => {
    const zeroAttempt = { ...sampleAttempt, maxScore: 0, totalScore: 0 };
    render(
      <ExamResultsView
        examAttempt={zeroAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={vi.fn()}
      />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows "Load More Details" button inside expanded accordion for question without detailed explanation', () => {
    render(
      <ExamResultsView
        examAttempt={sampleAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={vi.fn()}
      />
    );

    // Expand the first question accordion to reveal its contents
    const accordionButtons = screen.getAllByRole('button', { name: /Q1/i });
    fireEvent.click(accordionButtons[0]);

    // Now "Load More Details" should be visible
    expect(screen.getByRole('button', { name: /Load More Details/i })).toBeInTheDocument();
    // Also check that "Not answered" would be visible for Q2 when expanded
    expect(screen.getByText('TypeScript is typed JS.')).toBeInTheDocument();
  });

  it('shows loading spinner when detailed explanation is loading', () => {
    const loadingAttempt: ExamAttempt = {
      ...sampleAttempt,
      questions: [
        {
          ...sampleAttempt.questions[0],
          isDetailedExplanationLoading: true,
        },
      ],
    };

    render(
      <ExamResultsView
        examAttempt={loadingAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={vi.fn()}
      />
    );

    // Expand accordion to view loading content
    const accordionButton = screen.getByRole('button', { name: /Q1/i });
    fireEvent.click(accordionButton);

    expect(screen.getByText('Loading more details...')).toBeInTheDocument();
  });

  it('calls onLoadDetailedExplanation when Load More Details button is clicked', () => {
    const mockLoadDetails = vi.fn();
    render(
      <ExamResultsView
        examAttempt={sampleAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={mockLoadDetails}
      />
    );

    // Expand first accordion
    const accordionButtons = screen.getAllByRole('button', { name: /Q1/i });
    fireEvent.click(accordionButtons[0]);

    const loadBtn = screen.getByRole('button', { name: /Load More Details/i });
    fireEvent.click(loadBtn);

    expect(mockLoadDetails).toHaveBeenCalledWith('q1');
  });

  it('renders detailed explanation accordion and handles Regenerate Details button when there is an error', () => {
    const mockLoadDetails = vi.fn();
    const errorAttempt: ExamAttempt = {
      ...sampleAttempt,
      questions: [
        {
          ...sampleAttempt.questions[0],
          detailedExplanation: 'Error: Failed to load detailed explanation (empty response).',
        },
      ],
    };

    render(
      <ExamResultsView
        examAttempt={errorAttempt}
        onRetake={vi.fn()}
        onReviewQuestion={vi.fn()}
        onBack={vi.fn()}
        onLoadDetailedExplanation={mockLoadDetails}
      />
    );

    // Expand outer accordion for Q1
    const accordionButton = screen.getByRole('button', { name: /Q1/i });
    fireEvent.click(accordionButton);

    // "Further Details:" accordion button title should now be visible — click it to expand inner accordion
    const furtherDetailsBtn = screen.getByRole('button', { name: /Further Details/i });
    expect(furtherDetailsBtn).toBeInTheDocument();
    fireEvent.click(furtherDetailsBtn);

    // Now "Regenerate Details" is visible inside the expanded inner accordion
    const regenBtn = screen.getByRole('button', { name: /Regenerate Details/i });
    fireEvent.click(regenBtn);

    expect(mockLoadDetails).toHaveBeenCalledWith('q1');
  });

  it('calls onRetake and onBack handlers', () => {
    const mockOnRetake = vi.fn();
    const mockOnBack = vi.fn();

    render(
      <ExamResultsView
        examAttempt={sampleAttempt}
        onRetake={mockOnRetake}
        onReviewQuestion={vi.fn()}
        onBack={mockOnBack}
        onLoadDetailedExplanation={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Retake Exam/i }));
    expect(mockOnRetake).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Back to Exam History/i }));
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
