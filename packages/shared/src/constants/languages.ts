/**
 * Supported languages for content generation and subtitles.
 */
export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  direction: "ltr" | "rtl";
}

export const CONTENT_LANGUAGES: LanguageOption[] = [
  { code: "auto", label: "Auto-detect", nativeLabel: "Auto", direction: "ltr" },
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", direction: "rtl" },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", direction: "ltr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", direction: "ltr" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", direction: "ltr" },
  { code: "ru", label: "Russian", nativeLabel: "Русский", direction: "ltr" },
  { code: "zh", label: "Chinese", nativeLabel: "中文", direction: "ltr" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", direction: "ltr" },
  { code: "ko", label: "Korean", nativeLabel: "한국어", direction: "ltr" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", direction: "ltr" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", direction: "ltr" },
  { code: "it", label: "Italian", nativeLabel: "Italiano", direction: "ltr" },
  { code: "nl", label: "Dutch", nativeLabel: "Nederlands", direction: "ltr" },
  { code: "pl", label: "Polish", nativeLabel: "Polski", direction: "ltr" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", direction: "ltr" },
  { code: "th", label: "Thai", nativeLabel: "ไทย", direction: "ltr" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt", direction: "ltr" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", direction: "rtl" },
  { code: "fa", label: "Persian", nativeLabel: "فارسی", direction: "rtl" },
  { code: "he", label: "Hebrew", nativeLabel: "עברית", direction: "rtl" },
];

export type LanguageCode = typeof CONTENT_LANGUAGES[number]["code"];

/**
 * Legacy: Supported languages for subtitle translation.
 * @deprecated Use CONTENT_LANGUAGES instead
 */
export const LANGUAGES = [
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Chinese",
  "Hindi",
  "Italian",
  "Portuguese",
  "English",
  "Arabic",
] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * Get the full language name from a language code.
 * Used for explicit language directives in AI prompts.
 */
export function getLanguageName(code: LanguageCode): string {
  const lang = CONTENT_LANGUAGES.find(l => l.code === code);
  return lang?.label || "the same language as the input";
}
