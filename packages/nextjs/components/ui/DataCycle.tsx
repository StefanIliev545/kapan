"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type DataCycleProps<T> = {
  items: T[];
  intervalMs?: number;
  className?: string;
  render: (item: T, index: number) => React.ReactNode;
  animation?: "slide" | "fade" | "pulse" | "zoom" | "slideX";
};

export function DataCycle<T>({ items, intervalMs = 3000, className, render, animation = "slide" }: DataCycleProps<T>) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!items?.length) return;
    const id = setInterval(() => {
      setIndex(prev => (prev + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [items, intervalMs]);

  if (!items?.length) return null;
  const current = items[index];

  const slideInitial = { opacity: 0, y: 10 };
  const slideAnimate = { opacity: 1, y: 0 };
  const slideExit = { opacity: 0, y: -10 };
  const slideXInitial = { opacity: 0, x: 16 };
  const slideXAnimate = { opacity: 1, x: 0 };
  const slideXExit = { opacity: 0, x: -16 };

  const zoomInitial = { opacity: 0, scale: 0.985 };
  const zoomAnimate = { opacity: 1, scale: 1 };
  const zoomExit = { opacity: 0, scale: 1.01 };

  const fadeInitial = { opacity: 0 };
  const fadeAnimate = { opacity: 1 };
  const fadeExit = { opacity: 0 };

  const isPulse = animation === "pulse";

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {isPulse ? (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: 1, scale: [1, 1.02, 1] }}
          transition={{ duration: 0.5, ease: "easeOut", times: [0, 0.25, 1] }}
        >
          {render(current, index)}
        </motion.div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={
              animation === "fade" ? fadeInitial :
              animation === "slideX" ? slideXInitial :
              animation === "zoom" ? zoomInitial :
              slideInitial
            }
            animate={
              animation === "fade" ? fadeAnimate :
              animation === "slideX" ? slideXAnimate :
              animation === "zoom" ? zoomAnimate :
              slideAnimate
            }
            exit={
              animation === "fade" ? fadeExit :
              animation === "slideX" ? slideXExit :
              animation === "zoom" ? zoomExit :
              slideExit
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {render(current, index)}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

export default DataCycle;


