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
    path: '/projects/new',
    title: 'nav.newProject',
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:projectId',
    title: 'nav.project',
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:projectId/story',
    title: 'nav.story',
    meta: { requiresAuth: true, preserveState: true },
  },
  {
    path: '/projects/:projectId/video',
    title: 'nav.studio',
    meta: { requiresAuth: true, preserveState: true },
  },
  {
    path: '/projects/:projectId/music',
    title: 'nav.visualizer',
    meta: { requiresAuth: true, preserveState: true },
  },
  {
    path: '/projects/:projectId/preview',
    title: 'nav.preview',
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:projectId/settings',
    title: 'nav.projectSettings',
    meta: { requiresAuth: true },
  },
  // Legacy — kept as redirect targets
  { path: '/story/:projectId', title: 'nav.story' },
  { path: '/studio', title: 'nav.studio', meta: { preserveState: true } },
  { path: '/visualizer', title: 'nav.visualizer', meta: { preserveState: true } },
  { path: '/preview/:projectId', title: 'nav.preview' },
  {
    path: '/templates',
    title: 'nav.templates',
  },
  {
    path: '/account',
    title: 'nav.account',
    meta: { requiresAuth: true },
  },
  {
    path: '/exports',
    title: 'nav.exports',
    meta: { requiresAuth: true },
  },
  {
    path: '/analytics',
    title: 'nav.analytics',
    meta: { requiresAuth: true },
  },
  {
    path: '/signin',
    title: 'nav.signIn',
  },
  {
    path: '/help',
    title: 'nav.help',
  },
];

/**
 * Get route config by path. Handles both exact and parameterized paths.
 */
export function getRouteByPath(path: string): RouteConfig | undefined {
  return routes.find((route) => {
    if (route.path === path) return true;
    const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(path);
  });
}

/**
 * Check if a path is a valid route
 */
export function isValidRoute(path: string): boolean {
  return routes.some((route) => route.path === path);
}
