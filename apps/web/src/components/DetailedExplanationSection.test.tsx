import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DetailedExplanationSection from './DetailedExplanationSection';

vi.mock('./MarkdownRenderer', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-content">{content}</div>,
}));

vi.mock('./Accordion', () => ({
    __esModule: true,
    default: ({ title, children, startOpen }: any) => (
        <div data-testid="accordion" data-start-open={startOpen}>
            <div data-testid="accordion-title">{title}</div>
            <div data-testid="accordion-children">{children}</div>
        </div>
    ),
}));

describe('DetailedExplanationSection', () => {
    it('renders "Load More Details" button when no detailed explanation is present', () => {
        const onLoad = vi.fn();
        render(<DetailedExplanationSection
            questionId="q1"
            onLoadDetailedExplanation={onLoad}
            title="Details"
            accordionKeyPrefix="test"
        />);

        const button = screen.getByText('Load More Details');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onLoad).toHaveBeenCalledWith('q1');
    });

    it('renders loading state', () => {
        const onLoad = vi.fn();
        render(<DetailedExplanationSection
            questionId="q1"
            isDetailedExplanationLoading={true}
            onLoadDetailedExplanation={onLoad}
            title="Details"
            accordionKeyPrefix="test"
        />);

        expect(screen.getByText('Loading more details...')).toBeInTheDocument();
    });

    it('renders detailed explanation inside accordion when available', () => {
        const onLoad = vi.fn();
        render(<DetailedExplanationSection
            questionId="q1"
            detailedExplanation="Some detailed info"
            onLoadDetailedExplanation={onLoad}
            title="Details Title"
            accordionKeyPrefix="test"
        />);

        expect(screen.getByTestId('accordion-title')).toHaveTextContent('Details Title');
        expect(screen.getByTestId('markdown-content')).toHaveTextContent('Some detailed info');
        expect(screen.getByTestId('accordion')).toHaveAttribute('data-start-open', 'true');
    });

    it('renders regenerate button when there is an error explanation', () => {
        const onLoad = vi.fn();
        render(<DetailedExplanationSection
            questionId="q1"
            detailedExplanation="Failed to load detailed explanation (empty response)."
            onLoadDetailedExplanation={onLoad}
            title="Details"
            accordionKeyPrefix="test"
        />);

        const button = screen.getByText('Regenerate Details');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onLoad).toHaveBeenCalledWith('q1');
    });
});
