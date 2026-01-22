import React from 'react';
import {
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  ArrowLeft,
  ArrowRightCircle,
  ArrowLeftCircle,
  ChevronsRight,
  ChevronsLeft,
  CornerDownRight,
  CornerDownLeft,
  CornerUpRight,
  CornerUpLeft,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { cn } from '@/lib/utils';

/**
 * Map of directional icons and their RTL counterparts.
 * When RTL is active, these icons are swapped to their mirrored versions.
 */
const directionalIconPairs: Record<string, LucideIcon> = {
  ChevronRight: ChevronLeft,
  ChevronLeft: ChevronRight,
  ArrowRight: ArrowLeft,
  ArrowLeft: ArrowRight,
  ArrowRightCircle: ArrowLeftCircle,
  ArrowLeftCircle: ArrowRightCircle,
  ChevronsRight: ChevronsLeft,
  ChevronsLeft: ChevronsRight,
  CornerDownRight: CornerDownLeft,
  CornerDownLeft: CornerDownRight,
  CornerUpRight: CornerUpLeft,
  CornerUpLeft: CornerUpRight,
};

/**
 * List of icon names that should be flipped (mirrored) in RTL mode
 */
const flipInRTL = new Set([
  'ChevronRight',
  'ChevronLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRightCircle',
  'ArrowLeftCircle',
  'ChevronsRight',
  'ChevronsLeft',
  'CornerDownRight',
  'CornerDownLeft',
  'CornerUpRight',
  'CornerUpLeft',
]);

export interface DirectionalIconProps {
  /** The Lucide icon component to render */
  icon: LucideIcon;
  /** Size of the icon in pixels */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Stroke width for the icon */
  strokeWidth?: number;
  /** Whether to use swap mode (swap icon) or flip mode (CSS transform) */
  mode?: 'swap' | 'flip';
}

/**
 * DirectionalIcon component that handles RTL-aware icon rendering.
 * 
 * Supports two modes:
 * - 'swap': Swaps the icon with its RTL counterpart (e.g., ChevronRight → ChevronLeft)
 * - 'flip': Applies CSS transform to mirror the icon horizontally
 * 
 * @example
 * ```tsx
 * // Swap mode (default) - icon is replaced with RTL counterpart
 * <DirectionalIcon icon={ChevronRight} size={16} />
 * 
 * // Flip mode - icon is mirrored using CSS transform
 * <DirectionalIcon icon={ChevronRight} size={16} mode="flip" />
 * ```
 */
export const DirectionalIcon: React.FC<DirectionalIconProps> = ({
  icon: Icon,
  size = 16,
  className,
  strokeWidth = 2,
  mode = 'swap',
}) => {
  const { isRTL } = useLanguage();

  // Get the icon name for lookup
  const iconName = Icon.displayName || Icon.name || '';
  const shouldTransform = flipInRTL.has(iconName);

  if (mode === 'swap' && isRTL && shouldTransform) {
    // Swap mode: use the RTL counterpart icon
    const RTLIcon = directionalIconPairs[iconName];
    if (RTLIcon) {
      return (
        <RTLIcon
          size={size}
          strokeWidth={strokeWidth}
          className={className}
        />
      );
    }
  }

  // Flip mode or no swap available: apply CSS transform if needed
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={cn(
        className,
        mode === 'flip' && isRTL && shouldTransform && 'rtl-flip'
      )}
    />
  );
};

/**
 * Pre-configured directional icon components for common use cases
 */

export const DirectionalChevronRight: React.FC<Omit<DirectionalIconProps, 'icon'>> = (props) => (
  <DirectionalIcon icon={ChevronRight} {...props} />
);

export const DirectionalChevronLeft: React.FC<Omit<DirectionalIconProps, 'icon'>> = (props) => (
  <DirectionalIcon icon={ChevronLeft} {...props} />
);

export const DirectionalArrowRight: React.FC<Omit<DirectionalIconProps, 'icon'>> = (props) => (
  <DirectionalIcon icon={ArrowRight} {...props} />
);

export const DirectionalArrowLeft: React.FC<Omit<DirectionalIconProps, 'icon'>> = (props) => (
  <DirectionalIcon icon={ArrowLeft} {...props} />
);

/**
 * BackArrow component - always points "back" in the current reading direction
 * In LTR: points left (←)
 * In RTL: points right (→)
 */
export const BackArrow: React.FC<Omit<DirectionalIconProps, 'icon' | 'mode'>> = (props) => {
  const { isRTL } = useLanguage();
  const Icon = isRTL ? ArrowRight : ArrowLeft;
  return <Icon size={props.size || 16} strokeWidth={props.strokeWidth || 2} className={props.className} />;
};

/**
 * ForwardArrow component - always points "forward" in the current reading direction
 * In LTR: points right (→)
 * In RTL: points left (←)
 */
export const ForwardArrow: React.FC<Omit<DirectionalIconProps, 'icon' | 'mode'>> = (props) => {
  const { isRTL } = useLanguage();
  const Icon = isRTL ? ArrowLeft : ArrowRight;
  return <Icon size={props.size || 16} strokeWidth={props.strokeWidth || 2} className={props.className} />;
};

/**
 * BackChevron component - always points "back" in the current reading direction
 */
export const BackChevron: React.FC<Omit<DirectionalIconProps, 'icon' | 'mode'>> = (props) => {
  const { isRTL } = useLanguage();
  const Icon = isRTL ? ChevronRight : ChevronLeft;
  return <Icon size={props.size || 16} strokeWidth={props.strokeWidth || 2} className={props.className} />;
};

/**
 * ForwardChevron component - always points "forward" in the current reading direction
 */
export const ForwardChevron: React.FC<Omit<DirectionalIconProps, 'icon' | 'mode'>> = (props) => {
  const { isRTL } = useLanguage();
  const Icon = isRTL ? ChevronLeft : ChevronRight;
  return <Icon size={props.size || 16} strokeWidth={props.strokeWidth || 2} className={props.className} />;
};

export default DirectionalIcon;
