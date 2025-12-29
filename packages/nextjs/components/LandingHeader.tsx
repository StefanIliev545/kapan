"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * Landing page header - minimal dark theme design
 */
export const LandingHeader = () => {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 py-4 md:py-6 px-4 md:px-8">
      <div className="flex items-center justify-between">
        {/* Left - Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 md:w-10 md:h-10">
            <Image
              alt="Kapan logo"
              className="object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300"
              fill
              src="/seal-logo.png"
              priority
            />
          </div>
          <span className="text-sm md:text-base font-bold text-base-content/60 group-hover:text-base-content/100 transition-colors duration-300 uppercase tracking-wider">
            Kapan
          </span>
        </Link>
      </div>
    </div>
  );
};
