import React, { useState, useEffect } from 'react';
import { ExamConfiguration } from '../types';
import { Icons } from '../constants';

interface ExamConfigViewProps {
  moduleTitle: string;
  onSubmit: (config: ExamConfiguration) => void;
  isLoading: boolean;
  initialConfig?: Partial<ExamConfiguration> | null; 
}

const ExamConfigView: React.FC<ExamConfigViewProps> = ({
  moduleTitle,
  onSubmit,
  isLoading,
  initialConfig,
}) => {
  const [numMultipleChoice, setNumMultipleChoice] = useState(initialConfig?.numMultipleChoice ?? 10); // Default to 10 MCQs
  const [difficulty, setDifficulty] = useState(initialConfig?.difficulty ?? 3); // 1-5
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(initialConfig?.timeLimitEnabled ?? false);
  const [durationMinutes, setDurationMinutes] = useState(initialConfig?.durationMinutes ?? 30);

  useEffect(() => {
    if (initialConfig) {
        setNumMultipleChoice(initialConfig.numMultipleChoice ?? 10);
        setDifficulty(initialConfig.difficulty ?? 3);
        setTimeLimitEnabled(initialConfig.timeLimitEnabled ?? false);
        setDurationMinutes(initialConfig.durationMinutes ?? 30);
    }
  }, [initialConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: ExamConfiguration = {
      moduleId: moduleTitle.replace(/\s+/g, '-').toLowerCase(), 
      moduleTitle,
      numMultipleChoice,
      difficulty,
      timeLimitEnabled,
      durationMinutes: timeLimitEnabled ? durationMinutes : undefined,
    };
    onSubmit(config);
  };

  return (
    <div className="p-4 md:p-6 bg-brand-white dark:bg-brand-black rounded-lg shadow-xl border border-brand-mediumGray dark:border-gray-700">
      <h3 className="text-2xl sm:text-3xl font-bold text-brand-blue dark:text-blue-300 mb-4 md:mb-6">
        Configure Exam for: <span className="text-brand-orange dark:text-orange-400">{moduleTitle}</span>
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
        <div>
          <label htmlFor="numMC" className="block text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">Number of Multiple Choice Questions</label>
          <input type="number" id="numMC" value={numMultipleChoice} onChange={e => setNumMultipleChoice(Math.max(0, parseInt(e.target.value)))} min="0" className="w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100" />
        </div>
        <div>
          <label htmlFor="difficulty" className="block text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">Difficulty (1-Easy to 5-Hard)</label>
          <select id="difficulty" value={difficulty} onChange={e => setDifficulty(parseInt(e.target.value))} className="w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100 appearance-none">
            {[1,2,3,4,5].map(d => <option key={d} value={d}>{d} ({d===1?'Easy':d===2?'Med-Easy':d===3?'Medium':d===4?'Med-Hard': 'Hard'})</option>)}
          </select>
        </div>
        <div className="flex items-center">
            <input type="checkbox" id="timeLimitEnabled" checked={timeLimitEnabled} onChange={e => setTimeLimitEnabled(e.target.checked)} className="h-4 w-4 text-brand-blue dark:accent-blue-500 border-brand-mediumGray dark:border-gray-600 rounded focus:ring-brand-blue" />
            <label htmlFor="timeLimitEnabled" className="ml-2 text-sm font-medium text-brand-blue dark:text-blue-300">Enable Time Limit?</label>
        </div>
        {timeLimitEnabled && (
            <div>
                <label htmlFor="durationMinutes" className="block text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">Exam Duration (minutes)</label>
                <input type="number" id="durationMinutes" value={durationMinutes} onChange={e => setDurationMinutes(Math.max(1, parseInt(e.target.value)))} min="1" className="w-full p-2 border border-brand-mediumGray dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100" />
            </div>
        )}
        <button type="submit" disabled={isLoading || (numMultipleChoice === 0)} className="w-full mt-4 px-4 py-2.5 bg-brand-green hover:bg-green-700 text-brand-white font-semibold rounded-lg shadow-md disabled:opacity-50 flex items-center justify-center">
          {isLoading ? <><Icons.LoadingAnimatedIcon className="animate-spin h-5 w-5 mr-2" /> Generating Exam...</> : <><Icons.Sparkles className="w-5 h-5 mr-2" /> Generate & Start Exam</>}
        </button>
      </form>
    </div>
  );
};

export default ExamConfigView;