import React from "react";
import { cn } from "@/lib/utils";

/**
 * AmbientBackground Component
 *
 * Provides the signature "Deep Space" background for the Invisible Interface.
 * Features animated glowing orbs using the OKLCH design token palette.
 * Fixed position to sit behind all content.
 */
export function AmbientBackground({ className }: { className?: string }) {
    return (
        <div className={cn("fixed inset-0 z-[-1] overflow-hidden pointer-events-none", className)}>
            {/* Deep dark base is handled by body bg-background, but we ensure it here too */}
            <div className="absolute inset-0 bg-background/80" />

            {/* Primary Nebula — uses --primary (cyan/teal) */}
            <div
                className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full blur-[120px] mix-blend-screen animate-pulse-slow"
                style={{
                    backgroundColor: 'oklch(0.70 0.15 190 / 0.12)',
                    animationDuration: '15s',
                }}
            />

            {/* Secondary Nebula — uses --secondary (deep indigo) */}
            <div
                className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[100px] mix-blend-screen animate-pulse-slow"
                style={{
                    backgroundColor: 'oklch(0.30 0.08 240 / 0.10)',
                    animationDuration: '20s',
                    animationDelay: '2s',
                }}
            />

            {/* Accent Glow — uses --accent (supernova orange) */}
            <div
                className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full blur-[80px] mix-blend-screen animate-pulse-slow"
                style={{
                    backgroundColor: 'oklch(0.65 0.25 30 / 0.06)',
                    animationDuration: '12s',
                    animationDelay: '5s',
                }}
            />
        </div>
    );
}
