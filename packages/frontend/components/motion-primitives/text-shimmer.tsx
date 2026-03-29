import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  return (
    <motion.span
      className={cn(
        'relative inline-block bg-clip-text text-transparent',
        className
      )}
      style={{
        backgroundImage: `linear-gradient(
          90deg,
          rgba(161,161,170,0.4) 0%,
          rgba(228,228,231,1) 40%,
          rgba(161,161,170,0.4) 80%
        )`,
        backgroundSize: `${spread * 100}% 100%`,
      }}
      animate={{
        backgroundPosition: ['200% center', '-200% center'],
      }}
      transition={{
        repeat: Infinity,
        duration,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}
