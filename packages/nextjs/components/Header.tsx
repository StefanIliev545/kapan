"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BanknotesIcon,
  DocumentChartBarIcon,
} from "@heroicons/react/24/outline";
import {
  HeaderLogo,
  MobileMenuButton,
  MobileNavigationDrawer,
  WalletButton,
} from "~~/components/common";
import { useHeaderState } from "~~/hooks/common/useHeaderState";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Info",
    href: "/info",
    icon: <DocumentChartBarIcon className="size-5" />,
  },
];

const mobileOnlyLinks: HeaderMenuLink[] = [
  {
    label: "Markets",
    href: "/markets",
    icon: <BanknotesIcon className="size-5" />,
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
                group relative
                ${isActive ? "text-primary dark:text-accent" : "text-base-content"} 
                hover:text-primary dark:hover:text-accent flex items-center
                gap-3 px-6 py-3 text-sm font-medium transition-colors duration-300
              `}
            >
              {/* Background glow effect */}
              {isActive && (
                <motion.div
                  className="from-primary/10 via-secondary/10 to-primary/10 dark:from-accent/10 dark:via-accent/5 dark:to-accent/10 absolute inset-0 -z-10 rounded-xl bg-gradient-to-r"
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
                    className="bg-primary dark:bg-accent absolute inset-x-0 -bottom-1 h-0.5 origin-left"
                    transition={{ duration: 0.3 }}
                  />
                )}

                {/* Hover underline effect for inactive items */}
                {!isActive && (
                  <motion.div className="bg-primary dark:bg-accent absolute inset-x-0 -bottom-1 h-0.5 origin-left scale-x-0 opacity-0 transition-transform duration-300 group-hover:scale-x-100 group-hover:opacity-100" />
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
  const { isDrawerOpen, scrolled, burgerMenuRef, toggleDrawer, closeDrawer } = useHeaderState();

  const mobileWalletButtons = (
    <>
      <WalletButton variant="evm" />
      <WalletButton variant="starknet" showGasSelector />
    </>
  );

  return (
    <>
      <div className={`sticky top-0 z-30 transition-all duration-300 ${scrolled ? "py-1" : "py-2"}`}>
        {/* Background with gradient border */}
        <div
          className={`from-base-300/80 via-base-100/95 to-base-300/80 dark:from-base-300/60 dark:via-base-100/75 dark:to-base-300/60 absolute inset-0 bg-gradient-to-r backdrop-blur-md transition-all duration-300 ${
            scrolled ? "shadow-md" : ""
          }`}
          style={{ zIndex: -1 }}
        >
          {/* Accent line */}
          <div className="via-primary/30 dark:via-accent/30 absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent to-transparent"></div>
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <div className="navbar h-auto min-h-0 justify-between py-0">
            {/* Left section - Logo and nav */}
            <div className="flex items-center">
              <div
                className="dropdown z-50 mr-2 lg:hidden"
                ref={burgerMenuRef}
                data-state={isDrawerOpen ? "open" : "closed"}
              >
                <MobileMenuButton isOpen={isDrawerOpen} onClick={toggleDrawer} />
                <MobileNavigationDrawer
                  isOpen={isDrawerOpen}
                  onClose={closeDrawer}
                  menuLinks={<HeaderMenuLinks isMobile />}
                  walletButtons={mobileWalletButtons}
                />
              </div>

              {/* Logo */}
              <HeaderLogo scrolled={scrolled} />

              {/* Desktop Navigation */}
              <div className="ml-10 hidden lg:flex">
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
                    className="bg-warning/40 dark:bg-warning/20 absolute inset-0 rounded-full"
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

              {/* Connect buttons - Both EVM and Starknet */}
              <motion.div
                className="relative z-20 hidden items-center gap-2 md:flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <WalletButton variant="evm" />
                <WalletButton variant="starknet" showGasSelector />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
