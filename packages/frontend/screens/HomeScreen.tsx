/**
 * Home Screen - Landing page with creation mode selection
 * Requirements: 1.1, 1.2 - Display Home screen as default with 3 main screens
 * Requirements: 7.1, 7.2 - Display max 3 creation mode cards and navigate on selection
 * Requirements: 9.1 - Use semantic HTML elements (nav, main, header, footer)
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, Music, AudioWaveform, Film } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';
import { ForwardChevron } from '@/components/layout/DirectionalIcon';
import {
  staggerContainer,
  staggerItem,
} from '@/lib/cinematicMotion';

// Creation mode card data with cinematic palette
const CREATION_MODES = [
  {
    id: 'video' as const,
    titleKey: 'home.createVideo',
    descKey: 'home.createVideoDesc',
    featuresKey: 'home.features.video',
    icon: Video,
    accentColor: 'var(--cinema-spotlight)',
    accentGlow: 'var(--glow-spotlight)',
    route: '/studio?mode=video',
  },
  {
    id: 'music' as const,
    titleKey: 'home.createMusic',
    descKey: 'home.createMusicDesc',
    featuresKey: 'home.features.music',
    icon: Music,
    accentColor: 'var(--cinema-editorial)',
    accentGlow: 'var(--glow-velvet)',
    route: '/studio?mode=music',
  },
  {
    id: 'visualizer' as const,
    titleKey: 'home.visualizer',
    descKey: 'home.visualizerDesc',
    featuresKey: 'home.features.visualizer',
    icon: AudioWaveform,
    accentColor: 'var(--primary)',
    accentGlow: 'var(--glow-primary)',
    route: '/visualizer',
  },
];

export default function HomeScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);

  // Focus main content on navigation (Requirement 9.4)
  useEffect(() => {
    const timer = setTimeout(() => {
      mainContentRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleModeSelect = (route: string) => {
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden flex flex-col">
      {/* Cinematic background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full blur-[180px] opacity-20"
          style={{ background: 'var(--cinema-spotlight)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[15%] w-[500px] h-[500px] rounded-full blur-[160px] opacity-10"
          style={{ background: 'var(--primary)' }}
        />
        <div
          className="absolute top-[40%] right-[5%] w-[300px] h-[300px] rounded-full blur-[120px] opacity-8"
          style={{ background: 'var(--cinema-velvet)' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <div className="p-4 md:p-6">
          <Header />
        </div>

        {/* Main Content */}
        <main
          id="main-content"
          ref={mainContentRef}
          className="flex-1 flex items-center justify-center p-4 md:p-6"
          tabIndex={-1}
          aria-label={t('home.title')}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-5xl w-full"
          >
            {/* Title Block */}
            <div className={cn('text-center mb-12 md:mb-16', isRTL && 'rtl')}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-center gap-3 mb-6"
              >
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--cinema-spotlight), oklch(0.65 0.12 70))',
                    boxShadow: '0 4px 24px var(--glow-spotlight)',
                  }}
                >
                  <Film className="w-6 h-6 md:w-7 md:h-7 text-[var(--cinema-void)]" aria-hidden="true" />
                </div>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="heading-hero mb-4"
              >
                {t('home.title')}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="text-body-editorial max-w-2xl mx-auto"
              >
                {t('home.subtitle')}
              </motion.p>
            </div>

            {/* Mode Cards */}
            <nav aria-label={t('a11y.mainNav')}>
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6"
                role="list"
              >
                {CREATION_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const features = t(mode.featuresKey, { returnObjects: true }) as string[];
                  return (
                    <motion.button
                      key={mode.id}
                      variants={staggerItem}
                      onClick={() => handleModeSelect(mode.route)}
                      whileHover={{ y: -6, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'group relative surface-card p-6 md:p-7 text-start',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cinema-spotlight)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isRTL && 'text-right'
                      )}
                      style={{
                        ['--card-accent' as string]: mode.accentColor,
                      }}
                      aria-label={`${t(mode.titleKey)} - ${t(mode.descKey)}`}
                      role="listitem"
                    >
                      {/* Top accent line */}
                      <div
                        className="absolute top-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ background: `linear-gradient(90deg, transparent, ${mode.accentColor}, transparent)` }}
                      />

                      {/* Icon */}
                      <div
                        className="w-11 h-11 rounded-lg flex items-center justify-center mb-5 transition-all duration-300 group-hover:shadow-lg"
                        style={{
                          background: `color-mix(in oklch, ${mode.accentColor}, transparent 88%)`,
                          border: `1px solid color-mix(in oklch, ${mode.accentColor}, transparent 75%)`,
                        }}
                        aria-hidden="true"
                      >
                        <Icon
                          className="w-5 h-5 transition-colors duration-300"
                          style={{ color: mode.accentColor }}
                        />
                      </div>

                      {/* Title & Description */}
                      <h3 className="heading-card mb-2 transition-colors duration-300">
                        {t(mode.titleKey)}
                      </h3>
                      <p className="text-body-editorial text-sm mb-5 leading-relaxed">
                        {t(mode.descKey)}
                      </p>

                      {/* Features */}
                      <div
                        className={cn('flex flex-wrap gap-2', isRTL && 'justify-end')}
                        aria-label="Features"
                      >
                        {Array.isArray(features) &&
                          features.map((feature: string, i: number) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 text-[11px] font-editorial font-medium rounded-md transition-colors duration-200"
                              style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: 'oklch(0.70 0.02 60)',
                              }}
                            >
                              {feature}
                            </span>
                          ))}
                      </div>

                      {/* Arrow indicator */}
                      <div
                        className={cn(
                          'absolute top-7 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1',
                          isRTL ? 'left-6 group-hover:-translate-x-1' : 'right-6'
                        )}
                        aria-hidden="true"
                      >
                        <ForwardChevron size={18} className="text-[var(--cinema-silver)]/60" />
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            </nav>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="p-4 md:p-6 text-center">
          <span className="text-caption-mono">
            Powered by Gemini AI & Suno
          </span>
        </footer>
      </div>
    </div>
  );
}
