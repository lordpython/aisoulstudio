/**
 * ProjectSettingsScreen - Per-project configuration
 *
 * Centralizes project-level settings: name, description, default aspect ratio,
 * language, voice, visual style, and danger zone (delete).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Save,
  Trash2,
  Loader2,
  Globe,
  Palette,
  Monitor,
  Smartphone,
  Square,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import {
  getProject,
  updateProject,
  deleteProject,
  type Project,
} from '@/services/project/projectService';
import { useAuth } from '@/hooks/useAuth';
import { uiLogger } from '@/services/infrastructure/logger';

const log = uiLogger.child('ProjectSettings');

type AspectPreset = '16:9' | '9:16' | '1:1';

const ASPECT_PRESETS: { value: AspectPreset; label: string; icon: typeof Monitor }[] = [
  { value: '16:9', label: 'Landscape (16:9)', icon: Monitor },
  { value: '9:16', label: 'Portrait (9:16)', icon: Smartphone },
  { value: '1:1', label: 'Square (1:1)', icon: Square },
];

const VISUAL_STYLES = [
  'Cinematic', 'Photorealistic', 'Anime', 'Watercolor',
  'Digital Art', 'Oil Painting', 'Pixel Art', 'Minimalist',
];

const LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic (العربية)' },
];

interface FormState {
  title: string;
  description: string;
  aspectRatio: AspectPreset;
  language: string;
  visualStyle: string;
}

export default function ProjectSettingsScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { isAuthenticated } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    aspectRatio: '16:9',
    language: 'auto',
    visualStyle: 'Cinematic',
  });

  useEffect(() => {
    if (!projectId) return;

    (async () => {
      setIsLoading(true);
      try {
        const p = await getProject(projectId);
        if (p) {
          setProject(p);
          setForm({
            title: p.title || '',
            description: p.description || '',
            aspectRatio: '16:9',
            language: p.language || 'auto',
            visualStyle: p.style || 'Cinematic',
          });
        } else {
          setError('Project not found');
        }
      } catch (err) {
        log.error('Failed to load project', err);
        setError('Failed to load project');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [projectId]);

  const handleSave = useCallback(async () => {
    if (!projectId || !form.title.trim()) return;

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateProject(projectId, {
        title: form.title.trim(),
        description: form.description.trim(),
        style: form.visualStyle,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      log.info(`Saved settings for project ${projectId}`);
    } catch (err) {
      log.error('Failed to save settings', err);
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, [projectId, form]);

  const handleDelete = useCallback(async () => {
    if (!projectId) return;

    setIsDeleting(true);
    try {
      await deleteProject(projectId);
      log.info(`Deleted project ${projectId}`);
      navigate('/projects');
    } catch (err) {
      log.error('Failed to delete project', err);
      setError('Failed to delete project');
      setIsDeleting(false);
    }
  }, [projectId, navigate]);

  if (isLoading) {
    return (
      <ScreenLayout title={t('settings.title') || 'Project Settings'} showBackButton onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </ScreenLayout>
    );
  }

  if (error && !project) {
    return (
      <ScreenLayout title={t('settings.title') || 'Project Settings'} showBackButton onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-center max-w-md">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => navigate('/projects')}>{t('common.back') || 'Back'}</Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  const headerActions = (
    <Button
      onClick={handleSave}
      disabled={isSaving || !form.title.trim()}
      size="sm"
      className={cn(
        'gap-2 transition-all',
        saveSuccess
          ? 'bg-green-600 hover:bg-green-700 text-white'
          : 'bg-primary hover:bg-primary/90 text-primary-foreground'
      )}
    >
      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saveSuccess ? (t('common.saved') || 'Saved!') : (t('common.save') || 'Save')}
    </Button>
  );

  return (
    <ScreenLayout
      title={t('settings.title') || 'Project Settings'}
      showBackButton
      onBack={() => navigate(-1)}
      headerActions={headerActions}
      maxWidth="2xl"
      contentClassName="py-8"
    >
      <div className="space-y-8">
        {/* General Section */}
        <motion.section
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-foreground">{t('settings.general') || 'General'}</h2>
          <div className="space-y-4 p-5 rounded-xl bg-secondary/50 border border-border">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {t('settings.projectName') || 'Project Name'}
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="My Video Project"
                className="bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {t('settings.description') || 'Description'}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
        </motion.section>

        {/* Defaults Section */}
        <motion.section
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-foreground">{t('settings.defaults') || 'Defaults'}</h2>
          <div className="space-y-5 p-5 rounded-xl bg-secondary/50 border border-border">
            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                <Monitor className="w-4 h-4 inline-block me-1.5 -mt-0.5" />
                {t('settings.aspectRatio') || 'Aspect Ratio'}
              </label>
              <div className="flex gap-2">
                {ASPECT_PRESETS.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={form.aspectRatio === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm({ ...form, aspectRatio: value })}
                    className="gap-2"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                <Globe className="w-4 h-4 inline-block me-1.5 -mt-0.5" />
                {t('settings.language') || 'Language'}
              </label>
              <div className="flex gap-2">
                {LANGUAGES.map(({ code, label }) => (
                  <Button
                    key={code}
                    variant={form.language === code ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm({ ...form, language: code })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Visual Style */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                <Palette className="w-4 h-4 inline-block me-1.5 -mt-0.5" />
                {t('settings.visualStyle') || 'Visual Style'}
              </label>
              <div className="flex flex-wrap gap-2">
                {VISUAL_STYLES.map((style) => (
                  <Button
                    key={style}
                    variant={form.visualStyle === style ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm({ ...form, visualStyle: style })}
                  >
                    {style}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Danger Zone */}
        <motion.section
          className="space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-destructive">{t('settings.dangerZone') || 'Danger Zone'}</h2>
          <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/5">
            {!showDeleteConfirm ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.deleteProject') || 'Delete this project'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.deleteWarning') || 'This action cannot be undone. All project data will be permanently removed.'}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="gap-2 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('common.delete') || 'Delete'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  <p className="text-sm font-medium">
                    {t('settings.confirmDelete') || 'Are you sure? This cannot be undone.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="gap-2"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('settings.confirmDeleteButton') || 'Yes, delete permanently'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    {t('common.cancel') || 'Cancel'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </ScreenLayout>
  );
}
