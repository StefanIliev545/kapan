"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useLandingSection } from "~~/contexts/LandingSectionContext";
import { useAppUrl } from "~~/hooks/common";

/**
 * Landing page header - minimal dark theme design
 * Shows Launch App button when not on CTA sections (0 and last)
 */
export const LandingHeader = () => {
  const { currentSection, totalSections } = useLandingSection();
  const appUrl = useAppUrl();

  // Show launch button on sections that don't have their own CTA (sections 1-4)
  // Section 0 = Hero (has CTA), Section 5 = Final CTA (has CTA)
  const showLaunchButton = currentSection > 0 && currentSection < totalSections - 1;

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-4 md:px-8 md:py-6">
      <div className="flex items-center justify-between">
        {/* Left - Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative size-8 md:size-10">
            <Image
              alt="Kapan logo"
              className="object-contain opacity-60 transition-opacity duration-300 group-hover:opacity-100"
              fill
              src="/seal-logo.png"
              priority
            />
          </div>
          <span className="text-base-content/60 group-hover:text-base-content/100 text-sm font-bold uppercase tracking-wider transition-colors duration-300 md:text-base">
            Kapan
          </span>
        </Link>

        {/* Right - Nav links */}
        <div className="flex items-center gap-4">
          <Link
            href="/info"
            className="text-base-content/50 hover:text-base-content/100 text-xs font-semibold uppercase tracking-wider transition-colors duration-300"
          >
            Info
          </Link>
          <Link
            href="/about"
            className="text-base-content/50 hover:text-base-content/100 text-xs font-semibold uppercase tracking-wider transition-colors duration-300"
          >
            About
          </Link>
          
          {/* Launch App button (shown on non-CTA sections) - Fallout neon sign flicker */}
          <AnimatePresence>
            {showLaunchButton && (
              <motion.a
                href="/app"
                onClick={e => {
                  e.preventDefault();
                  track("To App conversion", { button: "Landing Header" });
                  window.location.assign(appUrl);
                }}
                initial={{ opacity: 0 }}
                animate={{ 
                  // Neon sign flicker: dark -> try to turn on -> fail -> try again -> flicker -> stabilize
                  opacity: [0, 0, 0.8, 0, 0, 0.6, 0.1, 0.9, 0.2, 1, 0.7, 1, 1],
                }}
                exit={{ 
                  opacity: [1, 0.5, 0.8, 0, 0.3, 0],
                }}
                transition={{ 
                  duration: 1.4,
                  times: [0, 0.1, 0.15, 0.22, 0.35, 0.42, 0.47, 0.55, 0.62, 0.75, 0.85, 0.92, 1],
                  ease: "linear",
                }}
                className="bg-primary/10 hover:bg-primary/20 border-primary/20 hover:border-primary/40 text-primary group flex items-center gap-2 rounded-lg border px-4 py-2 transition-all duration-300"
              >
                <span className="text-xs font-semibold uppercase tracking-wider">Launch App</span>
                <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </motion.a>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
