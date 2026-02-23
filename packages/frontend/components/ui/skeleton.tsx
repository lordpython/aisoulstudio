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

/**
 * SkeletonImage - Image placeholder with aspect ratio support
 */
function SkeletonImage({
    aspectRatio = "16/9",
    className,
    ...props
}: { aspectRatio?: string } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <Skeleton
            variant="rectangular"
            className={cn("w-full", className)}
            style={{ aspectRatio }}
            {...props}
        />
    )
}

/**
 * SkeletonStoryCard - Skeleton for story/shot cards in Story Mode
 */
function SkeletonStoryCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/10 bg-black/20 p-4 space-y-3",
                className
            )}
            {...props}
        >
            <SkeletonImage aspectRatio="16/9" className="rounded-lg" />
            <div className="space-y-2">
                <Skeleton variant="text" className="h-5 w-3/4" />
                <Skeleton variant="text" className="h-4 w-full" />
                <Skeleton variant="text" className="h-4 w-2/3" />
            </div>
            <div className="flex items-center gap-2 pt-2">
                <Skeleton variant="text" className="h-8 w-24 rounded-full" />
                <Skeleton variant="text" className="h-8 w-24 rounded-full" />
            </div>
        </div>
    )
}

/**
 * SkeletonShotGrid - Grid of skeleton shot cards
 */
function SkeletonShotGrid({
    count = 6,
    className,
    ...props
}: { count?: number } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
                className
            )}
            {...props}
        >
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonStoryCard key={i} />
            ))}
        </div>
    )
}

/**
 * SkeletonTimeline - Timeline/video editor skeleton
 */
function SkeletonTimeline({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-lg border border-white/10 bg-black/30 p-4 space-y-3",
                className
            )}
            {...props}
        >
            {/* Playback controls */}
            <div className="flex items-center gap-3">
                <Skeleton variant="circular" className="w-10 h-10" />
                <Skeleton variant="text" className="h-2 flex-1 rounded-full" />
                <Skeleton variant="text" className="h-4 w-16" />
            </div>
            {/* Timeline tracks */}
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                        <Skeleton variant="text" className="h-4 w-16" />
                        <div className="flex-1 flex gap-1">
                            {Array.from({ length: 4 + i }).map((_, j) => (
                                <Skeleton
                                    key={j}
                                    variant="rectangular"
                                    className="h-12 rounded"
                                    style={{ width: `${15 + Math.random() * 20}%` }}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * SkeletonCharacterCard - Character profile skeleton
 */
function SkeletonCharacterCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/10 bg-black/20 p-4 flex gap-4",
                className
            )}
            {...props}
        >
            <Skeleton variant="circular" className="w-20 h-20 flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="h-5 w-1/2" />
                <Skeleton variant="text" className="h-4 w-3/4" />
                <Skeleton variant="text" className="h-4 w-full" />
                <div className="flex gap-2 pt-2">
                    <Skeleton variant="text" className="h-6 w-16 rounded-full" />
                    <Skeleton variant="text" className="h-6 w-16 rounded-full" />
                </div>
            </div>
        </div>
    )
}

/**
 * SkeletonSceneBreakdown - Scene breakdown list skeleton
 */
function SkeletonSceneBreakdown({
    sceneCount = 3,
    className,
    ...props
}: { sceneCount?: number } & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("space-y-4", className)} {...props}>
            {Array.from({ length: sceneCount }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3"
                >
                    <div className="flex items-center justify-between">
                        <Skeleton variant="text" className="h-6 w-32" />
                        <Skeleton variant="text" className="h-4 w-20" />
                    </div>
                    <SkeletonText lines={2} />
                    <div className="flex gap-2">
                        <Skeleton variant="text" className="h-6 w-20 rounded-full" />
                        <Skeleton variant="text" className="h-6 w-24 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/**
 * SkeletonProjectCard - Project card skeleton for gallery
 */
function SkeletonProjectCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/10 bg-black/20 overflow-hidden",
                className
            )}
            {...props}
        >
            <SkeletonImage aspectRatio="16/9" />
            <div className="p-4 space-y-2">
                <Skeleton variant="text" className="h-5 w-2/3" />
                <Skeleton variant="text" className="h-4 w-1/2" />
                <div className="flex items-center justify-between pt-2">
                    <Skeleton variant="text" className="h-4 w-20" />
                    <Skeleton variant="circular" className="w-8 h-8" />
                </div>
            </div>
        </div>
    )
}

export {
    Skeleton,
    SkeletonText,
    SkeletonCard,
    SkeletonImage,
    SkeletonStoryCard,
    SkeletonShotGrid,
    SkeletonTimeline,
    SkeletonCharacterCard,
    SkeletonSceneBreakdown,
    SkeletonProjectCard
}
