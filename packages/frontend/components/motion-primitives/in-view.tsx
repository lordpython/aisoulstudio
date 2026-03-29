import React, { useRef } from 'react';
import { motion, useInView, type Variants, type Transition } from 'framer-motion';

interface InViewProps {
  children: React.ReactNode;
  variants?: Variants;
  transition?: Transition;
  viewOptions?: { margin?: string; amount?: number | 'some' | 'all' };
  className?: string;
  as?: React.ElementType;
}

export function InView({
  children,
  variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  },
  transition = { duration: 0.4, ease: 'easeOut' },
  viewOptions = { margin: '0px 0px -60px 0px', amount: 0.1 },
  className,
  as: Tag = 'div',
}: InViewProps) {
  const ref = useRef<Element>(null);
  const isInView = useInView(ref, { once: true, ...viewOptions } as Parameters<typeof useInView>[1]);

  const MotionTag = motion(Tag as React.ElementType);

  return (
    <MotionTag
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={variants}
      transition={transition}
      className={className}
    >
      {children}
    </MotionTag>
  );
}
