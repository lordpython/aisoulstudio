/**
 * Router configuration for LyricLens
 * Requirements: 2.1 - Use React Router for all navigation
 * Requirements: 2.2 - Support routes: / (Home), /studio (Studio), /visualizer (Visualizer)
 * Requirements: 5.1 - Show NotFound page for invalid routes
 */

import { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom';
import { RouteLayout } from './RouteLayout';

// Lazy load screen components for code splitting
const HomeScreen = lazy(() => import('../screens/HomeScreen'));
const StudioScreen = lazy(() => import('../screens/StudioScreen'));
const VisualizerScreen = lazy(() => import('../screens/VisualizerScreen'));
const ProjectsScreen = lazy(() => import('../screens/ProjectsScreen'));
const NewProjectScreen = lazy(() => import('../screens/NewProjectScreen'));
const GradientGeneratorScreen = lazy(() => import('../screens/GradientGeneratorScreen'));
const PreviewScreen = lazy(() => import('../screens/PreviewScreen'));
const ProjectSettingsScreen = lazy(() => import('../screens/ProjectSettingsScreen'));
const TemplatesScreen = lazy(() => import('../screens/TemplatesScreen'));
const AccountScreen = lazy(() => import('../screens/AccountScreen'));
const ExportsScreen = lazy(() => import('../screens/ExportsScreen'));
const AnalyticsScreen = lazy(() => import('../screens/AnalyticsScreen'));
const SignInScreen = lazy(() => import('../screens/SignInScreen'));
const HelpScreen = lazy(() => import('../screens/HelpScreen'));
const NotFoundScreen = lazy(() => import('../screens/NotFoundScreen'));

function ProjectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/studio?projectId=${projectId}`} replace />;
}

function StoryRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  return <Navigate to={`/studio?projectId=${projectId}&mode=story`} replace />;
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

/**
 * Main router component with all route definitions
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route element={<RouteLayout />}>
            {/* Home route - default landing page */}
            <Route path="/" element={<HomeScreen />} />

            {/* Projects route - user's project dashboard */}
            <Route path="/projects" element={<ProjectsScreen />} />

            {/* New Project wizard */}
            <Route path="/projects/new" element={<NewProjectScreen />} />

            {/* Direct project access — redirects to /studio?projectId=... */}
            <Route path="/projects/:projectId" element={<ProjectRoute />} />

            {/* Story mode direct access — redirects to /studio?projectId=...&mode=story */}
            <Route path="/story/:projectId" element={<StoryRoute />} />

            {/* Studio route - unified creation workspace */}
            <Route path="/studio" element={<StudioScreen />} />

            {/* Visualizer route - audio-first lyric videos */}
            <Route path="/visualizer" element={<VisualizerScreen />} />

            {/* Video preview route */}
            <Route path="/preview/:projectId" element={<PreviewScreen />} />

            {/* Project settings route */}
            <Route path="/projects/:projectId/settings" element={<ProjectSettingsScreen />} />

            {/* Template gallery route */}
            <Route path="/templates" element={<TemplatesScreen />} />

            {/* Account / profile route */}
            <Route path="/account" element={<AccountScreen />} />

            {/* Export history route */}
            <Route path="/exports" element={<ExportsScreen />} />

            {/* Analytics dashboard route */}
            <Route path="/analytics" element={<AnalyticsScreen />} />

            {/* Gradient Generator route - CSS gradient creation tool */}
            <Route path="/gradient-generator" element={<GradientGeneratorScreen />} />

            {/* Help route - keyboard shortcuts & documentation */}
            <Route path="/help" element={<HelpScreen />} />

            {/* Sign-in route - authentication page */}
            <Route path="/signin" element={<SignInScreen />} />

            {/* Catch-all: show 404 page for invalid routes (Requirement 5.1) */}
            <Route path="*" element={<NotFoundScreen />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export { routes, getRouteByPath, isValidRoute } from './routes';
export { UnsavedChangesGuard, useUnsavedChanges } from './guards';
