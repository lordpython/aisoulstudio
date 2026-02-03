import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Music,
  Download,
  Video,
  MoreVertical,
  Share2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppState, SongData } from "../../types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/useLanguage";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BackArrow, ForwardChevron } from "./DirectionalIcon";
import { UserMenu } from "@/components/auth";
import { useAuth } from "@/hooks/useAuth";

// Legacy Header Props for backward compatibility
export interface LegacyHeaderProps {
  songData: SongData | null;
  contentType: "music" | "story";
  appState: AppState;
  onDownloadSRT: () => void;
  onExportVideo: () => void;
}

// New Header Props for i18n-aware header
export interface HeaderProps {
  showBackButton?: boolean;
  title?: string;
  actions?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}

/**
 * DirectionalChevron - Renders the correct chevron based on RTL/LTR
 * Uses the ForwardChevron from DirectionalIcon
 */
const DirectionalChevron: React.FC<{ size?: number; className?: string }> = ({ 
  size = 12, 
  className 
}) => {
  return <ForwardChevron size={size} className={className} />;
};

/**
 * DirectionalBackArrow - Renders the correct back arrow based on RTL/LTR
 * Uses the BackArrow from DirectionalIcon
 */
const DirectionalBackArrow: React.FC<{ size?: number; className?: string }> = ({ 
  size = 18, 
  className 
}) => {
  return <BackArrow size={size} className={className} />;
};

/**
 * New i18n-aware Header component
 * Includes language switcher and supports RTL layout
 * Requirements: 9.2 - Add ARIA labels for navigation elements
 */
export const Header: React.FC<HeaderProps> = ({
  showBackButton = false,
  title,
  actions,
  onBack,
  className,
}) => {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header 
      className={cn(
        "glass-panel rounded-2xl h-16 px-6 flex items-center justify-between transition-all duration-500 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)]",
        className
      )}
      role="banner"
      aria-label={t('a11y.mainNav')}
    >
      {/* Left side - Back button and title */}
      <nav 
        className={cn(
          "flex items-center gap-4",
          isRTL && "flex-row-reverse"
        )}
        aria-label={t('a11y.mainNav')}
      >
        {showBackButton && onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 w-9 rounded-lg focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
            aria-label={t('nav.back')}
          >
            <DirectionalBackArrow size={18} aria-hidden="true" />
          </Button>
        )}
        
        {title && (
          <h1 className="font-semibold text-foreground tracking-tight text-lg">
            {title}
          </h1>
        )}

        {!title && (
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent" aria-label={t('home.title')}>
            {t('home.title')}
          </span>
        )}
      </nav>

      {/* Right side - Actions, User Menu, and Language Switcher */}
      <div
        className={cn(
          "flex items-center gap-2",
          isRTL && "flex-row-reverse"
        )}
        role="toolbar"
        aria-label="Header actions"
      >
        {actions}

        {user && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/projects')}
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 gap-2 rounded-lg"
            >
              <FolderOpen size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{t('nav.projects') || 'My Projects'}</span>
            </Button>
            <div className="h-4 w-[1px] bg-white/[0.1] mx-1" aria-hidden="true" />
          </>
        )}

        <UserMenu />

        <LanguageSwitcher variant="dropdown" />
      </div>
    </header>
  );
};

/**
 * Legacy Editor Header - maintains backward compatibility
 * Used in the visualizer/editor view with project-specific controls
 * Requirements: 9.2 - Add ARIA labels for navigation elements
 */
export const EditorHeader: React.FC<LegacyHeaderProps> = ({
  songData,
  contentType,
  appState,
  onDownloadSRT,
  onExportVideo,
}) => {
  const { t, isRTL } = useLanguage();

  if (!songData) return null;

  return (
    <header 
      className="glass-panel rounded-2xl h-16 px-6 flex items-center justify-between transition-all duration-500 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)]"
      role="banner"
      aria-label={t('a11y.mainNav')}
    >
      {/* Project Context */}
      <div className={cn(
        "flex items-center gap-4",
        isRTL && "flex-row-reverse"
      )}>
        <div className="relative group" aria-hidden="true">
          <div className="absolute inset-0 bg-primary/20 blur-lg rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-white/[0.08] to-transparent border border-white/[0.05] flex items-center justify-center">
            <Music size={18} className="text-primary" />
          </div>
        </div>
        
        <div className={cn(
          "flex flex-col",
          isRTL && "items-end"
        )}>
          <div className={cn(
            "flex items-center gap-2",
            isRTL && "flex-row-reverse"
          )}>
            <h2 className="font-semibold text-foreground tracking-tight">
              {songData.fileName}
            </h2>
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[10px] font-medium text-muted-foreground uppercase tracking-wider border border-white/[0.05]">
              {contentType}
            </span>
          </div>
          
          {/* Breadcrumb navigation */}
          <nav 
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground",
              isRTL && "flex-row-reverse"
            )}
            aria-label="Breadcrumb"
          >
            <span className="hover:text-primary transition-colors cursor-pointer">
              {t('nav.home')}
            </span>
            <DirectionalChevron size={12} className="opacity-50" aria-hidden="true" />
            <span className="text-foreground/80" aria-current="page">{t('studio.edit')}</span>
          </nav>
        </div>
      </div>

      {/* Action Island */}
      <div 
        className={cn(
          "flex items-center gap-2",
          isRTL && "flex-row-reverse"
        )}
        role="toolbar"
        aria-label="Editor actions"
      >
        {appState === AppState.READY && (
          <>
            <Button
              onClick={onDownloadSRT}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 gap-2 rounded-lg focus:ring-2 focus:ring-primary/50"
              aria-label={t('common.download')}
            >
              <Download size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.download')}</span>
            </Button>
            
            <div className="h-4 w-[1px] bg-white/[0.1] mx-1" aria-hidden="true" />
            
            <Button
              onClick={onExportVideo}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] h-9 px-4 rounded-lg font-semibold gap-2 transition-all duration-300 hover:scale-105 focus:ring-2 focus:ring-primary/50"
              aria-label={t('studio.export')}
            >
              <Video size={16} aria-hidden="true" />
              {t('studio.export')}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 w-9 rounded-lg focus:ring-2 focus:ring-primary/50"
              aria-label="Share"
            >
              <Share2 size={16} aria-hidden="true" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-white/[0.05] h-9 w-9 rounded-lg focus:ring-2 focus:ring-primary/50"
              aria-label="More options"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </Button>
          </>
        )}
        
        <div className="h-4 w-[1px] bg-white/[0.1] mx-1" aria-hidden="true" />
        
        <LanguageSwitcher variant="icon" />
      </div>
    </header>
  );
};
