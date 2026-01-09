"use client";

import React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

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
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-4 top-16 z-50 w-72 rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
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
