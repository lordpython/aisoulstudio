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
} from 'react-router-dom';
import { RouteLayout } from './RouteLayout';

// Lazy load screen components for code splitting
const HomeScreen = lazy(() => import('../screens/HomeScreen'));
const StudioScreen = lazy(() => import('../screens/StudioScreen'));
const VisualizerScreen = lazy(() => import('../screens/VisualizerScreen'));
const ProjectsScreen = lazy(() => import('../screens/ProjectsScreen'));
const SettingsScreen = lazy(() => import('../screens/SettingsScreen'));
const SignInScreen = lazy(() => import('../screens/SignInScreen'));
const NotFoundScreen = lazy(() => import('../screens/NotFoundScreen'));

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

            {/* Studio route - unified creation workspace */}
            <Route path="/studio" element={<StudioScreen />} />
            
            {/* Visualizer route - audio-first lyric videos */}
            <Route path="/visualizer" element={<VisualizerScreen />} />

            {/* Settings route - API key management */}
            <Route path="/settings" element={<SettingsScreen />} />

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
