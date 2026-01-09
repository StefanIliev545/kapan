"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

interface MobileMenuButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

/**
 * Animated mobile menu button (hamburger/close icon).
 * Displays a hamburger icon when closed, X icon when open.
 */
export const MobileMenuButton = ({ isOpen, onClick }: MobileMenuButtonProps) => {
  return (
    <button
      aria-label="Menu"
      className="btn btn-circle btn-ghost btn-sm focus:ring-primary/50 dark:focus:ring-accent/50 focus:outline-none focus:ring-2"
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isOpen ? "close" : "open"}
          initial={{ rotate: isOpen ? -90 : 90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: isOpen ? 90 : -90, opacity: 0 }}
          transition={{ duration: 0.2 }}
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
