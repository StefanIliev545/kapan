"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomConnectButton } from "./scaffold-stark/CustomConnectButton";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bars3Icon,
  XMarkIcon,
  RectangleStackIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { ThemeSettings } from "~~/components/ThemeSettings";
import { GasTokenSelector } from "~~/components/GasTokenSelector";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

const appMenuLinks: HeaderMenuLink[] = [
  {
    label: "Positions",
    href: "/app",
    icon: <RectangleStackIcon className="h-5 w-5" />,
  },
  {
    label: "Markets",
    href: "/markets",
    icon: <BanknotesIcon className="h-5 w-5" />,
  },
];

const AppHeaderMenuLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const pathname = usePathname();
  return (
    <>
      {appMenuLinks.map(({ label, href, icon }, index) => {
        const isActive = pathname === href;
        return (
          <motion.li
            key={href}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="relative"
          >
            <Link
              href={href}
              passHref
              className={`
                relative group
                ${isActive ? "text-primary dark:text-accent" : "text-base-content"}
                hover:text-primary dark:hover:text-accent transition-colors duration-300
                flex items-center gap-3 py-3 px-6 text-sm font-medium
              `}
            >
              {/* Active background glow */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 dark:from-accent/10 dark:via-accent/5 dark:to-accent/10 rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  style={{ filter: "blur(8px)" }}
                />
              )}

              {/* Icon with subtle hover wiggle */}
              <motion.div
                whileHover={{ rotate: [0, -10, 10, -5, 5, 0], scale: 1.2 }}
                transition={{ duration: 0.5 }}
                className={`${isActive ? "text-primary dark:text-accent" : "text-base-content/70"} transition-colors duration-300`}
              >
                {icon}
              </motion.div>

              {/* Label + underline animations */}
              <span className="relative">
                {label}
                {isActive ? (
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-accent origin-left"
                    transition={{ duration: 0.3 }}
                  />
                ) : (
                  <motion.div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-accent scale-x-0 opacity-0 origin-left transition-transform group-hover:scale-x-100 group-hover:opacity-100 duration-300" />
                )}
              </span>
            </Link>
          </motion.li>
        );
      })}
    </>
  );
};
/**
 * App header for /app/app page with wallet connection and settings
 */
export const AppHeader = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  // Add scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close drawer when route changes
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <div className={`sticky top-0 z-30 transition-all duration-300 ${scrolled ? "py-1" : "py-2"}`}>
        {/* Background with gradient border */}
        <div
          className={`absolute inset-0 bg-gradient-to-r from-base-300/80 via-base-100/95 to-base-300/80 dark:from-base-300/60 dark:via-base-100/75 dark:to-base-300/60 backdrop-blur-md transition-all duration-300 ${
            scrolled ? "shadow-md" : ""
          }`}
          style={{ zIndex: -1 }}
        >
          {/* Accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 dark:via-accent/30 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="navbar justify-between min-h-0 h-auto py-0">
            {/* Left section - Logo */}
            <div className="flex items-center">
              <div
                className="lg:hidden dropdown z-50 mr-2"
                ref={burgerMenuRef}
                data-state={isDrawerOpen ? "open" : "closed"}
              >
                <button
                  aria-label="Menu"
                  className="btn btn-circle btn-ghost btn-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:focus:ring-accent/50"
                  onClick={() => {
                    setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
                  }}
                  style={{ touchAction: "manipulation" }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={isDrawerOpen ? "close" : "open"}
                      initial={{ rotate: isDrawerOpen ? -90 : 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: isDrawerOpen ? 90 : -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {isDrawerOpen ? (
                        <XMarkIcon className="h-6 w-6 text-base-content" />
                      ) : (
                        <Bars3Icon className="h-6 w-6 text-base-content" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </button>

                {/* Mobile Navigation Menu */}
                <AnimatePresence>
                  {isDrawerOpen && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-40 bg-black/30 lg:hidden"
                      onClick={() => setIsDrawerOpen(false)}
                    >
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed top-16 left-4 z-50 w-72 rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="bg-base-200/95 dark:bg-base-300/95 backdrop-blur-md p-6 rounded-box border border-base-300/50 dark:border-base-content/10 shadow-lg">
                          <div className="mb-6 pb-3 border-b border-base-300/50 dark:border-base-content/10">
                            <div className="flex items-center gap-4">
                              <div className="relative w-12 h-12">
                                <Image
                                  alt="Kapan logo"
                                  className="object-contain dark:opacity-90 dark:[filter:drop-shadow(0_0_11px_rgba(255,255,255,0.6))_drop-shadow(0_0_3px_rgba(255,255,255,0.9))]"
                                  fill
                                  src="/seal-logo.png"
                                />
                              </div>
                              <div>
                                <div className="font-bold text-xl font-inter text-base-content">Kapan</div>
                              </div>
                            </div>
                          </div>
                          {/* Mobile nav links */}
                          <ul className="space-y-2">
                            <AppHeaderMenuLinks isMobile />
                          </ul>
                          <div className="mt-6 pt-4 border-t border-base-300/50 dark:border-base-content/10">
                            <div className="flex flex-col space-y-2 items-stretch relative z-50">
                              <div className="flex items-center bg-base-200 rounded-[18px] shadow-md relative p-0.5">
                                <div className="relative flex-1 px-3 py-1.5">
                                  <RainbowKitCustomConnectButton />
                                </div>
                              </div>
                              <div className="flex items-center bg-base-200 rounded-[18px] shadow-md relative p-0.5">
                                <div className="relative flex-1 px-3 py-1.5">
                                  <CustomConnectButton />
                                </div>
                                <div className="h-7 w-[1px] bg-base-300"></div>
                                <div className="px-3 py-1.5">
                                  <GasTokenSelector />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Logo */}
              <Link href="/" className="flex items-center">
                <div className="relative flex items-center">
                  <div className="relative">
                    <div className={`relative w-11 h-11 transition-all duration-300 ${scrolled ? "scale-90" : ""}`}>
                      <Image
                        alt="Kapan logo"
                        className="object-contain dark:opacity-90 dark:[filter:drop-shadow(0_0_11px_rgba(255,255,255,0.6))_drop-shadow(0_0_3px_rgba(255,255,255,0.9))]"
                        fill
                        src="/seal-logo.png"
                        priority
                      />
                    </div>
                  </div>
                  <div className={`ml-2 transition-all duration-300 ${scrolled ? "scale-95" : ""}`}>
                    <div className="font-bold text-lg font-inter text-base-content">Kapan</div>
                  </div>
                </div>
              </Link>
              {/* Desktop Nav */}
              <div className="hidden lg:flex ml-6">
                <ul className="flex items-center space-x-2">
                  <AppHeaderMenuLinks />
                </ul>
              </div>
            </div>

            {/* Right section - Wallet connection and settings */}
            <div className="flex items-center gap-4">
              {/* Connect button */}
              <motion.div
                className="hidden md:flex gap-2 items-center relative z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <div className="flex items-center bg-base-200 hover:bg-base-300 transition-colors duration-200 rounded-[18px] shadow-md relative">
                  <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
                    <RainbowKitCustomConnectButton />
                  </div>
                  <div className="h-7 w-[1px] bg-base-300"></div>
                  <div className="relative px-3 py-1.5 cursor-pointer">
                    <CustomConnectButton />
                  </div>
                  <div className="h-7 w-[1px] bg-base-300"></div>
                  <div className="px-3 py-1.5">
                    <GasTokenSelector />
                  </div>
                </div>
              </motion.div>
              <div className="flex items-center gap-2">
                <SwitchTheme />
                <ThemeSettings />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full bg-primary/5 dark:bg-accent/5 text-base-content/70 text-center text-xs py-1">
        <Link
          href="/audits/022_CODESPECT_KAPAN_FINANCE.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary dark:hover:text-accent"
        >
          Starknet Audit by Codespect
        </Link>
      </div>
    </>
  );
};
