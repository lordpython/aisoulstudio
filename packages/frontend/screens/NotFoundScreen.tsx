/**
 * NotFound Screen - 404 error page for invalid routes
 * Requirements: 5.1 - Display NotFound page for invalid routes
 * Requirements: 5.2, 5.3, 5.4 - Display 404 message, home button, and use design system
 * Requirements: 5.5 - Support i18n translations
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFoundScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden flex items-center justify-center">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "max-w-md w-full text-center",
            isRTL && "rtl"
          )}
        >
          {/* Glass panel container */}
          <div className="p-8 md:p-12 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-6"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/30">
                <AlertCircle className="w-10 h-10 text-red-400" aria-hidden="true" />
              </div>
            </motion.div>

            {/* 404 Heading */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-br from-red-400 to-orange-400 bg-clip-text text-transparent"
            >
              404
            </motion.h1>

            {/* Error message */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl text-white/80 mb-8"
            >
              {t('errors.notFound')}
            </motion.p>

            {/* Home button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={handleGoHome}
                size="lg"
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                aria-label={t('nav.home')}
              >
                <Home className="w-5 h-5" aria-hidden="true" />
                {t('nav.home')}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
