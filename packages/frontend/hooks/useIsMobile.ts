/**
 * useIsMobile - Breakpoint hook
 *
 * Returns true when the viewport is below the mobile breakpoint (768px by
 * default — Tailwind's `md`). SSR-safe: returns false on the first render
 * and updates after mount via `matchMedia` so snap points, drawer direction,
 * and layout can switch without a hydration mismatch.
 */

import { useEffect, useState } from 'react';

const DEFAULT_MOBILE_BREAKPOINT_PX = 768;

export function useIsMobile(breakpointPx: number = DEFAULT_MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    // Set initial value after mount (SSR safety)
    handleChange(mediaQuery);

    // Modern API
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    // Fallback for older browsers
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [breakpointPx]);

  return isMobile;
}
