import React from 'react';
import Accordion from './Accordion';
import MemoizedMarkdownRenderer from './MarkdownRenderer';
import { Icons } from '../constants';

interface DetailedExplanationSectionProps {
    questionId: string;
    isDetailedExplanationLoading?: boolean;
    detailedExplanation?: string;
    onLoadDetailedExplanation: (questionId: string) => void;
    title: React.ReactNode;
    accordionKeyPrefix: string;
    baseTextSize?: string;
    buttonSizeClass?: string;
}

const DetailedExplanationSection: React.FC<DetailedExplanationSectionProps> = ({
    questionId,
    isDetailedExplanationLoading,
    detailedExplanation,
    onLoadDetailedExplanation,
    title,
    accordionKeyPrefix,
    baseTextSize = "text-sm md:text-lg",
    buttonSizeClass = "px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-md bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white"
}) => {
    return (
        <div className="mt-2 md:mt-3">
            {isDetailedExplanationLoading ? (
                <div className="flex items-center text-brand-blue dark:text-blue-400">
                    <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400"/>
                    <span className="ml-2 text-md md:text-lg">Loading more details...</span>
                </div>
            ) : detailedExplanation ? (
                <>
                    <Accordion
                        key={`${accordionKeyPrefix}-${questionId}${detailedExplanation && !detailedExplanation.startsWith("Error:") ? '-success' : '-fail-or-pending'}`}
                        title={title}
                        startOpen={!!detailedExplanation && !isDetailedExplanationLoading && !detailedExplanation.startsWith("Error:")}
                    >
                        <MemoizedMarkdownRenderer content={detailedExplanation} baseTextSize={baseTextSize} />
                    </Accordion>
                    {detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
                        <button
                            onClick={() => onLoadDetailedExplanation(questionId)}
                            className="mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg text-sm"
                        >
                            Regenerate Details
                        </button>
                    )}
                </>
            ) : (
                <button
                    onClick={() => onLoadDetailedExplanation(questionId)}
                    className={`${buttonSizeClass} font-semibold rounded-lg`}
                >
                    Load More Details
                </button>
            )}
        </div>
    );
};

export default DetailedExplanationSection;
