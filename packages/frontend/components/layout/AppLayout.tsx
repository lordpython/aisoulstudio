import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkipLink } from "@/components/ui/skip-link";
import { useLanguage } from "@/i18n/useLanguage";

export interface AppLayoutProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  isSidebarOpen: boolean;
  onSidebarToggle: (open: boolean) => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  sidebar,
  header,
  children,
  isSidebarOpen,
  onSidebarToggle,
}) => {
  const { t, isRTL } = useLanguage();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Parallax effect for the background
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30">

      {/* Skip to main content link for keyboard users */}
      <SkipLink targetId="main-content">
        {t('a11y.skipToContent')}
      </SkipLink>

      {/* Ambient Void Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Deep Space Gradients */}
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/5 rounded-full blur-[120px]"
          animate={{ x: mousePos.x * -1, y: mousePos.y * -1 }}
          transition={{ type: "spring", damping: 50, stiffness: 100 }}
        />
        <motion.div
          className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-secondary/10 rounded-full blur-[100px]"
          animate={{ x: mousePos.x * -0.5, y: mousePos.y * -0.5 }}
          transition={{ type: "spring", damping: 50, stiffness: 100 }}
        />

        {/* Stars / Dust Particles */}
        <div className="absolute inset-0 opacity-20 bg-[url('/noise.svg')] mix-blend-overlay" />
      </div>

      {/* Floating Dock (Desktop Sidebar) */}
      <div className="hidden md:block fixed left-4 top-1/2 -translate-y-1/2 z-50">
        <div className="glass-panel rounded-2xl p-2 transition-all duration-500 hover:shadow-[0_0_40px_rgba(var(--primary),0.2)]">
          {sidebar}
        </div>
      </div>

      {/* Mobile Header */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 h-16 z-40 px-4 flex items-center justify-between glass-panel border-b-0"
        role="banner"
      >
        <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
          LyricLens
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSidebarToggle(!isSidebarOpen)}
          className="hover:bg-white/5"
          aria-label={isSidebarOpen ? t('a11y.closeMenu') : t('a11y.openMenu')}
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </header>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl md:hidden flex items-center justify-center p-6"
            onClick={() => onSidebarToggle(false)}
          >
            <div
              className="w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {sidebar}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main
        id="main-content"
        className="relative z-10 min-h-screen flex flex-col md:pl-24"
        role="main"
        aria-label="Main content"
      >
        {/* Contextual Header (floats at top) */}
        <div className="sticky top-0 z-30 px-6 py-4">
          {header}
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col relative px-4 md:px-8 pb-8">
          {children}
        </div>
      </main>
    </div>
  );
};
