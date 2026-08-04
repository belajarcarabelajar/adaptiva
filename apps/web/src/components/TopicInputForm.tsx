import React, { memo } from 'react';
import { APP_TITLE, Icons } from '../constants';
import { useTopicInputForm, commonLanguages } from '../hooks/useTopicInputForm';

interface TopicInputFormProps {
  onSubmit: (topic: string, targetLanguage: string) => void;
  isLoading: boolean;
  initialTopic?: string;
  initialLanguage?: string;
}

function TopicInputFormInternal({ onSubmit, isLoading, initialTopic = '', initialLanguage = 'Bahasa Indonesia' }: TopicInputFormProps) {
  const {
    topic,
    setTopic,
    selectedLanguageCode,
    setSelectedLanguageCode,
    customLanguageInput,
    setCustomLanguageInput,
    handleSubmit
  } = useTopicInputForm({ initialTopic, initialLanguage, onSubmit });

  return (
    <div className="max-w-2xl w-full mx-auto p-4 sm:p-6 md:p-8 bg-brand-white dark:bg-brand-black rounded-xl shadow-2xl border border-brand-mediumGray dark:border-gray-700">
      <div className="flex items-center justify-center mb-4 md:mb-6">
        <Icons.AcademicCap className="w-7 h-7 md:w-8 md:h-8 text-brand-blue dark:text-blue-400" />
        <h1 className="text-3xl md:text-4xl font-bold text-brand-blue dark:text-blue-400 ml-2 md:ml-3">{APP_TITLE}</h1>
      </div>
      <p className="text-brand-black/80 dark:text-gray-300 mb-4 md:mb-6 text-center text-md md:text-lg">
        Enter a topic you want to learn and let {APP_TITLE} craft your personalized learning journey!
      </p>
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
        <div>
          <label htmlFor="topic" className="block text-xs sm:text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">
            Topic/Skill to Learn
          </label>
          <input
            type="text"
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Quantum Physics, React Development"
            className="w-full px-3 py-2 md:px-4 md:py-3 bg-brand-white dark:bg-gray-700 border border-brand-mediumGray dark:border-gray-600 rounded-lg text-brand-black dark:text-gray-100 focus:ring-2 focus:ring-brand-blue dark:focus:ring-blue-500 focus:border-brand-blue dark:focus:border-blue-500 outline-none transition-colors text-md md:text-lg"
            required
          />
        </div>
        
        <div>
          <label htmlFor="targetLanguage" className="block text-xs sm:text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">
            Target Language (Content & Tutor)
          </label>
          <select
            id="targetLanguage"
            value={selectedLanguageCode}
            onChange={(e) => {
              setSelectedLanguageCode(e.target.value);
              if (e.target.value !== 'other') {
                setCustomLanguageInput(''); 
              }
            }}
            className="w-full px-3 py-2 md:px-4 md:py-3 bg-brand-white dark:bg-gray-700 border border-brand-mediumGray dark:border-gray-600 rounded-lg text-brand-black dark:text-gray-100 focus:ring-2 focus:ring-brand-blue dark:focus:ring-blue-500 focus:border-brand-blue dark:focus:border-blue-500 outline-none appearance-none transition-colors text-md md:text-lg"
          >
            {commonLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {selectedLanguageCode === 'other' && (
          <div>
            <label htmlFor="customTargetLanguage" className="block text-xs sm:text-sm font-medium text-brand-blue dark:text-blue-300 mb-1">
              Specify Language Name
            </label>
            <input
              type="text"
              id="customTargetLanguage"
              value={customLanguageInput}
              onChange={(e) => setCustomLanguageInput(e.target.value)}
              placeholder="Enter target language name (e.g., Swahili)"
              className="w-full px-3 py-2 md:px-4 md:py-3 bg-brand-white dark:bg-gray-700 border border-brand-mediumGray dark:border-gray-600 rounded-lg text-brand-black dark:text-gray-100 focus:ring-2 focus:ring-brand-blue dark:focus:ring-blue-500 focus:border-brand-blue dark:focus:border-blue-500 outline-none transition-colors text-md md:text-lg"
              required={selectedLanguageCode === 'other'}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !topic.trim() || (selectedLanguageCode === 'other' && !customLanguageInput.trim())}
          className="w-full flex items-center justify-center px-4 py-2.5 md:px-6 md:py-3 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 text-md md:text-lg"
        >
          {isLoading ? (
            <>
              <Icons.LoadingAnimatedIcon className="animate-spin h-5 w-5 text-brand-white" />
              <span className="ml-2">Generating...</span>
            </>
          ) : (
            <> <Icons.Sparkles className="w-5 h-5 md:w-6 md:h-6 text-brand-white" /> <span className="ml-2">Start Learning Journey</span></>
          )}
        </button>
      </form>
    </div>
  );
};
const MemoizedTopicInputForm = memo(TopicInputFormInternal);
export default MemoizedTopicInputForm;
