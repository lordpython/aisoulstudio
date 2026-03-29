import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { Video, Music, AudioWaveform, ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';
import { Header } from '@/components/layout/Header';

const CREATION_MODES = [
  {
    id: 'video' as const,
    titleKey: 'home.createVideo',
    descKey: 'home.createVideoDesc',
    featuresKey: 'home.features.video',
    icon: Video,
    image: '/assets/mode-video.jpg',
    gradient: 'linear-gradient(155deg, oklch(0.45 0.16 55) 0%, oklch(0.22 0.10 35) 60%, oklch(0.07 0.02 240) 100%)',
    glowColor: 'oklch(0.75 0.18 60)',
    glowRgb: '230, 160, 60',
    accentColor: 'oklch(0.82 0.16 75)',
    route: '/studio?mode=video',
  },
  {
    id: 'music' as const,
    titleKey: 'home.createMusic',
    descKey: 'home.createMusicDesc',
    featuresKey: 'home.features.music',
    icon: Music,
    image: '/assets/mode-music.jpg',
    gradient: 'linear-gradient(155deg, oklch(0.38 0.20 320) 0%, oklch(0.22 0.14 290) 60%, oklch(0.07 0.02 240) 100%)',
    glowColor: 'oklch(0.65 0.25 310)',
    glowRgb: '190, 60, 210',
    accentColor: 'oklch(0.78 0.20 330)',
    route: '/studio?mode=music',
  },
  {
    id: 'visualizer' as const,
    titleKey: 'home.visualizer',
    descKey: 'home.visualizerDesc',
    featuresKey: 'home.features.visualizer',
    icon: AudioWaveform,
    image: '/assets/hero-bg.jpg',
    gradient: 'linear-gradient(135deg, oklch(0.55 0.20 200) 0%, oklch(0.30 0.15 220) 60%, oklch(0.08 0.02 240) 100%)',
    glowColor: 'oklch(0.70 0.18 195)',
    glowRgb: '40, 195, 210',
    accentColor: 'oklch(0.80 0.16 190)',
    route: '/visualizer',
  },
];

export default function HomeScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => mainContentRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden flex flex-col">

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.18 0.06 240 / 0.6) 0%, transparent 70%)',
          }}
        />
        <div className="absolute top-[-15%] left-[5%] w-[700px] h-[700px] rounded-full opacity-[0.07]"
          style={{ background: 'var(--cinema-spotlight)', filter: 'blur(200px)' }}
        />
        <div className="absolute bottom-[-20%] right-[10%] w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: 'var(--primary)', filter: 'blur(180px)' }}
        />
        <div className="absolute top-[35%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: 'oklch(0.60 0.25 310)', filter: 'blur(140px)' }}
        />
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage: 'linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <Header />

        {/* Main */}
        <main
          id="main-content"
          ref={mainContentRef}
          className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-4"
          tabIndex={-1}
          aria-label={t('home.title')}
        >
          <div className="w-full max-w-6xl">

            {/* Hero block — always centered */}
            <motion.div
              className="mb-10 md:mb-12 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Badge */}
              <motion.div
                className="inline-flex items-center gap-2 mb-5"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                  style={{
                    background: 'oklch(0.70 0.15 190 / 0.07)',
                    borderColor: 'oklch(0.70 0.15 190 / 0.22)',
                  }}
                >
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                  <span className="text-[10px] font-code font-medium tracking-widest uppercase"
                    style={{ color: 'var(--primary)' }}>
                    AI-Powered Studio
                  </span>
                </div>
              </motion.div>

              <motion.h1
                className="heading-hero mb-3"
                style={{ lineHeight: 1.05 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('home.title')}
              </motion.h1>

              <motion.p
                className="text-body-editorial max-w-lg mx-auto"
                style={{ color: 'oklch(0.55 0.03 240)' }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('home.subtitle')}
              </motion.p>
            </motion.div>

            {/* Mode Cards */}
            <nav aria-label={t('a11y.mainNav')}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5" role="list">
                {CREATION_MODES.map((mode, idx) => {
                  const Icon = mode.icon;
                  const features = t(mode.featuresKey, { returnObjects: true }) as string[];
                  return (
                    <BlurFade key={mode.id} delay={0.2 + idx * 0.1}>
                    <motion.button
                      onClick={() => navigate(mode.route)}
                      whileHover={{ y: -5, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'group relative overflow-hidden rounded-2xl text-start',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isRTL && 'text-right'
                      )}
                      style={{ focusVisibleRingColor: mode.accentColor } as React.CSSProperties}
                      aria-label={`${t(mode.titleKey)} — ${t(mode.descKey)}`}
                      role="listitem"
                    >
                      {/* Card shell */}
                      <div
                        className="relative h-[280px] md:h-[310px] flex flex-col justify-end overflow-hidden"
                        style={{
                          border: '1px solid oklch(1 0 0 / 0.08)',
                          borderRadius: '1rem',
                          background: 'oklch(0.09 0.02 240)',
                        }}
                      >
                        {/* Visual zone — image or gradient */}
                        <div className="absolute inset-0">
                          {mode.image ? (
                            <img
                              src={mode.image}
                              alt=""
                              aria-hidden="true"
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-75 transition-opacity duration-700"
                              onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                el.style.display = 'none';
                                const parent = el.parentElement;
                                if (parent) {
                                  parent.style.background = mode.gradient;
                                }
                              }}
                            />
                          ) : null}
                          {/* Gradient overlay always present */}
                          <div
                            className="absolute inset-0 transition-opacity duration-500"
                            style={{ background: mode.gradient, opacity: mode.image ? 0.30 : 1 }}
                          />
                          {/* Bottom fade to dark for content readability */}
                          <div
                            className="absolute inset-0"
                            style={{
                              background: 'linear-gradient(to top, oklch(0.06 0.02 240) 0%, oklch(0.06 0.02 240 / 0.7) 40%, transparent 100%)',
                            }}
                          />
                        </div>

                        {/* Hover glow border */}
                        <div
                          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{
                            boxShadow: `inset 0 0 0 1px rgba(${mode.glowRgb}, 0.4), 0 0 40px -10px rgba(${mode.glowRgb}, 0.35)`,
                          }}
                        />

                        {/* Icon — top right, floating */}
                        <div
                          className="absolute top-5 right-5 w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                          style={{
                            background: `rgba(${mode.glowRgb}, 0.15)`,
                            border: `1px solid rgba(${mode.glowRgb}, 0.3)`,
                            backdropFilter: 'blur(8px)',
                          }}
                        >
                          <Icon className="w-5 h-5" style={{ color: mode.accentColor }} />
                        </div>

                        {/* Content — bottom glass panel */}
                        <div className="relative z-10 p-5">
                          {/* Title */}
                          <h3
                            className="font-editorial font-semibold text-lg mb-1.5 leading-tight"
                            style={{ color: 'oklch(0.97 0 0)' }}
                          >
                            {t(mode.titleKey)}
                          </h3>

                          {/* Description */}
                          <p
                            className="text-sm mb-4 leading-relaxed"
                            style={{ color: 'oklch(0.72 0.02 240)' }}
                          >
                            {t(mode.descKey)}
                          </p>

                          {/* Feature pills */}
                          <div className={cn('flex flex-wrap gap-1.5', isRTL && 'justify-end')}>
                            {Array.isArray(features) && features.map((feature, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md text-[10px] font-code font-medium"
                                style={{
                                  background: `rgba(${mode.glowRgb}, 0.12)`,
                                  border: `1px solid rgba(${mode.glowRgb}, 0.2)`,
                                  color: mode.accentColor,
                                }}
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Arrow CTA */}
                        <div
                          className={cn(
                            'absolute top-5 transition-all duration-300',
                            'opacity-0 group-hover:opacity-100',
                            isRTL
                              ? 'left-5 -translate-x-1 group-hover:translate-x-0'
                              : 'left-5 translate-x-0'
                          )}
                        >
                          <div
                            className="flex items-center gap-1.5 text-[11px] font-code font-medium tracking-wider uppercase"
                            style={{ color: mode.accentColor }}
                          >
                            <span>Enter</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                    </motion.button>
                    </BlurFade>
                  );
                })}
              </div>
            </nav>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-4 md:p-6 text-center">
          <span className="text-caption-mono" style={{ color: 'oklch(0.35 0.02 240)' }}>
            Aisoul Studio
          </span>
        </footer>
      </div>
    </div>
  );
}
