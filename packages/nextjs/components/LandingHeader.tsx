"use client";

import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useAppUrl } from "~~/hooks/common/useAppUrl";

/**
 * Landing page header - minimal dark theme design
 * Keeps the app entry point available throughout the landing pages.
 */
export const LandingHeader = () => {
  const appUrl = useAppUrl();

  const handleLaunchClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      track("To App conversion", { button: "Landing Header" });
      window.location.assign(appUrl);
    },
    [appUrl],
  );

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-base-100/90 p-4 backdrop-blur-md md:px-8 md:py-6">
      <div className="flex items-center justify-between">
        {/* Left - Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative size-8 md:size-10">
            <Image
              alt="Kapan logo"
              className="object-contain"
              fill
              src="/seal-logo.png"
              priority
            />
          </div>
          <span className="hidden sm:inline text-base-content/60 group-hover:text-base-content/100 text-sm font-bold uppercase tracking-wider transition-colors duration-300 motion-reduce:transition-none md:text-base">
            Kapan
          </span>
        </Link>

        {/* Right - Nav links */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/info"
            className="text-base-content/50 hover:text-base-content/100 text-xs font-semibold uppercase tracking-wider transition-colors duration-300 motion-reduce:transition-none"
          >
            Info
          </Link>
          <Link
            href="/about"
            className="text-base-content/50 hover:text-base-content/100 text-xs font-semibold uppercase tracking-wider transition-colors duration-300 motion-reduce:transition-none"
          >
            About
          </Link>
          
          {/* App entry stays available when sections have different heights. */}
          <a
            href={appUrl}
            onClick={handleLaunchClick}
            className="bg-primary/10 hover:bg-primary/20 border-primary/20 hover:border-primary/40 text-primary group flex items-center gap-2 rounded-lg border px-4 py-2 transition-colors duration-300 motion-reduce:transition-none"
          >
            <span className="whitespace-nowrap text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Launch App</span>
            <ArrowRightIcon className="size-3.5 transition-transform motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </a>
        </div>
      </div>
    </div>
  );
};
