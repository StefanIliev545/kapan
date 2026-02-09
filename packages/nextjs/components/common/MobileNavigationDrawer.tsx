"use client";

import React, { useCallback } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

// Static animation variants - extracted to module level to avoid recreation
const BACKDROP_INITIAL = { opacity: 0 };
const BACKDROP_ANIMATE = { opacity: 1 };
const BACKDROP_EXIT = { opacity: 0 };

const DRAWER_INITIAL = { opacity: 0, y: -10 };
const DRAWER_ANIMATE = { opacity: 1, y: 0 };
const DRAWER_EXIT = { opacity: 0, y: -10 };
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
            className="bg-base-100 fixed inset-0 top-16 z-50 flex flex-col overflow-y-auto"
            onClick={handleDrawerClick}
          >
            <div className="flex flex-1 flex-col p-6">
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
              <ul className="space-y-3 text-lg">{menuLinks}</ul>

              {/* Wallet buttons */}
              <div className="border-base-content/10 mt-auto border-t pt-6">
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
