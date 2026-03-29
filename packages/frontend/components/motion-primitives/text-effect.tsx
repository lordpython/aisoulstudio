import React from 'react';
import { motion, type Variants } from 'framer-motion';

type TextEffectPer = 'word' | 'char';

interface TextEffectProps {
  children: string;
  per?: TextEffectPer;
  className?: string;
  delay?: number;
  duration?: number;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
}

const defaultContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
    },
  },
};

const defaultItemVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

export function TextEffect({
  children,
  per = 'word',
  className,
  delay = 0,
  duration = 0.3,
  variants,
}: TextEffectProps) {
  const segments = per === 'char' ? children.split('') : children.split(' ');

  const containerVariants = variants?.container ?? {
    ...defaultContainerVariants,
    visible: {
      transition: {
        staggerChildren: per === 'char' ? 0.02 : 0.05,
        delayChildren: delay,
      },
    },
  };

  const itemVariants = variants?.item ?? {
    ...defaultItemVariants,
    visible: {
      ...defaultItemVariants.visible as object,
      transition: { duration, ease: 'easeOut' },
    },
  };

  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      aria-label={children}
    >
      {segments.map((segment, i) => (
        <motion.span
          key={i}
          variants={itemVariants}
          className="inline-block"
          style={per === 'word' ? { marginRight: '0.25em' } : undefined}
        >
          {segment === ' ' ? '\u00A0' : segment}
        </motion.span>
      ))}
    </motion.span>
  );
}
