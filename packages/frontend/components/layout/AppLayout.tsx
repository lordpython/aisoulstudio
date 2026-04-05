import React, { useState } from "react";
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

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">

      <SkipLink targetId="main-content">
        {t("a11y.skipToContent")}
      </SkipLink>

      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-primary/[0.04] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-secondary/[0.08] rounded-full blur-[100px]" />
      </div>

      {/* Fixed Sidebar (Desktop) */}
      <aside
        className={cn(
          "hidden md:flex fixed top-0 bottom-0 z-50 w-[60px] flex-col",
          "bg-[oklch(0.04_0.01_240)]",
          isRTL
            ? "right-0 border-l border-[oklch(0.14_0.03_240)]"
            : "left-0 border-r border-[oklch(0.14_0.03_240)]",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile Header */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 h-14 z-40 px-4 flex items-center justify-between bg-[oklch(0.04_0.01_240)] border-b border-[oklch(0.14_0.03_240)]"
        role="banner"
      >
        <span
          className="font-semibold text-base tracking-tight"
          style={{ color: "oklch(0.88 0.01 60)" }}
        >
          Aisoul Studio
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSidebarToggle(!isSidebarOpen)}
          className="h-9 w-9 text-[oklch(0.55_0.03_240)] hover:text-white hover:bg-[oklch(0.11_0.03_240)]"
          aria-label={isSidebarOpen ? t("a11y.closeMenu") : t("a11y.openMenu")}
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </Button>
      </header>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl md:hidden flex items-center justify-center p-6"
            onClick={() => onSidebarToggle(false)}
            onKeyDown={(e) => e.key === 'Escape' && onSidebarToggle(false)}
            role="presentation"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="w-48 rounded-2xl overflow-hidden border border-[oklch(0.14_0.03_240)] bg-[oklch(0.05_0.01_240)] py-2"
              onClick={(e) => e.stopPropagation()}
            >
              {sidebar}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        id="main-content"
        className={cn(
          "relative z-10 min-h-screen flex flex-col pt-14 md:pt-0",
          isRTL ? "md:pr-[60px]" : "md:pl-[60px]",
        )}
        role="main"
        aria-label="Main content"
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-30 px-4 md:px-6 py-3">
          {header}
        </div>

        {/* Workspace */}
        <div className="flex-1 flex flex-col relative px-4 md:px-6 pb-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
