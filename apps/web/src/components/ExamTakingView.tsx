import React, { useState, useEffect } from 'react';
import { ExamQuestion, ExamQuestionType } from '../types';
import { Icons } from '../constants';
import MemoizedMarkdownRenderer from './MarkdownRenderer';

interface ExamTakingViewProps {
  question: ExamQuestion;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (questionId: string, answer: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  timeLeft: number;
  timeLimitEnabled: boolean;
  examModuleTitle: string;
}

const ExamTakingView: React.FC<ExamTakingViewProps> = ({
  question,
  questionIndex,
  totalQuestions,
  onAnswer,
  onNext,
  onPrev,
  onSubmit,
  timeLeft,
  timeLimitEnabled,
  examModuleTitle,
}) => {
  const [currentAnswer, setCurrentAnswer] = useState(question.userAnswer || '');

  useEffect(() => {
    setCurrentAnswer(question.userAnswer || '');
  }, [question]);

  const handleAnswerChange = (value: string) => {
    setCurrentAnswer(value);
    onAnswer(question.id, value);
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-3 md:mb-4">
        <h3 className="text-xl sm:text-2xl font-bold text-brand-blue dark:text-blue-300 mb-1 sm:mb-0">
          Exam: {examModuleTitle}
        </h3>
        {timeLimitEnabled && (
          <div className="text-lg font-semibold text-brand-orange dark:text-orange-400">
            Time Left: {formatTime(timeLeft)}
          </div>
        )}
      </div>
      <p className="text-md md:text-lg font-medium text-brand-black/80 dark:text-gray-300 mb-4">
        Question {questionIndex + 1} of {totalQuestions} (Max Points: {question.maxPoints})
      </p>
      
      <div className="mb-4 md:mb-6 p-3 md:p-4 border border-brand-mediumGray dark:border-gray-600 rounded-md bg-brand-lightGray/50 dark:bg-gray-700/50">
        <MemoizedMarkdownRenderer content={question.questionText} baseTextSize="text-lg md:text-xl" />
      </div>

      {question.type === 'multiple-choice' && question.options && (
        <div className="space-y-2 md:space-y-3">
          {question.options.map((option, i) => (
            <label key={i} className="flex items-center p-2.5 md:p-3 bg-brand-white dark:bg-gray-700 hover:bg-brand-mediumGray dark:hover:bg-gray-600 rounded-md cursor-pointer transition-colors border border-brand-mediumGray dark:border-gray-600 text-sm md:text-base">
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={currentAnswer === option}
                onChange={() => handleAnswerChange(option)}
                className="form-radio h-4 w-4 md:h-5 md:w-5 text-brand-blue dark:accent-blue-500 bg-brand-white dark:bg-gray-600 border-brand-mediumGray dark:border-gray-500 focus:ring-brand-blue dark:focus:ring-blue-500"
              />
              <span className="ml-2 md:ml-3 text-brand-black dark:text-gray-200">{option}</span>
            </label>
          ))}
        </div>
      )}

      {/* Short answer section removed as it's no longer a supported type */}
      {/* 
      {question.type === 'short-answer' && (
        <div>
          <textarea
            rows={5}
            value={currentAnswer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full p-2 md:p-3 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100 text-sm md:text-base"
          />
        </div>
      )}
      */}

      <div className="flex flex-col sm:flex-row justify-between items-center mt-6 md:mt-8 space-y-2 sm:space-y-0 sm:space-x-3">
        <button
          onClick={onPrev}
          disabled={questionIndex === 0}
          className="w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg disabled:opacity-50 text-sm md:text-base"
        >
          Previous
        </button>
        {questionIndex < totalQuestions - 1 ? (
          <button
            onClick={onNext}
            className="w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg text-sm md:text-base"
          >
            Next
          </button>
        ) : (
          <button
            onClick={onSubmit}
            className="w-full sm:w-auto px-4 py-2 md:px-6 md:py-3 bg-brand-green hover:bg-green-700 text-brand-white font-semibold rounded-lg text-sm md:text-base"
          >
            Submit Exam
          </button>
        )}
      </div>
    </div>
  );
};

export default ExamTakingView;