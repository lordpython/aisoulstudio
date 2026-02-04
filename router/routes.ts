/**
 * Route definitions for LyricLens application
 * Requirements: 2.2 - Support routes: / (Home), /studio (Studio), /visualizer (Visualizer)
 */

export interface RouteConfig {
  path: string;
  title: string; // i18n key for document title
  meta?: {
    requiresAuth?: boolean;
    preserveState?: boolean;
  };
}

export const routes: RouteConfig[] = [
  {
    path: '/',
    title: 'nav.home',
  },
  {
    path: '/projects',
    title: 'nav.projects',
    meta: { requiresAuth: true },
  },
  {
    path: '/studio',
    title: 'nav.studio',
    meta: { preserveState: true },
  },
  {
    path: '/visualizer',
    title: 'nav.visualizer',
    meta: { preserveState: true },
  },
  {
    path: '/gradient-generator',
    title: 'nav.gradientGenerator',
  },
  {
    path: '/settings',
    title: 'nav.settings',
  },
];

/**
 * Get route config by path
 */
export function getRouteByPath(path: string): RouteConfig | undefined {
  return routes.find((route) => route.path === path);
}

/**
 * Check if a path is a valid route
 */
export function isValidRoute(path: string): boolean {
  return routes.some((route) => route.path === path);
}
