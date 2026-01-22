import React from "react";
import { cn } from "@/lib/utils";

/**
 * AmbientBackground Component
 * 
 * Provides the signature "Deep Space" background for the Invisible Interface.
 * Features animated glowing orbs and a subtle noise texture (optional).
 * Fixed position to sit behind all content.
 */
export function AmbientBackground({ className }: { className?: string }) {
    return (
        <div className={cn("fixed inset-0 z-[-1] overflow-hidden pointer-events-none", className)}>
            {/* Deep dark base is handled by body bg-background, but we ensure it here too if needed */}
            <div className="absolute inset-0 bg-background/80" />

            {/* Primary Nebula (Purple/Indigo) */}
            <div
                className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-900/20 rounded-full blur-[120px] mix-blend-screen animate-pulse-slow"
                style={{ animationDuration: '15s' }}
            />

            {/* Secondary Nebula (Blue/Cyan) */}
            <div
                className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/15 rounded-full blur-[100px] mix-blend-screen animate-pulse-slow"
                style={{ animationDuration: '20s', animationDelay: '2s' }}
            />

            {/* Accent Glow (Subtle warm highlight) */}
            <div
                className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-purple-800/10 rounded-full blur-[80px] mix-blend-screen animate-pulse-slow"
                style={{ animationDuration: '12s', animationDelay: '5s' }}
            />
        </div>
    );
}
