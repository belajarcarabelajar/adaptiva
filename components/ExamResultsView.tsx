
import React from 'react';
import { ExamAttempt, ExamQuestion } from '../types';
import { Icons } from '../constants';
import Accordion from './Accordion';
import MemoizedMarkdownRenderer from './MarkdownRenderer';

interface ExamResultsViewProps {
  examAttempt: ExamAttempt;
  onRetake: () => void;
  onReviewQuestion: (questionIndex: number) => void; 
  onBack: () => void;
  onLoadDetailedExplanation: (questionId: string) => void;
}

const ExamResultsView: React.FC<ExamResultsViewProps> = ({
  examAttempt,
  onRetake,
  onReviewQuestion, 
  onBack,
  onLoadDetailedExplanation,
}) => {
  const percentageScore = examAttempt.maxScore > 0 
    ? Math.round((examAttempt.totalScore / examAttempt.maxScore) * 100) 
    : 0;

  return (
    <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
      <h3 className="text-2xl sm:text-3xl font-bold text-brand-blue dark:text-blue-300 mb-4">
        Exam Results: <span className="text-brand-orange dark:text-orange-400">{examAttempt.config.moduleTitle}</span>
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="p-3 md:p-4 bg-brand-lightGray dark:bg-gray-700 rounded-lg text-center">
            <p className="text-xl md:text-3xl font-bold text-brand-blue dark:text-blue-400">{examAttempt.totalScore} / {examAttempt.maxScore}</p>
            <p className="text-sm md:text-base text-brand-black/80 dark:text-gray-300">Overall Score</p>
        </div>
        <div className="p-3 md:p-4 bg-brand-lightGray dark:bg-gray-700 rounded-lg text-center">
            <p className="text-xl md:text-3xl font-bold text-brand-green dark:text-green-400">{percentageScore}%</p>
            <p className="text-sm md:text-base text-brand-black/80 dark:text-gray-300">Overall Percentage</p>
        </div>
      </div>

      <h4 className="text-xl md:text-2xl font-semibold text-brand-orange dark:text-orange-400 mb-2 md:mb-3">Review Your Answers:</h4>
      <div className="space-y-3">
        {examAttempt.questions.map((q, index) => (
          <Accordion 
            key={q.id}
            title={
              <div className={`flex items-center w-full ${q.isCorrect ? 'text-brand-green dark:text-green-400' : 'text-brand-red dark:text-red-400'}`}>
                 {q.isCorrect ? <Icons.CheckCircle className="w-4 h-4 md:w-5 md:h-5 mr-2" /> : <Icons.XCircle className="w-4 h-4 md:w-5 md:h-5 mr-2" />}
                <span className="font-semibold text-md md:text-lg text-brand-black dark:text-gray-200">{`Q${index + 1}: ${q.questionText.substring(0,60)}... (MC, ${q.scoreAwarded}/${q.maxPoints} pts)`}</span>
              </div>
            }
            startOpen={false} 
          >
            <p className="text-sm md:text-base mb-1"><strong>Question:</strong></p>
            <MemoizedMarkdownRenderer content={q.questionText} baseTextSize="text-sm md:text-base" />
            
            <p className="text-sm md:text-base mt-2 mb-1"><strong>Your Answer:</strong> {q.userAnswer || "Not answered"}</p>
            <p className="text-sm md:text-base mb-2"><strong>Correct Answer:</strong> {q.correctAnswer}</p>
            
            <h5 className="text-md md:text-lg font-semibold text-brand-blue dark:text-blue-400 mt-2 mb-1">Explanation:</h5>
            <MemoizedMarkdownRenderer content={q.explanation || "No explanation provided."} baseTextSize="text-sm md:text-base" />

            <div className="mt-2 md:mt-3">
              {q.isDetailedExplanationLoading ? (
                <div className="flex items-center text-brand-blue dark:text-blue-400">
                  <Icons.LoadingAnimatedIcon className="animate-spin h-4 w-4 md:h-5 md:h-5 text-brand-blue dark:text-blue-400"/> 
                  <span className="ml-2 text-sm md:text-md">Loading more details...</span>
                </div>
              ) : q.detailedExplanation ? (
                <Accordion 
                    key={`detail-accordion-exam-${q.id}${q.detailedExplanation && !q.detailedExplanation.startsWith("Error:") ? '-success' : '-fail-or-pending'}`}
                    title={<span className="text-md md:text-lg font-semibold text-brand-orange dark:text-orange-400">Further Details:</span>}
                    startOpen={!!q.detailedExplanation && !q.isDetailedExplanationLoading && !q.detailedExplanation.startsWith("Error:")}
                >
                    <MemoizedMarkdownRenderer content={q.detailedExplanation} baseTextSize="text-sm md:text-base" />
                     {q.detailedExplanation.includes("Failed to load detailed explanation (empty response).") && (
                        <button
                        onClick={() => onLoadDetailedExplanation(q.id)}
                        className="mt-2 px-3 py-1.5 bg-brand-yellow hover:bg-yellow-600 text-brand-black font-semibold rounded-lg text-xs"
                        >
                        Regenerate Details
                        </button>
                    )}
                </Accordion>
              ) : (
                <button
                  onClick={() => onLoadDetailedExplanation(q.id)}
                  className="px-3 py-1.5 md:px-4 md:py-2 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-xs md:text-sm font-semibold rounded-lg"
                >
                  Load More Details
                </button>
              )}
            </div>
          </Accordion>
        ))}
      </div>

      <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3">
        <button
          onClick={onRetake}
          className="w-full sm:w-auto px-4 py-2 md:px-5 md:py-2.5 bg-brand-orange hover:bg-[#D84315] dark:hover:bg-orange-600 text-brand-white text-md md:text-lg font-semibold rounded-lg"
        >
          Retake Exam (New Questions)
        </button>
        <button 
          onClick={onBack} 
          className="w-full sm:w-auto px-4 py-2 md:px-5 md:py-2.5 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white text-md md:text-lg font-semibold rounded-lg"
        >
          Back to Exam History
        </button>
      </div>
    </div>
  );
};

export default ExamResultsView;
