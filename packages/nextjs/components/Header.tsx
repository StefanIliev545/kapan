"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Bars3Icon, 
  XMarkIcon,
  WalletIcon,
  BoltIcon,
  DocumentChartBarIcon,
  CurrencyDollarIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Manage",
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
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }, index) => {
        const isActive = pathname === href;
        return (
          <motion.li 
            key={href}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ 
              duration: 0.4, 
              delay: index * 0.1
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
                  <motion.div 
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-accent scale-x-0 opacity-0 origin-left transition-transform group-hover:scale-x-100 group-hover:opacity-100 duration-300"
                  />
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
    <div className={`sticky top-0 z-30 transition-all duration-300 ${
      scrolled 
        ? "py-2" 
        : "py-4"
    }`}>
      {/* Background with gradient border */}
      <div className={`absolute inset-0 bg-gradient-to-r from-base-300/80 via-base-100/95 to-base-300/80 dark:from-base-300/60 dark:via-base-100/75 dark:to-base-300/60 backdrop-blur-md transition-all duration-300 ${
        scrolled ? "shadow-lg" : ""
      }`} style={{ zIndex: -1 }}>
        {/* Animated accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 dark:via-accent/50 to-transparent"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="navbar justify-between">
          {/* Left section - Logo and nav */}
          <div className="flex items-center">
            <div className="lg:hidden dropdown z-50 mr-3" ref={burgerMenuRef}>
              <button
                aria-label="Menu"
                className={`btn btn-circle btn-ghost transition-all duration-200`}
                onClick={() => {
                  setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
                }}
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
              
              <AnimatePresence>
                {isDrawerOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="dropdown-content menu bg-base-200/95 dark:bg-base-300/95 backdrop-blur-md rounded-box shadow-2xl mt-3 p-6 w-72 overflow-hidden absolute left-0 z-50"
                    style={{ backdropFilter: "blur(12px)" }}
                  >
                    <div className="mb-6 pb-3 border-b border-base-300/50 dark:border-base-content/10">
                      <div className="flex items-center gap-4">
                        <div className="relative w-12 h-12">
                          <Image alt="Kapan logo" className="object-contain" fill src="/seal-logo.svg" />
                        </div>
                        <div>
                          <div className="font-bold text-xl text-primary dark:text-accent">Kapan</div>
                          <div className="text-xs text-base-content/60">Lending Made Easy</div>
                        </div>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      <HeaderMenuLinks />
                    </ul>
                    <div className="mt-6 pt-4 border-t border-base-300/50 dark:border-base-content/10">
                      <div className="flex justify-center mb-3">
                        <div className="bg-warning/90 text-warning-content px-4 py-1 rounded-full text-xs font-bold">
                          ALPHA VERSION
                        </div>
                      </div>
                      <div className="flex flex-col space-y-3 items-stretch relative z-50">
                        <div className="relative">
                          <RainbowKitCustomConnectButton />
                        </div>
                        <div className="relative">
                          <FaucetButton />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <motion.div 
                className="relative flex items-center"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, type: "spring" }}
              >
                <div className="relative">
                  {/* Background glow effect */}
                  <motion.div 
                    className="absolute inset-0 rounded-full bg-primary/20"
                    animate={{ 
                      scale: [1, 1.05, 1],
                      opacity: [0.5, 0.8, 0.5]
                    }}
                    transition={{ 
                      duration: 3,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                    style={{ filter: "blur(10px)" }}
                  />
                  
                  {/* Logo image with hover effect */}
                  <motion.div 
                    className="relative w-14 h-14 sm:w-16 sm:h-16"
                    whileHover={{ 
                      rotate: [0, -5, 5, -3, 3, 0],
                      transition: { duration: 0.5 }
                    }}
                  >
                    <Image 
                      alt="Kapan logo" 
                      className="object-contain" 
                      fill 
                      src="/seal-logo.svg" 
                      priority
                    />
                  </motion.div>
                </div>
                
                {/* Brand text */}
                <div className="ml-3">
                  <motion.div 
                    className="font-bold text-xl sm:text-2xl bg-gradient-to-r from-primary to-secondary dark:from-accent dark:to-accent/80 bg-clip-text text-transparent"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                  >
                    Kapan
                  </motion.div>
                  <motion.div 
                    className="text-xs sm:text-sm text-base-content/70"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    Lending Made Easy
                  </motion.div>
                </div>
              </motion.div>
            </Link>
            
            {/* Desktop Navigation */}
            <div className="hidden lg:flex ml-10">
              <ul className="flex space-x-2">
                <HeaderMenuLinks />
              </ul>
            </div>
          </div>
          
          {/* Right section - Alpha badge and buttons */}
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
                    repeatType: "reverse"
                  }}
                  style={{ filter: "blur(8px)" }}
                />
                <div className="relative bg-warning text-warning-content px-4 py-1.5 rounded-full text-xs font-bold border border-warning/20 z-10">
                  ALPHA VERSION
                </div>
              </motion.div>
            </div>
            
            {/* Connect button and faucet */}
            <motion.div
              className="flex gap-2 items-center relative z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <div className="relative">
                <RainbowKitCustomConnectButton />
              </div>
              <div className="relative">
                <FaucetButton />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};
