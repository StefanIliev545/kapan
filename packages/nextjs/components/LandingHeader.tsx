"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bars3Icon,
  DocumentChartBarIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const landingMenuLinks: HeaderMenuLink[] = [
  {
    label: "Automate",
    href: "/automate",
    icon: <SparklesIcon className="h-4 w-4" />,
  },
  {
    label: "Info",
    href: "/info",
    icon: <DocumentChartBarIcon className="h-4 w-4" />,
  },
];

export const LandingHeaderMenuLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const pathname = usePathname();

  return (
    <>
      {landingMenuLinks.map(({ label, href, icon }, index) => {
        const isActive = pathname === href;
        return (
          <li key={href} className="relative">
            <Link
              href={href}
              passHref
              className={`
                relative group flex items-center gap-2 px-4 py-2
                text-xs font-semibold uppercase tracking-[0.15em]
                ${isActive ? "text-base-content" : "text-base-content/40 hover:text-base-content/70"} 
                transition-colors duration-300
              `}
            >
              {icon}
              <span>{label}</span>
              {isActive && (
                <motion.div
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 right-0 h-[1px] bg-base-content/40"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Landing page header - minimal dark theme design
 */
export const LandingHeader = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isLandingPage = pathname === "/";

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "/app";
    const { protocol } = window.location;
    const hostname = window.location.hostname;
    const baseHost = hostname.replace(/^www\./, "");
    if (window.location.host.endsWith("localhost:3000")) return `${protocol}//app.localhost:3000`;
    if (hostname.startsWith("app.")) return `${protocol}//${window.location.host}`;
    return `${protocol}//app.${baseHost}`;
  }, []);

  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  // Set mounted after client hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer when route changes
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

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

        {/* Center - Desktop Navigation */}
        <div className="hidden lg:flex">
          <ul className="flex items-center">
            <LandingHeaderMenuLinks />
          </ul>
        </div>

        {/* Right - Launch App + Mobile menu */}
        <div className="flex items-center gap-4">
          {/* Launch App - always visible on non-landing pages, or after first scroll section */}
          {!isLandingPage && (
            <a
              href="/app"
              onClick={e => {
                e.preventDefault();
                track("To App conversion", { button: "Header" });
                window.location.assign(appUrl);
              }}
              className="hidden md:flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-base-content/40 hover:text-base-content border border-base-content/10 hover:border-base-content/30 transition-all duration-300"
            >
              Launch App
            </a>
          )}

          {/* Mobile menu button */}
          <div
            className="lg:hidden"
            ref={burgerMenuRef}
          >
            <button
              aria-label="Menu"
              className="p-2 text-base-content/40 hover:text-base-content/80 transition-colors"
              onClick={() => setIsDrawerOpen(prev => !prev)}
            >
              {isDrawerOpen ? (
                <XMarkIcon className="h-5 w-5" />
              ) : (
                <Bars3Icon className="h-5 w-5" />
              )}
            </button>

            {/* Mobile Navigation Menu */}
            <AnimatePresence>
              {isDrawerOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-base-100/95 backdrop-blur-sm lg:hidden"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="pt-20 px-8"
                    onClick={e => e.stopPropagation()}
                  >
                    <ul className="space-y-4">
                      <LandingHeaderMenuLinks isMobile />
                    </ul>
                    <div className="mt-8 pt-8 border-t border-base-content/10">
                      <a
                        href="/app"
                        onClick={e => {
                          e.preventDefault();
                          track("To App conversion", { button: "Mobile Header" });
                          window.location.assign(appUrl);
                        }}
                        className="block w-full py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-base-content border border-base-content/20"
                      >
                        Launch App
                      </a>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
