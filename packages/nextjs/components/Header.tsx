"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CustomConnectButton } from "./scaffold-stark/CustomConnectButton";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bars3Icon,
  BeakerIcon,
  DocumentChartBarIcon,
  SparklesIcon,
  WalletIcon,
  BanknotesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { ThemeSettings } from "~~/components/ThemeSettings";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Lending",
    href: "/app",
    icon: <WalletIcon className="h-5 w-5" />,
  },
  {
    label: "Automate",
    href: "/automate",
    icon: <SparklesIcon className="h-5 w-5" />,
  },
  {
    label: "Info",
    href: "/info",
    icon: <DocumentChartBarIcon className="h-5 w-5" />,
  }
];

const mobileOnlyLinks: HeaderMenuLink[] = [
  {
    label: "Markets",
    href: "/markets",
    icon: <BanknotesIcon className="h-5 w-5" />,
  },
];

export const HeaderMenuLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const pathname = usePathname();
  const links = isMobile ? [...menuLinks, ...mobileOnlyLinks] : menuLinks;

  return (
    <>
      {links.map(({ label, href, icon }, index) => {
        const isActive = pathname === href;
        return (
          <motion.li
            key={href}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.4,
              delay: index * 0.1,
            }}
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
              {/* Background glow effect */}
              {isActive && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 dark:from-accent/10 dark:via-accent/5 dark:to-accent/10 rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  style={{ filter: "blur(8px)" }}
                />
              )}

              {/* Icon with animation */}
              <motion.div
                whileHover={{ rotate: [0, -10, 10, -5, 5, 0], scale: 1.2 }}
                transition={{ duration: 0.5 }}
                className={`${isActive ? "text-primary dark:text-accent" : "text-base-content/70"} transition-colors duration-300`}
              >
                {icon}
              </motion.div>

              {/* Label */}
              <span className="relative">
                {label}

                {/* Underline effect */}
                {isActive && (
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-accent origin-left"
                    transition={{ duration: 0.3 }}
                  />
                )}

                {/* Hover underline effect for inactive items */}
                {!isActive && (
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
 * Site header
 */
export const Header = () => {
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
          {/* Left section - Logo and nav */}
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
                              <div className="font-bold text-xl font-sans text-base-content">Kapan Finance</div>
                              <div className="text-xs text-base-content/60">Lending Made Easy</div>
                            </div>
                          </div>
                        </div>
                        <ul className="space-y-2">
                          <HeaderMenuLinks isMobile />
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
                              <div className="px-3 py-1.5 opacity-70">
                                <Image
                                  width={18}
                                  height={18}
                                  alt="Starknet Logo"
                                  className="dark:hidden"
                                  src="/logos/starknet.svg"
                                />
                                <Image
                                  width={18}
                                  height={18}
                                  alt="Starknet Logo"
                                  className="hidden dark:block"
                                  src="/logos/starknet-dark.svg"
                                />
                              </div>
                            </div>
                            {/* Removed Stark faucet and FaucetButton from mobile drawer */}
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
                  <div className={`relative w-14 h-14 transition-all duration-300 ${scrolled ? "scale-90" : ""}`}>
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
                  <div className="font-bold text-lg font-sans text-base-content">Kapan Finance</div>
                  <div className="text-[10px] text-base-content/60 -mt-1">Lending Made Easy</div>
                </div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex ml-10">
              <ul className="flex space-x-2">
                <HeaderMenuLinks />
              </ul>
            </div>
          </div>

          {/* Right section - Alpha badge, buttons and theme controls */}
          <div className="flex items-center gap-4">
            {/* Alpha badge */}
            <div className="hidden sm:block">
              <motion.div
                className="relative"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <motion.div
                  className="absolute inset-0 bg-warning/40 dark:bg-warning/20 rounded-full"
                  animate={{
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }}
                  style={{ filter: "blur(8px)" }}
                />
              </motion.div>
            </div>

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
                <div className="px-3 py-1.5 opacity-70">
                  <Image width={18} height={18} alt="Starknet Logo" className="dark:hidden" src="/logos/starknet.svg" />
                  <Image
                    width={18}
                    height={18}
                    alt="Starknet Logo"
                    className="hidden dark:block"
                    src="/logos/starknet-dark.svg"
                  />
                </div>
              </div>
              {/* Removed Stark faucet and FaucetButton from desktop header */}
            </motion.div>
            <div className="flex items-center gap-2">
              <SwitchTheme />
              <ThemeSettings />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
