import React from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/i18n/useLanguage';
import { SupportedLanguage } from '@/i18n/index';
import { cn } from '@/lib/utils';

export interface LanguageSwitcherProps {
  variant?: 'icon' | 'dropdown' | 'toggle';
  className?: string;
}

/**
 * LanguageSwitcher component for toggling between Arabic and English.
 * Supports three variants:
 * - icon: Shows only a globe icon with dropdown
 * - dropdown: Shows current language with dropdown
 * - toggle: Simple toggle button between languages
 * 
 * Requirements: 9.2 - Add ARIA labels for navigation elements
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'dropdown',
  className,
}) => {
  const { language, setLanguage, t, languageConfig, supportedLanguages, isRTL } = useLanguage();

  const currentConfig = languageConfig[language];

  // Toggle variant - simple button that switches between languages
  if (variant === 'toggle') {
    const nextLanguage: SupportedLanguage = language === 'en' ? 'ar' : 'en';
    const nextConfig = languageConfig[nextLanguage];

    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLanguage(nextLanguage)}
        className={cn(
          'gap-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] focus:ring-2 focus:ring-primary/50',
          className
        )}
        aria-label={t('a11y.languageSwitch')}
      >
        <span className="text-base" aria-hidden="true">{nextConfig.flag}</span>
        <span className="text-sm font-medium">{nextConfig.name}</span>
      </Button>
    );
  }

  // Icon variant - globe icon with dropdown
  if (variant === 'icon') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 w-9 rounded-lg focus:ring-2 focus:ring-primary/50',
              className
            )}
            aria-label={t('a11y.languageSwitch')}
            aria-haspopup="menu"
          >
            <Globe size={18} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="min-w-[140px]" role="menu">
          {supportedLanguages.map((lang) => {
            const config = languageConfig[lang];
            const isActive = language === lang;
            return (
              <DropdownMenuItem
                key={lang}
                onClick={() => setLanguage(lang)}
                className={cn(
                  'gap-2 cursor-pointer',
                  isActive && 'bg-accent'
                )}
                role="menuitemradio"
                aria-checked={isActive}
                aria-current={isActive ? 'true' : undefined}
              >
                <span className="text-base" aria-hidden="true">{config.flag}</span>
                <span>{config.name}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default dropdown variant - shows current language with dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'gap-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 px-3 rounded-lg focus:ring-2 focus:ring-primary/50',
            className
          )}
          aria-label={`${t('a11y.currentLanguage', { language: currentConfig.name })}. ${t('a11y.languageSwitch')}`}
          aria-haspopup="menu"
        >
          <span className="text-base" aria-hidden="true">{currentConfig.flag}</span>
          <span className="text-sm font-medium hidden sm:inline">{currentConfig.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="min-w-[140px]" role="menu">
        {supportedLanguages.map((lang) => {
          const config = languageConfig[lang];
          const isActive = language === lang;
          return (
            <DropdownMenuItem
              key={lang}
              onClick={() => setLanguage(lang)}
              className={cn(
                'gap-2 cursor-pointer',
                isActive && 'bg-accent'
              )}
              role="menuitemradio"
              aria-checked={isActive}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="text-base" aria-hidden="true">{config.flag}</span>
              <span>{config.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
