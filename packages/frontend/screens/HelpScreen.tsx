/**
 * Help Screen — keyboard shortcuts reference and documentation links
 */

import { Link } from 'react-router-dom';
import { Keyboard, Video, BookOpen, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SHORTCUTS } from '@/hooks/useTimelineKeyboard';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';

// Additional numeric-key shortcut not represented in the SHORTCUTS constant
const EXTRA_SHORTCUTS: Record<string, string> = {
  '0 – 9': 'Jump to % of timeline (0 = 0 %, 5 = 50 %, …)',
};

const ALL_SHORTCUTS = { ...SHORTCUTS, ...EXTRA_SHORTCUTS };

interface QuickLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function QuickLink({ to, icon, label, description }: QuickLinkProps) {
  return (
    <Link
      to={to}
      className="block p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors h-full"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-primary">{icon}</div>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </Link>
  );
}

export default function HelpScreen() {
  const { t, isRTL } = useLanguage();

  return (
    <div className={cn("max-w-3xl mx-auto px-4 py-10 space-y-10", isRTL && "text-right")} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-bold">{t('help.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('help.subtitle')}
          </p>
        </div>
      </BlurFade>

      {/* Keyboard shortcuts */}
      <BlurFade delay={0.1}>
        <section aria-labelledby="shortcuts-heading">
          <div className={cn("flex items-center gap-2 mb-3", isRTL && "flex-row-reverse")}>
            <Keyboard className="w-4 h-4 text-primary" aria-hidden />
            <h2 id="shortcuts-heading" className="text-base font-semibold">
              {t('help.shortcutsHeading')}
            </h2>
          </div>
          <div className="rounded-lg border border-border bg-card divide-y">
            {Object.entries(ALL_SHORTCUTS).map(([key, action], i) => (
              <BlurFade key={key} delay={0.1 + i * 0.02} inView>
                <div className={cn("flex items-center justify-between px-4 py-2.5", isRTL && "flex-row-reverse")}>
                  <dt>
                    <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-foreground shadow-sm">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-muted-foreground">{action}</dd>
                </div>
              </BlurFade>
            ))}
          </div>
        </section>
      </BlurFade>

      {/* Quick links */}
      <BlurFade delay={0.15}>
        <section aria-labelledby="links-heading">
          <div className={cn("flex items-center gap-2 mb-3", isRTL && "flex-row-reverse")}>
            <BookOpen className="w-4 h-4 text-primary" aria-hidden />
            <h2 id="links-heading" className="text-base font-semibold">
              {t('help.quickLinksHeading')}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { to: '/studio?mode=video', icon: <Video className="w-4 h-4" />, label: t('help.videoStudio'), description: t('help.videoStudioDesc') },
              { to: '/studio?mode=story', icon: <BookOpen className="w-4 h-4" />, label: t('help.storyMode'), description: t('help.storyModeDesc') },
              { to: '/studio?mode=music', icon: <Music className="w-4 h-4" />, label: t('help.musicMode'), description: t('help.musicModeDesc') },
            ].map((link, i) => (
              <BlurFade key={link.to} delay={0.18 + i * 0.06}>
                <QuickLink {...link} />
              </BlurFade>
            ))}
          </div>
        </section>
      </BlurFade>

      {/* Back button */}
      <BlurFade delay={0.25}>
        <div>
          <Button variant="outline" asChild>
            <Link to="/">{t('help.backHome')}</Link>
          </Button>
        </div>
      </BlurFade>
    </div>
  );
}
