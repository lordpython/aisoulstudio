/**
 * Help Screen — keyboard shortcuts reference and documentation links
 */

import { Link } from 'react-router-dom';
import { Keyboard, Video, BookOpen, Music } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SHORTCUTS } from '@/hooks/useTimelineKeyboard';
import { BlurFade } from '@/components/motion-primitives/blur-fade';

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
    <Link to={to}>
      <Card className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <div className="mt-0.5 shrink-0 text-primary">{icon}</div>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </Card>
    </Link>
  );
}

export default function HelpScreen() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      {/* Header */}
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-bold">Help & Keyboard Shortcuts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Quick-reference for keyboard navigation and links to key areas of the app.
          </p>
        </div>
      </BlurFade>

      {/* Keyboard shortcuts */}
      <BlurFade delay={0.1}>
        <section aria-labelledby="shortcuts-heading">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="w-4 h-4 text-primary" aria-hidden />
            <h2 id="shortcuts-heading" className="text-base font-semibold">
              Timeline Keyboard Shortcuts
            </h2>
          </div>
          <Card>
            <dl className="divide-y">
              {Object.entries(ALL_SHORTCUTS).map(([key, action], i) => (
                <BlurFade key={key} delay={0.1 + i * 0.02} inView>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <dt>
                      <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-foreground shadow-sm">
                        {key}
                      </kbd>
                    </dt>
                    <dd className="text-sm text-muted-foreground text-right">{action}</dd>
                  </div>
                </BlurFade>
              ))}
            </dl>
          </Card>
        </section>
      </BlurFade>

      {/* Quick links */}
      <BlurFade delay={0.15}>
        <section aria-labelledby="links-heading">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" aria-hidden />
            <h2 id="links-heading" className="text-base font-semibold">
              Quick Links
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { to: '/studio?mode=video', icon: <Video className="w-4 h-4" />, label: 'Video Studio', description: 'Create AI-generated video productions' },
              { to: '/studio?mode=story', icon: <BookOpen className="w-4 h-4" />, label: 'Story Mode', description: 'Produce narrative-driven story videos' },
              { to: '/studio?mode=music', icon: <Music className="w-4 h-4" />, label: 'Music Mode', description: 'Generate music-synchronized lyric videos' },
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
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </BlurFade>
    </div>
  );
}
