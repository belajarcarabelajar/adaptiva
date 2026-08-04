import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetailedExplanation } from './DetailedExplanation';

vi.mock('./MarkdownRenderer', () => {
  return {
    __esModule: true,
    default: ({ content }: { content: string }) => <div data-testid="markdown-renderer">{content}</div>
  };
});

describe('DetailedExplanation component', () => {
  const defaultProps = {
    questionId: 'q1',
    onLoadDetailedExplanation: vi.fn(),
    accordionKeyPrefix: 'test-prefix',
  };

  it('renders loading state', () => {
    render(<DetailedExplanation {...defaultProps} isDetailedExplanationLoading={true} />);
    expect(screen.getByText('Loading more details...')).toBeInTheDocument();
  });

  it('renders Load More Details button when no detailedExplanation is provided and default titleText is used', () => {
    render(<DetailedExplanation {...defaultProps} titleText="Load More Details" />);
    const button = screen.getByRole('button', { name: 'Load More Details' });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(defaultProps.onLoadDetailedExplanation).toHaveBeenCalledWith('q1', false);
  });

  it('renders custom titleText string in load button', () => {
    render(<DetailedExplanation {...defaultProps} titleText="Lihat Penjelasan" />);
    const button = screen.getByRole('button', { name: 'Lihat Penjelasan' });
    expect(button).toBeInTheDocument();
  });

  it('renders detailed explanation inside an accordion when provided', () => {
    render(<DetailedExplanation {...defaultProps} detailedExplanation="Detailed explanation text" />);

    expect(screen.getByText('Further Details:')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('Detailed explanation text');
  });

  it('renders Regenerate Details button when explanation indicates an empty response error', () => {
    render(
      <DetailedExplanation
        {...defaultProps}
        detailedExplanation="Failed to load detailed explanation (empty response)."
      />
    );

    const regenerateBtn = screen.getByRole('button', { name: 'Regenerate Details' });
    expect(regenerateBtn).toBeInTheDocument();

    fireEvent.click(regenerateBtn);
    expect(defaultProps.onLoadDetailedExplanation).toHaveBeenCalledWith('q1', false);
  });
});
