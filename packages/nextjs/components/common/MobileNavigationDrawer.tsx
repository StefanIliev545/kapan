"use client";

import React, { useCallback } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

// Static animation variants - extracted to module level to avoid recreation
const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };

const DRAWER_INITIAL = { opacity: 0, x: -20 };
const DRAWER_ANIMATE = { opacity: 1, x: 0 };
const DRAWER_EXIT = { opacity: 0, x: -20 };
const DRAWER_TRANSITION = { duration: 0.2 };

interface MobileNavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  menuLinks: React.ReactNode;
  walletButtons: React.ReactNode;
}

/**
 * Mobile navigation drawer with logo, menu links, and wallet buttons.
 * Slides in from the left with a backdrop overlay.
 */
export const MobileNavigationDrawer = ({
  isOpen,
  onClose,
  menuLinks,
  walletButtons,
}: MobileNavigationDrawerProps) => {
  // Memoized event handler to stop propagation
  const handleDrawerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={BACKDROP_INITIAL}
          animate={BACKDROP_ANIMATE}
          exit={BACKDROP_EXIT}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        >
          <motion.div
            initial={DRAWER_INITIAL}
            animate={DRAWER_ANIMATE}
            exit={DRAWER_EXIT}
            transition={DRAWER_TRANSITION}
            className="fixed left-4 top-16 z-50 w-72 rounded-lg shadow-2xl"
            onClick={handleDrawerClick}
          >
            <div className="bg-base-200/95 border-base-content/10 rounded-xl border p-6 shadow-lg backdrop-blur-md">
              {/* Logo header */}
              <div className="border-base-content/10 mb-6 border-b pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative size-10">
                    <Image
                      alt="Kapan logo"
                      className="object-contain opacity-60"
                      fill
                      src="/seal-logo.png"
                    />
                  </div>
                  <span className="text-base-content/60 text-base font-bold uppercase tracking-wider">
                    Kapan
                  </span>
                </div>
              </div>

              {/* Menu links */}
              <ul className="space-y-2">{menuLinks}</ul>

              {/* Wallet buttons */}
              <div className="border-base-content/10 mt-6 border-t pt-4">
                <div className="relative z-50 flex flex-col items-stretch space-y-3">
                  {walletButtons}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
