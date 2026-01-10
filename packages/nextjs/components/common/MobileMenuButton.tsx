"use client";

import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

// Module-level constants for static animation values
const BUTTON_STYLE = { touchAction: "manipulation" } as const;
const ANIMATE_PROPS = { rotate: 0, opacity: 1 };
const TRANSITION_PROPS = { duration: 0.2 };

interface MobileMenuButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

/**
 * Animated mobile menu button (hamburger/close icon).
 * Displays a hamburger icon when closed, X icon when open.
 */
export const MobileMenuButton = ({ isOpen, onClick }: MobileMenuButtonProps) => {
  const initialProps = useMemo(() => ({ rotate: isOpen ? -90 : 90, opacity: 0 }), [isOpen]);
  const exitProps = useMemo(() => ({ rotate: isOpen ? 90 : -90, opacity: 0 }), [isOpen]);

  return (
    <button
      aria-label="Menu"
      className="btn btn-circle btn-ghost btn-sm focus:ring-primary/50 dark:focus:ring-accent/50 focus:outline-none focus:ring-2"
      onClick={onClick}
      style={BUTTON_STYLE}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isOpen ? "close" : "open"}
          initial={initialProps}
          animate={ANIMATE_PROPS}
          exit={exitProps}
          transition={TRANSITION_PROPS}
        >
          {isOpen ? (
            <XMarkIcon className="text-base-content size-6" />
          ) : (
            <Bars3Icon className="text-base-content size-6" />
          )}
        </motion.div>
      </AnimatePresence>
    </button>
  );
};
