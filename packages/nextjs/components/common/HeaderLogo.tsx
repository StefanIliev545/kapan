"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

interface HeaderLogoProps {
  scrolled?: boolean;
}

/**
 * Header logo component with optional scroll-based scaling.
 * Links to the home page.
 */
export const HeaderLogo = ({ scrolled = false }: HeaderLogoProps) => {
  return (
    <Link href="/" className="group flex items-center">
      <div className="relative flex items-center">
        <div className="relative">
          <div className={`relative size-9 transition-all duration-300 ${scrolled ? "scale-90" : ""}`}>
            <Image
              alt="Kapan logo"
              className="object-contain opacity-60 transition-opacity duration-300 group-hover:opacity-100"
              fill
              src="/seal-logo.png"
              priority
            />
          </div>
        </div>
        <div className={`ml-2 transition-all duration-300 ${scrolled ? "scale-95" : ""}`}>
          <span className="text-base-content/60 group-hover:text-base-content text-sm font-bold uppercase tracking-wider transition-colors duration-300">
            Kapan
          </span>
        </div>
      </div>
    </Link>
  );
};
