import React from "react";
import { Music, Settings, Home, FolderOpen, HelpCircle, Bot, Zap, Palette } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/i18n/useLanguage";

export interface SidebarProps {
  // No props needed - navigation handled internally
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  variant?: "default" | "primary" | "accent";
  isRTL?: boolean;
  t: (key: string) => string; // Add translation function
}

const NavItem = React.memo<NavItemProps>(({
  icon,
  label,
  onClick,
  isActive,
  isDisabled,
  variant = "default",
  isRTL = false,
  t,
}) => {
  const baseStyles = "relative flex items-center justify-center w-10 h-10 rounded-xl cursor-pointer transition-all duration-300 group";
  const disabledStyles = "opacity-40 cursor-not-allowed pointer-events-none";

  const variantStyles = {
    default: cn(
      "text-muted-foreground hover:text-foreground hover:bg-white/[0.08]",
      isActive && "text-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.3)]"
    ),
    primary: "bg-gradient-to-br from-primary to-purple-600 text-white shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-110",
    accent: "text-accent-foreground bg-accent/10 border border-accent/20 hover:bg-accent/20 hover:border-accent/40",
  };

  // Handle keyboard activation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
      e.preventDefault();
      onClick?.();
    }
  };

  const handleClick = () => {
    if (!isDisabled) {
      onClick?.();
    }
  };

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <motion.div
          role="button"
          tabIndex={isDisabled ? -1 : 0}
          aria-label={label}
          aria-pressed={isActive}
          aria-disabled={isDisabled}
          className={cn(baseStyles, variantStyles[variant], isDisabled && disabledStyles)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          whileTap={isDisabled ? undefined : { scale: 0.9 }}
          whileHover={isDisabled ? undefined : { scale: 1.05 }}
        >
          {icon}

          {/* Active Indicator Dot - RTL aware positioning */}
          {isActive && !isDisabled && (
            <motion.div
              layoutId="active-dot"
              aria-hidden="true"
              className={cn(
                "absolute top-1 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]",
                isRTL ? "-left-1" : "-right-1"
              )}
            />
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent
        side={isRTL ? "left" : "right"}
        sideOffset={16}
        className="glass-panel border-white/10 text-xs font-medium tracking-wide"
      >
        {isDisabled ? `${label} (${t('common.comingSoon')})` : label}
      </TooltipContent>
    </Tooltip>
  );
});
NavItem.displayName = "NavItem";

// Navigation item configuration interface
interface NavItemConfig {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  labelKey: string;
  route?: string;
  variant?: "default" | "primary" | "accent";
  isExact?: boolean;
}

// Active route detection function
function isRouteActive(currentPath: string, itemRoute: string | undefined, isExact: boolean): boolean {
  if (!itemRoute) return false;
  
  if (isExact) {
    return currentPath === itemRoute;
  }
  return currentPath.startsWith(itemRoute);
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const { isRTL, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Navigation items configuration
  const navItems: NavItemConfig[] = [
    // Main navigation
    { icon: Home, labelKey: 'nav.home', route: '/', variant: 'default', isExact: true },
    { icon: FolderOpen, labelKey: 'nav.projects', route: '/projects', variant: 'default', isExact: true },

    // Creation tools
    { icon: Bot, labelKey: 'nav.studio', route: '/studio', variant: 'primary', isExact: false },
    { icon: Zap, labelKey: 'nav.quickCreate', route: '/visualizer', variant: 'default', isExact: false },
    { icon: Palette, labelKey: 'nav.gradientGenerator', route: '/gradient-generator', variant: 'default', isExact: true },
  ];

  // Bottom actions
  const bottomNavItems: NavItemConfig[] = [
    { icon: HelpCircle, labelKey: 'nav.help', route: undefined }, // disabled
    { icon: Settings, labelKey: 'nav.settings', route: '/settings', variant: 'default', isExact: true },
  ];

  return (
    <TooltipProvider>
      <nav
        className="flex flex-col items-center gap-6 py-2"
        aria-label="Main navigation"
        role="navigation"
      >
        {/* Logo Mark */}
        <div className="mb-2 relative group cursor-pointer" aria-hidden="true">
          <div className="absolute inset-0 bg-primary/40 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-accent flex items-center justify-center shadow-lg shadow-primary/25">
            <Music className="text-white w-5 h-5" />
          </div>
        </div>

        {/* Main Nav */}
        <div className="flex flex-col gap-3 w-full items-center">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(location.pathname, item.route, item.isExact ?? false);
            const isDisabled = item.route === undefined;

            return (
              <NavItem
                key={item.labelKey}
                icon={<Icon size={20} strokeWidth={1.5} />}
                label={t(item.labelKey)}
                onClick={item.route ? () => navigate(item.route!) : undefined}
                isActive={isActive}
                isDisabled={isDisabled}
                variant={item.variant}
                isRTL={isRTL}
                t={t}
              />
            );
          })}
        </div>

        {/* Separator */}
        <div className="w-8 h-[1px] bg-white/[0.08] rounded-full" role="separator" aria-hidden="true" />

        {/* Creation Tools */}
        <div className="flex flex-col gap-3 w-full items-center">
          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(location.pathname, item.route, item.isExact ?? false);
            const isDisabled = item.route === undefined;

            return (
              <NavItem
                key={item.labelKey}
                icon={<Icon size={20} strokeWidth={1.5} />}
                label={t(item.labelKey)}
                onClick={item.route ? () => navigate(item.route!) : undefined}
                isActive={isActive}
                isDisabled={isDisabled}
                variant={item.variant}
                isRTL={isRTL}
                t={t}
              />
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="mt-auto flex flex-col gap-3 w-full items-center pt-6">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isRouteActive(location.pathname, item.route, item.isExact ?? false);
            const isDisabled = item.route === undefined;

            return (
              <NavItem
                key={item.labelKey}
                icon={<Icon size={20} strokeWidth={1.5} />}
                label={t(item.labelKey)}
                onClick={item.route ? () => navigate(item.route!) : undefined}
                isActive={isActive}
                isDisabled={isDisabled}
                variant={item.variant}
                isRTL={isRTL}
                t={t}
              />
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
};
