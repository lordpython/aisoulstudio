/**
 * Route layout wrapper component
 * Requirements: 2.2 - Handle document title updates per route
 */

import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRouteByPath } from './routes';
import { Sidebar } from '@/components/layout/Sidebar';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';

/**
 * Layout wrapper that applies to all routes
 * - Updates document title based on current route
 * - Provides consistent layout structure with Sidebar
 */
export function RouteLayout() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isRTL } = useLanguage();

  // Update document title when route changes
  useEffect(() => {
    const routeConfig = getRouteByPath(location.pathname);
    if (routeConfig) {
      const translatedTitle = t(routeConfig.title);
      document.title = `${translatedTitle} | LyricLens`;
    } else {
      document.title = 'LyricLens';
    }
  }, [location.pathname, t]);

  return (
    <div className={cn('flex min-h-screen', isRTL && 'flex-row-reverse')}>
      {/* Sidebar Navigation */}
      <aside
        className="w-16 shrink-0 bg-[#0a0a0f]/80 backdrop-blur-xl border-white/5 z-30"
        style={{ borderInlineEnd: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="sticky top-0 h-screen py-4 px-2">
          <Sidebar />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
