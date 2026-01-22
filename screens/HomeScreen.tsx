/**
 * Home Screen - Landing page with creation mode selection
 * Requirements: 1.1, 1.2 - Display Home screen as default with 3 main screens
 * Requirements: 7.1, 7.2 - Display max 3 creation mode cards and navigate on selection
 * Requirements: 9.1 - Use semantic HTML elements (nav, main, header, footer)
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Music, AudioWaveform, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { ForwardChevron } from '@/components/layout/DirectionalIcon';

// Creation mode card data
const CREATION_MODES = [
  {
    id: 'video' as const,
    titleKey: 'home.createVideo',
    descKey: 'home.createVideoDesc',
    icon: Video,
    color: 'from-violet-500 to-purple-600',
    route: '/studio?mode=video',
    features: ['AI Narration', 'Visual Generation', 'Background Music'],
  },
  {
    id: 'music' as const,
    titleKey: 'home.createMusic',
    descKey: 'home.createMusicDesc',
    icon: Music,
    color: 'from-pink-500 to-rose-600',
    route: '/studio?mode=music',
    features: ['Full Songs', 'Instrumentals', 'Custom Lyrics'],
  },
  {
    id: 'visualizer' as const,
    titleKey: 'home.visualizer',
    descKey: 'home.visualizerDesc',
    icon: AudioWaveform,
    color: 'from-cyan-500 to-blue-600',
    route: '/visualizer',
    features: ['Lyric Sync', 'Visual Effects', 'Custom Timing'],
  },
];

export default function HomeScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);

  // Focus main content on navigation (Requirement 9.4)
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      mainContentRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleModeSelect = (route: string) => {
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden flex flex-col">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header with language switcher - using semantic header element */}
        <div className="p-4 md:p-6">
          <Header />
        </div>

        {/* Main Content - using semantic main element with id for skip-to-content */}
        <main 
          id="main-content"
          ref={mainContentRef}
          className="flex-1 flex items-center justify-center p-4 md:p-6"
          tabIndex={-1}
          aria-label={t('home.title')}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl w-full"
          >
            {/* Title */}
            <div className={cn(
              "text-center mb-8 md:mb-12",
              isRTL && "rtl"
            )}>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-white" aria-hidden="true" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
                {t('home.title')}
              </h1>
              <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto">
                {t('home.subtitle')}
              </p>
            </div>

            {/* Mode Cards - 3 creation modes as per Requirement 7.1 */}
            <nav aria-label={t('a11y.mainNav')}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6" role="list">
                {CREATION_MODES.map((mode, index) => {
                  const Icon = mode.icon;
                  return (
                    <motion.button
                      key={mode.id}
                      onClick={() => handleModeSelect(mode.route)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ scale: 1.02, y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "group relative p-5 md:p-6 rounded-2xl text-start transition-all duration-300",
                        "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20",
                        "backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 focus:ring-offset-[#0a0a0f]",
                        isRTL && "text-right"
                      )}
                      aria-label={`${t(mode.titleKey)} - ${t(mode.descKey)}`}
                      role="listitem"
                    >
                      {/* Icon */}
                      <div className={cn(
                        "w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4",
                        mode.color
                      )} aria-hidden="true">
                        <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>

                      {/* Title & Description */}
                      <h3 className="text-lg md:text-xl font-semibold mb-2">
                        {t(mode.titleKey)}
                      </h3>
                      <p className="text-sm text-white/60 mb-4">
                        {t(mode.descKey)}
                      </p>

                      {/* Features */}
                      <div className={cn(
                        "flex flex-wrap gap-2",
                        isRTL && "justify-end"
                      )} aria-label="Features">
                        {mode.features.map((feature) => (
                          <span
                            key={feature}
                            className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/70"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>

                      {/* Arrow indicator - using DirectionalIcon */}
                      <div className={cn(
                        "absolute top-6 opacity-0 group-hover:opacity-100 transition-opacity",
                        isRTL ? "left-6" : "right-6"
                      )} aria-hidden="true">
                        <ForwardChevron size={20} className="text-white/60" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </nav>
          </motion.div>
        </main>

        {/* Footer - using semantic footer element */}
        <footer className="p-4 md:p-6 text-center text-sm text-white/40">
          Powered by Gemini AI & Suno
        </footer>
      </div>
    </div>
  );
}
