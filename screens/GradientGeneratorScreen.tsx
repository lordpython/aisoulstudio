/**
 * Gradient Generator Screen - CSS gradient creation tool
 * Provides a full-screen interface for creating and exporting CSS gradients
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Palette, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { GradientGenerator } from '@/components/gradient-generator';

export default function GradientGeneratorScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();

  return (
    <ScreenLayout
      title={t('nav.gradientGenerator') || 'Gradient Generator'}
      showBackButton
      onBack={() => navigate('/')}
      maxWidth="full"
      contentClassName="py-6"
    >
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className={cn('flex items-center justify-center gap-3 mb-4', isRTL && 'flex-row-reverse')}>
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Palette className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <div className={cn('text-left', isRTL && 'text-right')}>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {t('nav.gradientGenerator') || 'Gradient Generator'}
            </h1>
            <p className="text-sm text-white/60">
              Create beautiful CSS gradients with ease
            </p>
          </div>
        </div>
      </motion.div>

      {/* Gradient Generator Component */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GradientGenerator
          showPresets={true}
          showExportPanel={true}
          maxColorStops={10}
          minColorStops={2}
          enableAnimation={false}
        />
      </motion.div>

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-8 text-center text-sm text-white/40"
      >
        <div className={cn('flex items-center justify-center gap-2', isRTL && 'flex-row-reverse')}>
          <Sparkles className="w-4 h-4" />
          <span>Create, customize, and export CSS gradients for your projects</span>
        </div>
      </motion.div>
    </ScreenLayout>
  );
}
