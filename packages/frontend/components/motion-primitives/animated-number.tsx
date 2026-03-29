import React, { useEffect, useRef } from 'react';
import { useSpring, useMotionValue, useTransform, motion, type SpringOptions } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
  decimals?: number;
}

export function AnimatedNumber({
  value,
  className,
  springOptions = { bounce: 0, duration: 800 },
  decimals = 0,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, springOptions);
  const display = useTransform(spring, (current) =>
    current.toFixed(decimals)
  );

  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      motionValue.set(value);
      prevValue.current = value;
    }
  }, [value, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
