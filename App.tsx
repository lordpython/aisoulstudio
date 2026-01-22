/**
 * Main App Component
 * Requirements: 3.1 - Support Arabic and English languages
 * Requirements: 2.1, 2.2 - Use React Router for all navigation
 * Requirements: 1.3 - Remove ProductionView and SleekProductionView
 */

import { useState, Suspense, lazy } from "react";
import { AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { AppRouter } from "./router";

// Import i18n configuration - this initializes i18next
import "./i18n";

// Lazy load intro animation
const IntroAnimation = lazy(() => import("./components/IntroAnimation").then(m => ({ default: m.IntroAnimation })));

export default function App() {
  // UI-specific state for intro animation
  const [showIntro, setShowIntro] = useState(true);

  return (
    <TooltipProvider>
      <ErrorBoundary>
        <AppShell>
          {/* Intro Animation */}
          <AnimatePresence>
            {showIntro && (
              <Suspense fallback={<div className="fixed inset-0 bg-slate-900 z-50" />}>
                <IntroAnimation onComplete={() => setShowIntro(false)} />
              </Suspense>
            )}
          </AnimatePresence>

          {/* Main App with React Router */}
          <AppRouter />
        </AppShell>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
