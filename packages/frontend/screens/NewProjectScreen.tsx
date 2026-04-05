/**
 * New Project Wizard Screen
 *
 * Step-by-step project creation:
 * 1. Enter project name
 * 2. Choose mode (chat / story / visualizer)
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MessageSquare,
  BookOpen,
  AudioWaveform,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createProject,
  type ProjectType,
} from '@/services/project/projectService';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/useLanguage';
import { uiLogger } from '@/services/infrastructure/logger';
const log = uiLogger.child('NewProject');


// ─── Mode definitions ────────────────────────────────────────────────────────

type ModeOption = {
  type: ProjectType;
  label: string;
  description: string;
  icon: typeof MessageSquare;
  gradient: string;
  accentColor: string;
  studioMode?: string;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    type: 'production',
    label: 'Chat Mode',
    description: 'Open-ended AI conversation to build your video scene by scene.',
    icon: MessageSquare,
    gradient: 'from-primary/30 via-primary/10 to-transparent',
    accentColor: 'text-primary border-primary/40 hover:border-primary',
    studioMode: 'video',
  },
  {
    type: 'story',
    label: 'Story Mode',
    description: 'Guided pipeline that turns a topic into a fully produced story video.',
    icon: BookOpen,
    gradient: 'from-accent/30 via-accent/10 to-transparent',
    accentColor: 'text-accent border-accent/40 hover:border-accent',
    studioMode: 'story',
  },
  {
    type: 'visualizer',
    label: 'Visualizer',
    description: 'Audio-driven lyric visualizer with animated backgrounds.',
    icon: AudioWaveform,
    gradient: 'from-ring/30 via-ring/10 to-transparent',
    accentColor: 'text-ring border-ring/40 hover:border-ring',
  },
];

// ─── Animations ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.25 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewProjectScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isRTL } = useLanguage();

  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState('');
  const [selectedMode, setSelectedMode] = useState<ModeOption | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Guard: redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/signin', { state: { from: '/projects/new' } });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Auto-focus name input when step 1 is shown
  useEffect(() => {
    if (step === 1) {
      setTimeout(() => nameInputRef.current?.focus(), 200);
    }
  }, [step]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleNameNext = () => {
    if (!projectName.trim()) return;
    setStep(2);
  };

  const handleModeSelect = async (mode: ModeOption) => {
    setSelectedMode(mode);
    setIsCreating(true);
    setError(null);

    try {
      const project = await createProject({
        title: projectName.trim(),
        type: mode.type,
      });

      if (project) {
        if (mode.type === 'visualizer') {
          navigate(`/visualizer?projectId=${project.id}`);
        } else {
          const studioMode = mode.studioMode ?? 'video';
          navigate(`/studio?mode=${studioMode}&projectId=${project.id}`);
        }
      }
    } catch (err) {
      log.error('[NewProjectScreen] Failed to create project:', err);
      setError('Failed to create project. Please try again.');
      setIsCreating(false);
      setSelectedMode(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-[-15%] left-[15%] w-[55%] h-[55%] rounded-full blur-[180px]"
          style={{ backgroundColor: 'oklch(0.70 0.15 190 / 0.07)' }}
        />
        <div
          className="absolute bottom-[-15%] right-[10%] w-[45%] h-[45%] rounded-full blur-[160px]"
          style={{ backgroundColor: 'oklch(0.65 0.25 30 / 0.05)' }}
        />
      </div>

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        onClick={() => (step === 2 ? setStep(1) : navigate('/projects'))}
        className={cn(
          'absolute top-6 left-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm',
          isRTL && 'left-auto right-6 flex-row-reverse'
        )}
      >
        <ArrowLeft className="w-4 h-4" />
        {step === 2 ? 'Back' : 'Projects'}
      </motion.button>

      {/* Step indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute top-7 left-1/2 -translate-x-1/2 flex items-center gap-2"
      >
        {[1, 2].map((s) => (
          <motion.div
            key={s}
            animate={{
              width: s === step ? 24 : 6,
              backgroundColor: s === step ? 'var(--primary)' : 'var(--border)',
              scale: s === step ? 1.1 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="h-1.5 rounded-full"
          />
        ))}
      </motion.div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-lg">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Project Name ── */}
          {step === 1 && (
            <motion.div
              key="step-name"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col items-center gap-6 text-center"
            >
              <motion.div variants={itemVariants} className="flex flex-col items-center gap-2">
                <h1 className="text-3xl font-display font-bold text-foreground">
                  Name your project
                </h1>
                <p className="text-muted-foreground text-sm">
                  Give it a title — you can change it any time.
                </p>
              </motion.div>

              <motion.div variants={itemVariants} className="w-full">
                <Input
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. My First Story"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameNext()}
                  className="w-full text-center text-lg bg-secondary border-border focus:border-primary/50 h-14 rounded-xl"
                  maxLength={80}
                />
              </motion.div>

              <motion.div variants={itemVariants}>
                <Button
                  onClick={handleNameNext}
                  disabled={!projectName.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-11 gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* ── Step 2: Choose Mode ── */}
          {step === 2 && (
            <motion.div
              key="step-mode"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col items-center gap-6 text-center"
            >
              <motion.div variants={itemVariants} className="flex flex-col items-center gap-2">
                <h1 className="text-3xl font-display font-bold text-foreground">
                  How do you want to create?
                </h1>
                <p className="text-muted-foreground text-sm">
                  Choose the mode that fits your workflow.
                </p>
              </motion.div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="text-sm text-destructive"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.div
                variants={containerVariants}
                className="w-full flex flex-col gap-3"
              >
                {MODE_OPTIONS.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = selectedMode?.type === mode.type;

                  return (
                    <motion.button
                      key={mode.type}
                      variants={itemVariants}
                      onClick={() => !isCreating && handleModeSelect(mode)}
                      disabled={isCreating}
                      className={cn(
                        'relative w-full text-left rounded-2xl border bg-secondary/50 backdrop-blur-sm p-5',
                        'transition-all duration-200 cursor-pointer overflow-hidden',
                        'flex items-center gap-4',
                        mode.accentColor,
                        isCreating && !isSelected && 'opacity-40 cursor-not-allowed',
                        isRTL && 'flex-row-reverse text-right'
                      )}
                    >
                      {/* Gradient overlay */}
                      <div
                        className={cn(
                          'absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-200 pointer-events-none',
                          mode.gradient,
                          'hover:opacity-100'
                        )}
                      />

                      {/* Icon */}
                      <div
                        className={cn(
                          'relative z-10 w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 bg-background/60',
                          mode.accentColor
                        )}
                      >
                        {isCreating && isSelected ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>

                      {/* Text */}
                      <div className="relative z-10 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-tight">
                          {mode.label}
                        </p>
                        <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                          {mode.description}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
