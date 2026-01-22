import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { languageConfig, SupportedLanguage, supportedLanguages } from './index';

export interface UseLanguageReturn {
  language: SupportedLanguage;
  direction: 'ltr' | 'rtl';
  isRTL: boolean;
  setLanguage: (lang: SupportedLanguage) => void;
  t: ReturnType<typeof useTranslation>['t'];
  languageConfig: typeof languageConfig;
  supportedLanguages: typeof supportedLanguages;
}

export function useLanguage(): UseLanguageReturn {
  const { t, i18n } = useTranslation();

  const language = (supportedLanguages.includes(i18n.language as SupportedLanguage)
    ? i18n.language
    : 'en') as SupportedLanguage;

  const direction = languageConfig[language].dir;
  const isRTL = direction === 'rtl';

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
    },
    [i18n]
  );

  // Update HTML attributes when language changes
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('lang', language);
    html.setAttribute('dir', direction);
  }, [language, direction]);

  return {
    language,
    direction,
    isRTL,
    setLanguage,
    t,
    languageConfig,
    supportedLanguages,
  };
}

export default useLanguage;
