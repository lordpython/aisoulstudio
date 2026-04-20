/**
 * Router configuration — canonical nested routes per project.
 *
 * Canonical project URLs:
 *   /projects/:id/story
 *   /projects/:id/video
 *   /projects/:id/music
 *   /projects/:id/preview
 *   /projects/:id/settings
 *
 * Legacy paths (/story/:id, /preview/:id, /projects/:id, /visualizer,
 * /studio?projectId=…&mode=…) remain as redirects so existing links don't break.
 */

import { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { RouteLayout } from './RouteLayout';

const HomeScreen = lazy(() => import('../screens/HomeScreen'));
const StudioScreen = lazy(() => import('../screens/StudioScreen'));
const VisualizerScreen = lazy(() => import('../screens/VisualizerScreen'));
const ProjectsScreen = lazy(() => import('../screens/ProjectsScreen'));
const NewProjectScreen = lazy(() => import('../screens/NewProjectScreen'));
const PreviewScreen = lazy(() => import('../screens/PreviewScreen'));
const ProjectSettingsScreen = lazy(() => import('../screens/ProjectSettingsScreen'));
const TemplatesScreen = lazy(() => import('../screens/TemplatesScreen'));
const AccountScreen = lazy(() => import('../screens/AccountScreen'));
const ExportsScreen = lazy(() => import('../screens/ExportsScreen'));
const AnalyticsScreen = lazy(() => import('../screens/AnalyticsScreen'));
const SignInScreen = lazy(() => import('../screens/SignInScreen'));
const HelpScreen = lazy(() => import('../screens/HelpScreen'));
const NotFoundScreen = lazy(() => import('../screens/NotFoundScreen'));

/** Default a bare /projects/:id to the story workspace. */
function ProjectDefaultRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}/story`} replace />;
}

/** Legacy /story/:id → /projects/:id/story */
function LegacyStoryRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}/story`} replace />;
}

/** Legacy /preview/:id → /projects/:id/preview */
function LegacyPreviewRedirect() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/projects/${projectId}/preview`} replace />;
}

/**
 * Legacy /studio?projectId=…&mode=… → /projects/:id/:mode
 * Falls through to /studio (no project) when no projectId present.
 */
function LegacyStudioRedirect() {
  const [params] = useSearchParams();
  const projectId = params.get('projectId');
  const modeRaw = params.get('mode');
  const mode = modeRaw === 'video' || modeRaw === 'music' || modeRaw === 'story' ? modeRaw : 'story';
  if (projectId) {
    return <Navigate to={`/projects/${projectId}/${mode}`} replace />;
  }
  return <StudioScreen />;
}

/** Legacy /visualizer → /studio (music mode entry handled inside Studio) */
function LegacyVisualizerRedirect() {
  return <VisualizerScreen />;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route element={<RouteLayout />}>
            <Route path="/" element={<HomeScreen />} />

            <Route path="/projects" element={<ProjectsScreen />} />
            <Route path="/projects/new" element={<NewProjectScreen />} />

            {/* Canonical nested project routes */}
            <Route path="/projects/:projectId" element={<ProjectDefaultRedirect />} />
            <Route path="/projects/:projectId/story" element={<StudioScreen />} />
            <Route path="/projects/:projectId/video" element={<StudioScreen />} />
            <Route path="/projects/:projectId/music" element={<StudioScreen />} />
            <Route path="/projects/:projectId/preview" element={<PreviewScreen />} />
            <Route path="/projects/:projectId/settings" element={<ProjectSettingsScreen />} />

            {/* Legacy redirects — kept for bookmarks, external links, and in-app history */}
            <Route path="/story/:projectId" element={<LegacyStoryRedirect />} />
            <Route path="/preview/:projectId" element={<LegacyPreviewRedirect />} />
            <Route path="/studio" element={<LegacyStudioRedirect />} />
            <Route path="/visualizer" element={<LegacyVisualizerRedirect />} />

            <Route path="/templates" element={<TemplatesScreen />} />
            <Route path="/account" element={<AccountScreen />} />
            <Route path="/exports" element={<ExportsScreen />} />
            <Route path="/analytics" element={<AnalyticsScreen />} />
            <Route path="/help" element={<HelpScreen />} />
            <Route path="/signin" element={<SignInScreen />} />

            <Route path="*" element={<NotFoundScreen />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export { routes, getRouteByPath, isValidRoute } from './routes';
export { UnsavedChangesGuard, useUnsavedChanges } from './guards';
