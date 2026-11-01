"use client";

import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect } from "react";

export function Ticker({ value, digits = 2, suffix = "", className }: { value: number; digits?: number; suffix?: string; className?: string }) {
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (latest) => `${latest.toFixed(digits)}${suffix}`);
  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [motionValue, value]);
  return <motion.span className={className}>{text}</motion.span>;
}
