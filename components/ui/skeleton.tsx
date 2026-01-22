import * as React from "react"
import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * The variant of the skeleton
     * - text: For text placeholders (default height, full width)
     * - circular: For avatar/icon placeholders (circle shape)
     * - rectangular: For image/card placeholders (larger height)
     */
    variant?: "text" | "circular" | "rectangular"
    /**
     * Width of the skeleton (CSS value)
     */
    width?: string | number
    /**
     * Height of the skeleton (CSS value)
     */
    height?: string | number
    /**
     * Whether to animate the skeleton
     */
    animate?: boolean
}

/**
 * Skeleton component for loading states.
 * Provides visual feedback while content is loading.
 * 
 * @example
 * // Text skeleton
 * <Skeleton className="h-4 w-full" />
 * 
 * // Circular skeleton (avatar)
 * <Skeleton variant="circular" className="w-10 h-10" />
 * 
 * // Rectangular skeleton (image)
 * <Skeleton variant="rectangular" className="w-full h-48" />
 */
function Skeleton({
    className,
    variant = "text",
    width,
    height,
    animate = true,
    ...props
}: SkeletonProps) {
    const variantStyles = {
        text: "h-4 rounded",
        circular: "rounded-full aspect-square",
        rectangular: "h-24 rounded-lg",
    }

    const style: React.CSSProperties = {
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
    }

    return (
        <div
            data-slot="skeleton"
            aria-hidden="true"
            role="presentation"
            className={cn(
                "bg-muted/50",
                animate && "animate-pulse",
                variantStyles[variant],
                className
            )}
            style={style}
            {...props}
        />
    )
}

/**
 * SkeletonText - Multiple skeleton lines for paragraph loading
 */
function SkeletonText({
    lines = 3,
    className,
    ...props
}: { lines?: number } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("space-y-2", className)} {...props}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    className={cn(
                        "h-4",
                        // Last line is shorter for natural look
                        i === lines - 1 && "w-3/4"
                    )}
                />
            ))}
        </div>
    )
}

/**
 * SkeletonCard - Card-shaped skeleton with header and content
 */
function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-lg border border-border/50 p-4 space-y-4",
                className
            )}
            {...props}
        >
            {/* Header with avatar and title */}
            <div className="flex items-center gap-3">
                <Skeleton variant="circular" className="w-10 h-10" />
                <div className="flex-1 space-y-2">
                    <Skeleton variant="text" className="h-4 w-1/2" />
                    <Skeleton variant="text" className="h-3 w-1/3" />
                </div>
            </div>
            {/* Content */}
            <Skeleton variant="rectangular" className="h-32 w-full" />
            {/* Footer */}
            <div className="flex gap-2">
                <Skeleton variant="text" className="h-8 w-20" />
                <Skeleton variant="text" className="h-8 w-20" />
            </div>
        </div>
    )
}

export { Skeleton, SkeletonText, SkeletonCard }
