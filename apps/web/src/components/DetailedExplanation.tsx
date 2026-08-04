import React from 'react';
import Accordion from './Accordion';
import MemoizedMarkdownRenderer from './MarkdownRenderer';
import { Icons } from '../constants';

export interface DetailedExplanationProps {
  id: string;
  isDetailedExplanationLoading: boolean;
  detailedExplanation?: string;
  onLoadDetailedExplanation: () => void;

  // Customization
  accordionKeyPrefix?: string;
  titleText?: React.ReactNode;

  // Styling (defaults to App.tsx sizing if not provided)
  loadingTextSize?: string;
  accordionTitleSize?: string;
  markdownTextSize?: string;
  regenerateButtonSize?: string;
  loadMoreButtonSize?: string;
}

export const DetailedExplanation: React.FC<DetailedExplanationProps> = ({
  id,
  isDetailedExplanationLoading,
  detailedExplanation,
  onLoadDetailedExplanation,
  accordionKeyPrefix = 'detail-accordion',
  titleText = "Further Details:",
  loadingTextSize = "text-md md:text-lg",
  accordionTitleSize = "text-lg md:text-xl",
  markdownTextSize = "text-sm md:text-lg",
  regenerateButtonSize = "text-sm",
  loadMoreButtonSize = "text-sm md:text-md",
}) => {
  return (
    <div className="mt-2 md:mt-3">
      {isDetailedExplanationLoading ? (
        <div className="flex items-center text-brand-blue dark:text-blue-400">
          <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400" />
          <span className={`ml-2 ${loadingTextSize}`}>Loading more details...</span>
        </div>
      ) : detailedExplanation ? (
        <>
          <Accordion
            key={`${accordionKeyPrefix}-${id}${
              detailedExplanation && !detailedExplanation.startsWith("Error:")
                ? '-success'
                : '-fail-or-pending'
            }`}
            title={
              <span className={`${accordionTitleSize} font-semibold text-brand-orange dark:text-orange-400`}>
                {titleText}
              </span>
            }
            startOpen={
              !!detailedExplanation &&
              !isDetailedExplanationLoading &&
              !detailedExplanation.startsWith("Error:")
            }
          >
            <MemoizedMarkdownRenderer content={detailedExplanation} baseTextSize={markdownTextSize} />
          </Accordion>
          {detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
            <button
              onClick={onLoadDetailedExplanation}
              className={`mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg ${regenerateButtonSize}`}
            >
              Regenerate Details
            </button>
          )}
        </>
      ) : (
        <button
          onClick={onLoadDetailedExplanation}
          className={`px-3 py-1.5 md:px-4 md:py-2 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white font-semibold rounded-lg ${loadMoreButtonSize}`}
        >
          Load More Details
        </button>
      )}
    </div>
  );
};

export default DetailedExplanation;
