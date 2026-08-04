import React from 'react';
import { Icons } from '../constants';
import Accordion from './Accordion';
import MemoizedMarkdownRenderer from './MarkdownRenderer';

interface DetailedExplanationProps {
  questionId: string;
  isDetailedExplanationLoading?: boolean;
  detailedExplanation?: string;
  onLoadDetailedExplanation: (questionId: string, isExam: boolean) => void;
  accordionKeyPrefix: string;
  titleText?: string | React.ReactNode;
}

export const DetailedExplanation: React.FC<DetailedExplanationProps> = ({
  questionId,
  isDetailedExplanationLoading,
  detailedExplanation,
  onLoadDetailedExplanation,
  accordionKeyPrefix,
  titleText = "Further Details:",
}) => {
  if (isDetailedExplanationLoading) {
    return (
      <div className="flex items-center text-brand-blue dark:text-blue-400">
        <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400" />
        <span className="ml-2 text-md md:text-lg">Loading more details...</span>
      </div>
    );
  }

  if (detailedExplanation) {
    const successSuffix = !detailedExplanation.startsWith("Error:") ? '-success' : '-fail-or-pending';
    const accordionKey = `${accordionKeyPrefix}-${questionId}${successSuffix}`;
    const startOpen = !isDetailedExplanationLoading && !detailedExplanation.startsWith("Error:");

    return (
      <>
        <Accordion
          key={accordionKey}
          title={typeof titleText === "string" ? <span className="text-lg md:text-xl font-semibold text-brand-orange dark:text-orange-400">{titleText}</span> : titleText}
          startOpen={startOpen}
        >
          <MemoizedMarkdownRenderer content={detailedExplanation} baseTextSize="text-sm md:text-lg" />
        </Accordion>
        {detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
          <button
            onClick={() => onLoadDetailedExplanation(questionId, false)}
            className="mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg text-sm"
          >
            Regenerate Details
          </button>
        )}
      </>
    );
  }

  return (
    <button
      onClick={() => onLoadDetailedExplanation(questionId, false)}
      className="px-3 py-1.5 md:px-4 md:py-2 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-sm md:text-md font-semibold rounded-lg"
    >
      {typeof titleText === "string" ? titleText : "Load More Details"}
    </button>
  );
};
