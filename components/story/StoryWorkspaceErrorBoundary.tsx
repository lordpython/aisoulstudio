/**
 * StoryWorkspaceErrorBoundary.tsx
 * Error boundary with recovery options for StoryWorkspace.
 */

import React from "react";
import { AlertCircle, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoryState } from "@/types";

interface StoryWorkspaceErrorBoundaryProps {
  children: React.ReactNode;
  storyState: StoryState;
  onRestore?: () => void;
}

interface StoryWorkspaceErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class StoryWorkspaceErrorBoundary extends React.Component<
  StoryWorkspaceErrorBoundaryProps,
  StoryWorkspaceErrorBoundaryState
> {
  constructor(props: StoryWorkspaceErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): StoryWorkspaceErrorBoundaryState {
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[StoryWorkspaceError] Caught error:", error);
    console.error("[StoryWorkspaceError] Component stack:", errorInfo.componentStack);
    console.error("[StoryWorkspaceError] Story State at error:", {
      step: this.props.storyState.currentStep,
      hasBreakdownSteps: this.props.storyState.breakdown?.length || 0,
      hasBreakdown: !!this.props.storyState.breakdown,
      hasScript: !!this.props.storyState.script,
      charactersCount: this.props.storyState.characters?.length || 0,
      shotsCount: this.props.storyState.shotlist?.length || 0,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  handleRestore = (): void => {
    this.props.onRestore?.();
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-[60vh] p-8 bg-black"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {/* Error Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 rounded-sm bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
          </div>

          {/* Error Message */}
          <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 mb-2">
            Story Workspace Crashed
          </h2>

          <p className="text-zinc-500 text-sm text-center max-w-md mb-6">
            An unexpected error occurred while working on your story. Don't worry — your work is auto-saved.
          </p>

          {/* Error Details */}
          {this.state.error && (
            <details className="mb-6 text-sm text-zinc-600 max-w-md w-full">
              <summary className="cursor-pointer hover:text-zinc-400 font-mono text-xs mb-2">
                Technical Details
              </summary>
              <pre className="mt-2 p-3 bg-zinc-900 rounded-sm text-xs overflow-auto max-h-32 border border-zinc-800 text-zinc-400">
                {this.state.error.message}
              </pre>
            </details>
          )}

          {/* Error Reference ID */}
          {this.state.errorId && (
            <p
              className="font-mono text-[10px] text-zinc-700 mb-8"
              aria-label={`Error reference ID: ${this.state.errorId}`}
            >
              Reference: <code className="px-2 py-1 bg-zinc-900 rounded-sm border border-zinc-800">{this.state.errorId}</code>
            </p>
          )}

          {/* Recovery Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={this.handleRestore}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-sm font-sans"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore Last Save
            </Button>

            <Button
              onClick={this.handleRetry}
              variant="outline"
              className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 rounded-sm font-sans"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>

            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="border-zinc-800 text-zinc-500 hover:bg-zinc-900 rounded-sm font-sans"
            >
              Refresh Page
            </Button>
          </div>

          {/* Help Text */}
          <p className="mt-8 text-xs text-zinc-700 text-center max-w-sm">
            If the problem persists, try refreshing the page or starting a new project.
            Your previous work is saved in version history.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
