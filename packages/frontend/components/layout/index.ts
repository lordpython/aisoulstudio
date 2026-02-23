/**
 * Layout components for the LyricLens application.
 * These components provide the structural layout for the app.
 *
 * @example
 * import { AppLayout, Sidebar, AppShell, LanguageSwitcher, DirectionalIcon } from './components/layout';
 */

export { Sidebar, type SidebarProps } from "./Sidebar";
export { Header, EditorHeader, type HeaderProps, type LegacyHeaderProps } from "./Header";
export { AppLayout, type AppLayoutProps } from "./AppLayout";
export { AppShell, type AppShellProps } from "./AppShell";
export { LanguageSwitcher, type LanguageSwitcherProps } from "./LanguageSwitcher";
export {
  DirectionalIcon,
  DirectionalChevronRight,
  DirectionalChevronLeft,
  DirectionalArrowRight,
  DirectionalArrowLeft,
  BackArrow,
  ForwardArrow,
  BackChevron,
  ForwardChevron,
  type DirectionalIconProps,
} from "./DirectionalIcon";
