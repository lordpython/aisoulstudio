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

/**
 * Specialized Error Boundary for StoryWorkspace that provides
 * recovery options and state restoration capabilities.
 * 
 * Addresses Design Review Issue #23 (Critical)
 */
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
    
    // Log error details for debugging
    console.error("[StoryWorkspaceError] Story State at error:", {
      step: this.props.storyState.currentStep,
      hasIdea: !!this.props.storyState.idea,
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
          className="flex flex-col items-center justify-center min-h-[60vh] p-8 bg-[var(--cinema-void)]"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {/* Error Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
          </div>

          {/* Error Message */}
          <h2 className="font-display text-2xl text-[var(--cinema-silver)] mb-2">
            Story Workspace Crashed
          </h2>
          
          <p className="font-script italic text-[var(--cinema-silver)]/60 text-center max-w-md mb-6">
            An unexpected error occurred while working on your story. Don't worry - your work is auto-saved.
          </p>

          {/* Error Details (Collapsible) */}
          {this.state.error && (
            <details className="mb-6 text-sm text-[var(--cinema-silver)]/50 max-w-md w-full">
              <summary className="cursor-pointer hover:text-[var(--cinema-silver)]/70 font-mono text-xs mb-2">
                Technical Details
              </summary>
              <pre className="mt-2 p-3 bg-[var(--cinema-celluloid)]/30 rounded text-xs overflow-auto max-h-32 border border-[var(--cinema-silver)]/10">
                {this.state.error.message}
              </pre>
            </details>
          )}

          {/* Error Reference ID */}
          {this.state.errorId && (
            <p 
              className="text-xs font-mono text-[var(--cinema-silver)]/30 mb-8"
              aria-label={`Error reference ID: ${this.state.errorId}`}
            >
              Reference: <code className="px-2 py-1 bg-[var(--cinema-celluloid)]/20 rounded">{this.state.errorId}</code>
            </p>
          )}

          {/* Recovery Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={this.handleRestore}
              className="bg-[var(--cinema-spotlight)] hover:bg-[var(--cinema-spotlight)]/80 text-[var(--cinema-void)] font-editorial"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore Last Save
            </Button>
            
            <Button
              onClick={this.handleRetry}
              variant="outline"
              className="border-[var(--cinema-silver)]/30 text-[var(--cinema-silver)] hover:bg-[var(--cinema-silver)]/10 font-editorial"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="border-[var(--cinema-silver)]/20 text-[var(--cinema-silver)]/60 hover:bg-[var(--cinema-silver)]/5 font-editorial"
            >
              Refresh Page
            </Button>
          </div>

          {/* Help Text */}
          <p className="mt-8 text-xs text-[var(--cinema-silver)]/40 text-center max-w-sm">
            If the problem persists, try refreshing the page or starting a new project. 
            Your previous work is saved in version history.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
