import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HistorySidebar from './HistorySidebar';
import { HistoryItem } from '../types';

describe('HistorySidebar component', () => {
  const sampleHistory: HistoryItem[] = [
    {
      id: 'h1',
      topic: 'React Fundamentals',
      targetLanguage: 'English',
      curriculum: { topic: 'React Fundamentals', syllabus: '', modules: [] },
      sevenDayPlan: { topic: 'React Fundamentals', days: [] },
      initialTutorGreeting: 'Hello',
      timestamp: 1600000000000,
      overallProgress: 75,
      moduleCompletionStatus: {},
      planTaskCompletionStatus: {},
      journeyCompleted: false,
      quizHistory: [],
    },
    {
      id: 'h2',
      topic: 'Python Basics',
      targetLanguage: 'Bahasa Indonesia',
      curriculum: { topic: 'Python Basics', syllabus: '', modules: [] },
      sevenDayPlan: { topic: 'Python Basics', days: [] },
      initialTutorGreeting: 'Halo',
      timestamp: 1700000000000,
      overallProgress: 25,
      moduleCompletionStatus: {},
      planTaskCompletionStatus: {},
      journeyCompleted: false,
      quizHistory: [],
    },
  ];

  it('renders user level, action buttons, and history list', () => {
    render(
      <HistorySidebar
        historyItems={sampleHistory}
        selectedHistoryItemId="h2"
        userLevel={5}
        darkMode={false}
        isVisible={true}
        onToggleVisibilityMain={vi.fn()}
        onCloseMobile={vi.fn()}
        onSelectItem={vi.fn()}
        onNewSession={vi.fn()}
        onClearHistory={vi.fn()}
        onToggleDarkMode={vi.fn()}
        onDeleteItem={vi.fn()}
      />
    );

    expect(screen.getByText('Level: 5')).toBeInTheDocument();
    expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Python Basics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Learning Session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear All History/i })).toBeInTheDocument();
  });

  it('renders empty history message when historyItems array is empty', () => {
    render(
      <HistorySidebar
        historyItems={[]}
        selectedHistoryItemId={null}
        userLevel={1}
        darkMode={false}
        isVisible={true}
        onToggleVisibilityMain={vi.fn()}
        onCloseMobile={vi.fn()}
        onSelectItem={vi.fn()}
        onNewSession={vi.fn()}
        onClearHistory={vi.fn()}
        onToggleDarkMode={vi.fn()}
        onDeleteItem={vi.fn()}
      />
    );

    expect(screen.getByText(/No history yet\. Start a new session!/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear All History/i })).not.toBeInTheDocument();
  });

  it('calls onSelectItem when a history item card is clicked', () => {
    const mockOnSelect = vi.fn();
    render(
      <HistorySidebar
        historyItems={sampleHistory}
        selectedHistoryItemId="h2"
        userLevel={1}
        darkMode={false}
        isVisible={true}
        onToggleVisibilityMain={vi.fn()}
        onCloseMobile={vi.fn()}
        onSelectItem={mockOnSelect}
        onNewSession={vi.fn()}
        onClearHistory={vi.fn()}
        onToggleDarkMode={vi.fn()}
        onDeleteItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('React Fundamentals'));
    expect(mockOnSelect).toHaveBeenCalledWith('h1');
  });

  it('calls onDeleteItem when deleting a history item', () => {
    const mockOnDelete = vi.fn();
    render(
      <HistorySidebar
        historyItems={sampleHistory}
        selectedHistoryItemId="h2"
        userLevel={1}
        darkMode={false}
        isVisible={true}
        onToggleVisibilityMain={vi.fn()}
        onCloseMobile={vi.fn()}
        onSelectItem={vi.fn()}
        onNewSession={vi.fn()}
        onClearHistory={vi.fn()}
        onToggleDarkMode={vi.fn()}
        onDeleteItem={mockOnDelete}
      />
    );

    const deleteBtn = screen.getByLabelText('Delete session for React Fundamentals');
    fireEvent.click(deleteBtn);

    expect(mockOnDelete).toHaveBeenCalledWith('h1');
  });

  it('calls onNewSession, onClearHistory, and onToggleDarkMode when respective buttons are clicked', () => {
    const mockNewSession = vi.fn();
    const mockClearHistory = vi.fn();
    const mockToggleDarkMode = vi.fn();

    render(
      <HistorySidebar
        historyItems={sampleHistory}
        selectedHistoryItemId="h2"
        userLevel={1}
        darkMode={false}
        isVisible={true}
        onToggleVisibilityMain={vi.fn()}
        onCloseMobile={vi.fn()}
        onSelectItem={vi.fn()}
        onNewSession={mockNewSession}
        onClearHistory={mockClearHistory}
        onToggleDarkMode={mockToggleDarkMode}
        onDeleteItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New Learning Session/i }));
    expect(mockNewSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Clear All History/i }));
    expect(mockClearHistory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText(/Switch to Dark Mode/i));
    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });
});
