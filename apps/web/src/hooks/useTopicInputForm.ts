import { useState, useEffect } from 'react';

export const commonLanguages = [
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'ko', name: '한국어 (Korean)' },
  { code: 'zh', name: '中文 (Mandarin Chinese)' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'pt', name: 'Português (Portuguese)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'other', name: 'Other (Specify)' }
];

export function useTopicInputForm({
  initialTopic = '',
  initialLanguage = 'Bahasa Indonesia',
  onSubmit
}: {
  initialTopic?: string;
  initialLanguage?: string;
  onSubmit: (topic: string, targetLanguage: string) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);

  const findLangCode = (langName: string) => {
    const found = commonLanguages.find(l => l.name === langName);
    if (found) return found.code;
    if (langName && commonLanguages.every(l => l.name !== langName)) return 'other';
    return 'id';
  };

  const [selectedLanguageCode, setSelectedLanguageCode] = useState<string>(() => findLangCode(initialLanguage));
  const [customLanguageInput, setCustomLanguageInput] = useState<string>(() =>
    findLangCode(initialLanguage) === 'other' ? initialLanguage : ''
  );

  useEffect(() => {
    setTopic(initialTopic);
    const langCode = findLangCode(initialLanguage);
    setSelectedLanguageCode(langCode);
    setCustomLanguageInput(langCode === 'other' ? initialLanguage : '');
  }, [initialTopic, initialLanguage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) {
      let finalTargetLanguage = '';
      if (selectedLanguageCode === 'other') {
        finalTargetLanguage = customLanguageInput.trim();
      } else {
        const selectedLangObj = commonLanguages.find(lang => lang.code === selectedLanguageCode);
        finalTargetLanguage = selectedLangObj ? selectedLangObj.name : 'Bahasa Indonesia';
      }
      if (!finalTargetLanguage && selectedLanguageCode !== 'other') {
        finalTargetLanguage = 'Bahasa Indonesia';
      }
      onSubmit(topic.trim(), finalTargetLanguage);
    }
  };

  return {
    topic,
    setTopic,
    selectedLanguageCode,
    setSelectedLanguageCode,
    customLanguageInput,
    setCustomLanguageInput,
    handleSubmit
  };
}
