/**
 * Layout components for the LyricLens application.
 * These components provide the structural layout for the app.
 *
 * @example
 * import { AppLayout, Sidebar, Header, MainContent, AppShell, LanguageSwitcher, DirectionalIcon } from './components/layout';
 */

export { Sidebar, type SidebarProps } from "./Sidebar";
export { Header, EditorHeader, type HeaderProps, type LegacyHeaderProps } from "./Header";
export { MainContent, type MainContentProps } from "./MainContent";
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
