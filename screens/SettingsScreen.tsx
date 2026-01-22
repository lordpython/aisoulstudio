/**
 * Settings Screen - API key management and app configuration
 * Requirements: Settings page for managing API keys and preferences
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Key,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Info,
  Sparkles,
  Video,
  Music,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';

// Import API status checkers
import { isDeApiConfigured, getImg2VideoWaitTime, getImg2VideoQueueLength } from '@/services/deapiService';

// ============================================================
// Types
// ============================================================

interface ApiKeyConfig {
  id: string;
  name: string;
  envVar: string;
  description: string;
  required: boolean;
  docsUrl: string;
  icon: React.ComponentType<{ className?: string }>;
  checkConfigured: () => boolean;
  features: string[];
}

// ============================================================
// API Key Configurations
// ============================================================

const API_KEYS: ApiKeyConfig[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    envVar: 'VITE_GEMINI_API_KEY',
    description: 'Powers AI content generation, narration, and visual prompts',
    required: true,
    docsUrl: 'https://aistudio.google.com/apikey',
    icon: Sparkles,
    checkConfigured: () => {
      // @ts-ignore
      const key = import.meta.env?.VITE_GEMINI_API_KEY;
      return Boolean(key && key.trim().length > 0);
    },
    features: ['Content Planning', 'Narration (TTS)', 'Image Generation (Imagen)', 'Story Analysis'],
  },
  {
    id: 'deapi',
    name: 'DeAPI',
    envVar: 'VITE_DEAPI_API_KEY',
    description: 'Converts still images to animated video clips',
    required: false,
    docsUrl: 'https://deapi.ai',
    icon: Video,
    checkConfigured: isDeApiConfigured,
    features: ['Image-to-Video Animation', 'Motion Effects', 'Video Loops'],
  },
  {
    id: 'suno',
    name: 'Suno',
    envVar: 'VITE_SUNO_API_KEY',
    description: 'AI-powered music and song generation',
    required: false,
    docsUrl: 'https://suno.ai',
    icon: Music,
    checkConfigured: () => {
      // @ts-ignore
      const key = import.meta.env?.VITE_SUNO_API_KEY;
      return Boolean(key && key.trim().length > 0);
    },
    features: ['Full Song Generation', 'Instrumental Tracks', 'Custom Lyrics'],
  },
  {
    id: 'freesound',
    name: 'Freesound',
    envVar: 'VITE_FREESOUND_API_KEY',
    description: 'Access to sound effects library for ambient audio',
    required: false,
    docsUrl: 'https://freesound.org/apiv2/apply/',
    icon: Volume2,
    checkConfigured: () => {
      // @ts-ignore
      const key = import.meta.env?.VITE_FREESOUND_API_KEY;
      return Boolean(key && key.trim().length > 0);
    },
    features: ['Ambient SFX', 'Sound Effects', 'Audio Transitions'],
  },
];

// ============================================================
// Components
// ============================================================

interface ApiKeyCardProps {
  config: ApiKeyConfig;
  isRTL: boolean;
}

function ApiKeyCard({ config, isRTL }: ApiKeyCardProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [showEnvVar, setShowEnvVar] = useState(false);

  useEffect(() => {
    setIsConfigured(config.checkConfigured());
  }, [config]);

  const Icon = config.icon;

  const copyEnvVar = () => {
    navigator.clipboard.writeText(`${config.envVar}=your_api_key_here`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-5 rounded-xl border transition-all',
        isConfigured
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : config.required
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-white/5 border-white/10'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-start justify-between mb-3', isRTL && 'flex-row-reverse')}>
        <div className={cn('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              isConfigured ? 'bg-emerald-500/20' : 'bg-white/10'
            )}
          >
            <Icon className={cn('w-5 h-5', isConfigured ? 'text-emerald-400' : 'text-white/60')} />
          </div>
          <div>
            <h3 className="font-medium text-white flex items-center gap-2">
              {config.name}
              {config.required && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  Required
                </span>
              )}
            </h3>
            <p className="text-sm text-white/50">{config.description}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
            isConfigured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
          )}
        >
          {isConfigured ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Configured
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5" />
              Not Set
            </>
          )}
        </div>
      </div>

      {/* Features */}
      <div className={cn('flex flex-wrap gap-1.5 mb-4', isRTL && 'justify-end')}>
        {config.features.map((feature) => (
          <span
            key={feature}
            className="px-2 py-0.5 text-xs rounded-full bg-white/5 text-white/60"
          >
            {feature}
          </span>
        ))}
      </div>

      {/* Environment Variable */}
      <div className="p-3 rounded-lg bg-black/30 border border-white/5">
        <div className={cn('flex items-center justify-between mb-2', isRTL && 'flex-row-reverse')}>
          <span className="text-xs text-white/40">Environment Variable</span>
          <div className={cn('flex items-center gap-1', isRTL && 'flex-row-reverse')}>
            <button
              onClick={() => setShowEnvVar(!showEnvVar)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title={showEnvVar ? 'Hide' : 'Show'}
            >
              {showEnvVar ? (
                <EyeOff className="w-3.5 h-3.5 text-white/40" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-white/40" />
              )}
            </button>
            <button
              onClick={copyEnvVar}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>
        </div>
        <code className="text-sm font-mono text-violet-300">
          {showEnvVar ? `${config.envVar}=your_api_key_here` : `${config.envVar}=••••••••`}
        </code>
      </div>

      {/* Action Button */}
      <div className={cn('mt-4 flex items-center gap-2', isRTL && 'flex-row-reverse justify-end')}>
        <a
          href={config.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
          )}
        >
          Get API Key
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function SettingsScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);

  // DeAPI rate limit info
  const [deapiWaitTime, setDeapiWaitTime] = useState(0);
  const [deapiQueueLength, setDeapiQueueLength] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDeapiWaitTime(getImg2VideoWaitTime());
      setDeapiQueueLength(getImg2VideoQueueLength());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const configuredCount = API_KEYS.filter((k) => k.checkConfigured()).length;
  const requiredConfigured = API_KEYS.filter((k) => k.required && k.checkConfigured()).length;
  const requiredTotal = API_KEYS.filter((k) => k.required).length;

  return (
    <ScreenLayout
      title={t('nav.settings')}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="text-white/50 hover:text-white"
        >
          <RefreshCw className="w-4 h-4 me-2" />
          Refresh
        </Button>
      }
      maxWidth="2xl"
      contentClassName="py-8"
    >
      {/* Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 p-6 rounded-xl bg-white/5 border border-white/10"
      >
        <div className={cn('flex items-center gap-4 mb-4', isRTL && 'flex-row-reverse')}>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
            <Key className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">API Configuration</h2>
            <p className="text-sm text-white/50">
              {configuredCount} of {API_KEYS.length} services configured
            </p>
          </div>
        </div>

        {/* Status Bars */}
        <div className="space-y-3">
          <div>
            <div className={cn('flex justify-between text-sm mb-1', isRTL && 'flex-row-reverse')}>
              <span className="text-white/60">Required APIs</span>
              <span className={requiredConfigured === requiredTotal ? 'text-emerald-400' : 'text-amber-400'}>
                {requiredConfigured}/{requiredTotal}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  requiredConfigured === requiredTotal ? 'bg-emerald-500' : 'bg-amber-500'
                )}
                style={{ width: `${(requiredConfigured / requiredTotal) * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className={cn('flex justify-between text-sm mb-1', isRTL && 'flex-row-reverse')}>
              <span className="text-white/60">Optional APIs</span>
              <span className="text-white/40">
                {configuredCount - requiredConfigured}/{API_KEYS.length - requiredTotal}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-500"
                style={{
                  width: `${((configuredCount - requiredConfigured) / (API_KEYS.length - requiredTotal)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* DeAPI Rate Limit Status */}
        {isDeApiConfigured() && (deapiWaitTime > 0 || deapiQueueLength > 0) && (
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className={cn('flex items-center gap-2 text-sm text-amber-300', isRTL && 'flex-row-reverse')}>
              <Info className="w-4 h-4" />
              <span>
                DeAPI Rate Limit: {deapiQueueLength > 0 ? `${deapiQueueLength} queued, ` : ''}
                {deapiWaitTime > 0 ? `~${deapiWaitTime}s until next request` : 'Ready'}
              </span>
            </div>
          </div>
        )}
      </motion.div>

      {/* Instructions */}
      <div className="mb-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div className={cn('flex items-start gap-3', isRTL && 'flex-row-reverse')}>
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200/80">
            <p className="font-medium mb-1">How to configure API keys:</p>
            <ol className={cn('list-decimal list-inside space-y-1 text-blue-200/60', isRTL && 'text-right')}>
              <li>Create a <code className="px-1 py-0.5 rounded bg-blue-500/20">.env.local</code> file in the project root</li>
              <li>Add your API keys in the format shown below each service</li>
              <li>Restart the development server (<code className="px-1 py-0.5 rounded bg-blue-500/20">npm run dev:all</code>)</li>
            </ol>
          </div>
        </div>
      </div>

      {/* API Key Cards */}
      <div className="grid gap-4" key={refreshKey}>
        {API_KEYS.map((config) => (
          <ApiKeyCard key={config.id} config={config} isRTL={isRTL} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-white/30">
        API keys are stored in environment variables for security.
        <br />
        They are never exposed to the browser or stored in localStorage.
      </div>
    </ScreenLayout>
  );
}
