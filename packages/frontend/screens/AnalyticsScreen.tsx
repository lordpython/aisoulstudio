/**
 * AnalyticsScreen - Production analytics dashboard
 *
 * Aggregate view across projects showing:
 * - Production counts by format/mode
 * - Quality score trends
 * - Export stats
 * - Common issues
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  FileVideo,
  FolderOpen,
  Star,
  Clock,
  Loader2,
  Activity,
  Target,
  Zap,
  Film,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { useAuth } from '@/hooks/useAuth';
import {
  listUserProjects,
  getExportHistory,
  type Project,
  type ExportRecord,
} from '@/services/project/projectService';
import { uiLogger } from '@/services/infrastructure/logger';

const log = uiLogger.child('Analytics');

interface AnalyticsData {
  totalProjects: number;
  totalExports: number;
  projectsByType: Record<string, number>;
  exportsByFormat: Record<string, number>;
  exportsByQuality: Record<string, number>;
  recentProjects: Project[];
  favoriteCount: number;
  avgDuration: number;
  completedCount: number;
  hasVisualsCount: number;
  hasNarrationCount: number;
  hasMusicCount: number;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = 'text-primary',
  delay = 0,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  delay?: number;
}) {
  return (
    <BlurFade delay={delay} inView>
      <motion.div
        className="p-5 rounded-xl bg-secondary/50 border border-border hover:border-primary/20 transition-colors"
        whileHover={{ y: -1 }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={cn('p-2 rounded-lg bg-primary/5', color)}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </motion.div>
    </BlurFade>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-foreground font-medium capitalize">{label}</span>
        <span className="text-muted-foreground">{count} ({Math.round(pct)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  production: 'bg-blue-500',
  story: 'bg-purple-500',
  visualizer: 'bg-cyan-500',
};

const FORMAT_COLORS: Record<string, string> = {
  mp4: 'bg-emerald-500',
  webm: 'bg-amber-500',
  gif: 'bg-pink-500',
};

const QUALITY_COLORS: Record<string, string> = {
  draft: 'bg-amber-500',
  standard: 'bg-blue-500',
  high: 'bg-emerald-500',
  ultra: 'bg-purple-500',
};

export default function AnalyticsScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const projects = await listUserProjects(500);

        const projectsByType: Record<string, number> = {};
        const exportsByFormat: Record<string, number> = {};
        const exportsByQuality: Record<string, number> = {};
        let totalExports = 0;
        let totalDuration = 0;
        let durationCount = 0;

        for (const project of projects) {
          projectsByType[project.type] = (projectsByType[project.type] || 0) + 1;

          if (project.duration) {
            totalDuration += project.duration;
            durationCount++;
          }

          const exports = await getExportHistory(project.id, 100);
          totalExports += exports.length;

          for (const exp of exports) {
            exportsByFormat[exp.format] = (exportsByFormat[exp.format] || 0) + 1;
            exportsByQuality[exp.quality] = (exportsByQuality[exp.quality] || 0) + 1;
          }
        }

        setData({
          totalProjects: projects.length,
          totalExports,
          projectsByType,
          exportsByFormat,
          exportsByQuality,
          recentProjects: projects.slice(0, 5),
          favoriteCount: projects.filter(p => p.isFavorite).length,
          avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
          completedCount: projects.filter(p => p.status === 'completed').length,
          hasVisualsCount: projects.filter(p => p.hasVisuals).length,
          hasNarrationCount: projects.filter(p => p.hasNarration).length,
          hasMusicCount: projects.filter(p => p.hasMusic).length,
        });
      } catch (err) {
        log.error('Failed to load analytics', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <ScreenLayout title={t('analytics.title') || 'Analytics'} showBackButton onBack={() => navigate('/')}>
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
          <BarChart3 className="w-16 h-16 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">{t('account.signInRequired') || 'Sign in to view analytics'}</p>
          <Button onClick={() => navigate('/signin')}>{t('nav.signIn') || 'Sign In'}</Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      title={t('analytics.title') || 'Analytics'}
      showBackButton
      onBack={() => navigate('/')}
      maxWidth="full"
      contentClassName="py-8 px-6"
    >
      {isLoading || !data ? (
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Top Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MetricCard icon={FolderOpen} label="Projects" value={data.totalProjects} delay={0} />
            <MetricCard icon={FileVideo} label="Exports" value={data.totalExports} delay={0.05} />
            <MetricCard icon={Target} label="Completed" value={data.completedCount} delay={0.1} />
            <MetricCard icon={Star} label="Favorites" value={data.favoriteCount} color="text-amber-400" delay={0.15} />
            <MetricCard
              icon={Clock}
              label="Avg Duration"
              value={data.avgDuration > 0 ? `${Math.round(data.avgDuration / 60)}m` : '—'}
              delay={0.2}
            />
            <MetricCard icon={TrendingUp} label="With Visuals" value={data.hasVisualsCount} delay={0.25} />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Projects by Type */}
            <BlurFade delay={0.3} inView>
              <div className="p-5 rounded-xl bg-secondary/50 border border-border space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Projects by Mode
                </h3>
                <div className="space-y-3">
                  {Object.entries(data.projectsByType).map(([type, count]) => (
                    <BarRow
                      key={type}
                      label={type}
                      count={count}
                      total={data.totalProjects}
                      color={TYPE_COLORS[type] || 'bg-primary'}
                    />
                  ))}
                  {Object.keys(data.projectsByType).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
                  )}
                </div>
              </div>
            </BlurFade>

            {/* Exports by Format */}
            <BlurFade delay={0.35} inView>
              <div className="p-5 rounded-xl bg-secondary/50 border border-border space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary" />
                  Exports by Format
                </h3>
                <div className="space-y-3">
                  {Object.entries(data.exportsByFormat).map(([format, count]) => (
                    <BarRow
                      key={format}
                      label={format.toUpperCase()}
                      count={count}
                      total={data.totalExports}
                      color={FORMAT_COLORS[format] || 'bg-primary'}
                    />
                  ))}
                  {Object.keys(data.exportsByFormat).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No exports yet</p>
                  )}
                </div>
              </div>
            </BlurFade>

            {/* Exports by Quality */}
            <BlurFade delay={0.4} inView>
              <div className="p-5 rounded-xl bg-secondary/50 border border-border space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Quality Distribution
                </h3>
                <div className="space-y-3">
                  {Object.entries(data.exportsByQuality).map(([quality, count]) => (
                    <BarRow
                      key={quality}
                      label={quality}
                      count={count}
                      total={data.totalExports}
                      color={QUALITY_COLORS[quality] || 'bg-primary'}
                    />
                  ))}
                  {Object.keys(data.exportsByQuality).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No exports yet</p>
                  )}
                </div>
              </div>
            </BlurFade>
          </div>

          {/* Production Pipeline Stats */}
          <BlurFade delay={0.45} inView>
            <div className="p-5 rounded-xl bg-secondary/50 border border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-primary" />
                Pipeline Completion
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Has Visuals', count: data.hasVisualsCount, icon: '🎨' },
                  { label: 'Has Narration', count: data.hasNarrationCount, icon: '🎙️' },
                  { label: 'Has Music', count: data.hasMusicCount, icon: '🎵' },
                  { label: 'Exported', count: data.totalExports > 0 ? data.totalExports : 0, icon: '📦' },
                ].map(({ label, count, icon }) => (
                  <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02]">
                    <span className="text-xl">{icon}</span>
                    <div>
                      <p className="text-lg font-bold text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </BlurFade>

          {/* Empty state for new users */}
          {data.totalProjects === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <BarChart3 className="w-12 h-12 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">
                Start creating videos to see your analytics here
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/studio?mode=video')}>
                Create your first video
              </Button>
            </div>
          )}
        </div>
      )}
    </ScreenLayout>
  );
}
