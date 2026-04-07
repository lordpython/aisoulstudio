/**
 * AccountScreen - User profile, API key management, and usage overview
 *
 * Displays current user info, allows managing API keys (stored in env),
 * shows project counts, and provides sign-out.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Key,
  LogOut,
  Shield,
  FolderOpen,
  Video,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { useAuth } from '@/hooks/useAuth';
import { getProjectCount } from '@/services/project/projectService';
import { uiLogger } from '@/services/infrastructure/logger';

const log = uiLogger.child('Account');

interface ApiKeyConfig {
  label: string;
  envKey: string;
  placeholder: string;
  docsUrl?: string;
}

const COPY_FEEDBACK_MS = 1500;
const MASK_LENGTH = 20;
const MASK_PREVIEW_LENGTH = 6;
const UID_PREVIEW_LENGTH = 16;

const API_KEYS: ApiKeyConfig[] = [
  {
    label: 'Gemini API Key',
    envKey: 'VITE_GEMINI_API_KEY',
    placeholder: 'AIza...',
    docsUrl: 'https://ai.google.dev/',
  },
  {
    label: 'DeAPI Key',
    envKey: 'VITE_DEAPI_API_KEY',
    placeholder: 'deapi_...',
  },
  {
    label: 'Suno API Key',
    envKey: 'VITE_SUNO_API_KEY',
    placeholder: 'suno_...',
  },
  {
    label: 'Freesound API Key',
    envKey: 'VITE_FREESOUND_API_KEY',
    placeholder: 'freesound_...',
  },
];

function StatCard({ icon: Icon, label, value }: { icon: typeof FolderOpen; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ApiKeyRow({ config, t }: { config: ApiKeyConfig; t: (key: string) => string }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentValue = (import.meta as any).env?.[config.envKey] || '';
  const isSet = Boolean(currentValue);
  const maskedValue = isSet ? `${currentValue.slice(0, MASK_PREVIEW_LENGTH)}${'•'.repeat(MASK_LENGTH)}` : '';

  const handleCopy = useCallback(() => {
    if (currentValue) {
      navigator.clipboard.writeText(currentValue);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    }
  }, [currentValue]);

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <Key className="w-4 h-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{config.label}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {isSet ? (showKey ? currentValue : maskedValue) : (t('account.notConfigured') || 'Not configured')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isSet && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)} className="h-7 w-7 p-0">
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 w-7 p-0">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </>
        )}
        {config.docsUrl && (
          <Button variant="ghost" size="sm" asChild className="h-7 w-7 p-0">
            <a href={config.docsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        )}
        <span className={cn(
          'px-2 py-0.5 text-[10px] font-medium rounded-full',
          isSet
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        )}>
          {isSet ? (t('account.keyActive') || 'Active') : (t('account.keyMissing') || 'Missing')}
        </span>
      </div>
    </div>
  );
}

export default function AccountScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut: handleSignOut, isLoading: authLoading } = useAuth();

  const [projectCount, setProjectCount] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      getProjectCount().then(setProjectCount).catch(() => setProjectCount(0));
    }
  }, [isAuthenticated]);

  if (authLoading) {
    return (
      <ScreenLayout title={t('account.title') || 'Account'} showBackButton onBack={() => navigate('/')}>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </ScreenLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenLayout title={t('account.title') || 'Account'} showBackButton onBack={() => navigate('/')}>
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
          <User className="w-16 h-16 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">{t('account.signInRequired') || 'Sign in to view your account'}</p>
          <Button onClick={() => navigate('/signin')}>{t('nav.signIn') || 'Sign In'}</Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      title={t('account.title') || 'Account'}
      showBackButton
      onBack={() => navigate('/')}
      maxWidth="2xl"
      contentClassName="py-8"
    >
      <div className="space-y-8">
        {/* Profile Section */}
        <BlurFade delay={0}>
          <motion.section
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-lg font-semibold text-foreground">{t('account.profile') || 'Profile'}</h2>
            <div className="p-6 rounded-xl bg-secondary/50 border border-border">
              <div className="flex items-center gap-5">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-16 h-16 rounded-full border-2 border-primary/30 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/30">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-foreground">
                    {user?.displayName || t('account.anonymous') || 'Anonymous User'}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5" />
                    {user?.email || t('account.noEmail') || 'No email'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4" />
                  {t('account.signOut') || 'Sign Out'}
                </Button>
              </div>
            </div>
          </motion.section>
        </BlurFade>

        {/* Stats */}
        <BlurFade delay={0.1}>
          <motion.section
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-lg font-semibold text-foreground">{t('account.usage') || 'Usage'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={FolderOpen}
                label={t('account.totalProjects') || 'Total Projects'}
                value={projectCount ?? '...'}
              />
              <StatCard
                icon={Video}
                label={t('account.storageUsed') || 'Account Type'}
                value={user?.email?.includes('google') ? (t('account.googleAuth') || 'Google') : (t('account.emailAuth') || 'Email')}
              />
            </div>
          </motion.section>
        </BlurFade>

        {/* API Keys */}
        <BlurFade delay={0.2}>
          <motion.section
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t('account.apiKeys') || 'API Keys'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('account.apiKeysHint') || 'Managed via .env file at project root'}
              </p>
            </div>
            <div className="p-5 rounded-xl bg-secondary/50 border border-border">
              {API_KEYS.map((config) => (
                <ApiKeyRow key={config.envKey} config={config} t={t} />
              ))}
            </div>
          </motion.section>
        </BlurFade>

        {/* Security Info */}
        <BlurFade delay={0.3}>
          <motion.section
            className="space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-lg font-semibold text-foreground">{t('account.security') || 'Security'}</h2>
            <div className="p-5 rounded-xl bg-secondary/50 border border-border space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('account.provider') || 'Auth Provider'}</span>
                <span className="text-foreground font-medium">{t('account.firebase') || 'Firebase'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('account.uid') || 'User ID'}</span>
                <span className="text-foreground font-mono text-xs">{user?.uid?.slice(0, UID_PREVIEW_LENGTH)}...</span>
              </div>
            </div>
          </motion.section>
        </BlurFade>
      </div>
    </ScreenLayout>
  );
}
