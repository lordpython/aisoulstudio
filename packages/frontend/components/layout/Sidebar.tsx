import React from "react";
import { Home, FolderOpen, Bot, Zap, HelpCircle, Music } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/i18n/useLanguage";

export interface SidebarProps {}

interface NavItemConfig {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  labelKey: string;
  miniLabel: string;
  route?: string;
  variant?: "default" | "primary";
  isExact?: boolean;
}

function isRouteActive(currentPath: string, itemRoute: string | undefined, isExact: boolean): boolean {
  if (!itemRoute) return false;
  if (isExact) return currentPath === itemRoute;
  return currentPath.startsWith(itemRoute);
}

const TOP_NAV: NavItemConfig[] = [
  { icon: Home, labelKey: "nav.home", miniLabel: "Home", route: "/", isExact: true },
  { icon: FolderOpen, labelKey: "nav.projects", miniLabel: "Files", route: "/projects", isExact: true },
];

const TOOL_NAV: NavItemConfig[] = [
  { icon: Bot, labelKey: "nav.studio", miniLabel: "Studio", route: "/studio", variant: "primary", isExact: false },
  { icon: Zap, labelKey: "nav.quickCreate", miniLabel: "Quick", route: "/visualizer", isExact: false },
];

const BOTTOM_NAV: NavItemConfig[] = [
  { icon: HelpCircle, labelKey: "nav.help", miniLabel: "Help" },
];

export const Sidebar: React.FC<SidebarProps> = () => {
  const { isRTL, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const renderNavItem = (item: NavItemConfig) => {
    const Icon = item.icon;
    const isActive = isRouteActive(location.pathname, item.route, item.isExact ?? false);
    const isDisabled = !item.route;
    const label = t(item.labelKey);

    return (
      <li key={item.labelKey}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={!isDisabled ? () => navigate(item.route!) : undefined}
              disabled={isDisabled}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 transition-all group",
                isActive ? "text-white" : "text-[oklch(0.48_0.03_240)] hover:text-white",
                isDisabled && "opacity-40 cursor-not-allowed pointer-events-none",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                  item.variant === "primary"
                    ? "bg-gradient-to-br from-[oklch(0.70_0.15_190)] to-[oklch(0.55_0.22_260)] opacity-90 group-hover:opacity-100 group-hover:shadow-[0_0_16px_oklch(0.70_0.15_190/0.4)]"
                    : isActive
                    ? "bg-[oklch(0.16_0.04_240)]"
                    : "group-hover:bg-[oklch(0.11_0.03_240)]",
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={1.6}
                  className={cn(
                    item.variant === "primary"
                      ? "text-white"
                      : isActive
                      ? "text-white"
                      : "text-[oklch(0.48_0.03_240)] group-hover:text-white",
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[9px] font-medium leading-none transition-colors",
                  isActive
                    ? "text-white"
                    : "text-[oklch(0.40_0.02_240)] group-hover:text-[oklch(0.62_0.03_240)]",
                )}
              >
                {item.miniLabel}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side={isRTL ? "left" : "right"}
            sideOffset={12}
            className="text-xs font-medium"
          >
            {isDisabled ? `${label} (${t("common.comingSoon")})` : label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex h-14 flex-shrink-0 items-center justify-center border-b border-[oklch(0.14_0.03_240)]">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => navigate("/")}
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "linear-gradient(135deg, oklch(0.75 0.15 80) 0%, oklch(0.60 0.18 50) 100%)",
              boxShadow: "0 2px 16px oklch(0.75 0.15 80 / 0.3)",
            }}
            aria-label="Home"
          >
            <Music className="h-4 w-4 text-[oklch(0.10_0.02_240)]" />
          </motion.button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation" role="navigation">
          <ul className="flex flex-col gap-0.5 px-1.5">
            {TOP_NAV.map(renderNavItem)}
          </ul>

          <div className="mx-2.5 my-2 h-px bg-[oklch(0.14_0.03_240)]" aria-hidden="true" />

          <ul className="flex flex-col gap-0.5 px-1.5">
            {TOOL_NAV.map(renderNavItem)}
          </ul>
        </nav>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t border-[oklch(0.14_0.03_240)] py-2">
          <ul className="flex flex-col gap-0.5 px-1.5">
            {BOTTOM_NAV.map(renderNavItem)}
          </ul>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Sidebar;
