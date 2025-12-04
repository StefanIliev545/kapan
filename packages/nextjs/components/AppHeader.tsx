"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CustomConnectButton } from "./scaffold-stark/CustomConnectButton";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bars3Icon,
  XMarkIcon,
  RectangleStackIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { GasTokenSelector } from "~~/components/GasTokenSelector";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { useAccount } from "~~/hooks/useAccount";
import { normalizeUserAddress } from "~~/utils/address";

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

// Smart connect button that shows the right wallet based on selected network
const NETWORK_STORAGE_KEY = "kapan-network-filter-selection";

const SmartConnectButton = () => {
  const searchParams = useSearchParams();
  const [selectedNetwork, setSelectedNetwork] = useState("base");
  
  // Function to get current network from URL or cache
  const getCurrentNetwork = useCallback(() => {
    // Check URL first
    const url = new URL(window.location.href);
    const urlNetwork = url.searchParams.get("network");
    if (urlNetwork) return urlNetwork;
    
    // Fall back to localStorage cache
    try {
      const cached = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (cached) return cached;
    } catch { }
    
    return "base";
  }, []);

  // Initialize and sync with URL/cache
  useEffect(() => {
    setSelectedNetwork(getCurrentNetwork());
  }, [searchParams, getCurrentNetwork]);

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setSelectedNetwork(getCurrentNetwork());
    };
    
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [getCurrentNetwork]);

  // Poll for URL changes (since NetworkFilter uses shallow updates that don't trigger React)
  useEffect(() => {
    let lastNetwork = selectedNetwork;
    
    const checkNetwork = () => {
      const current = getCurrentNetwork();
      if (current !== lastNetwork) {
        lastNetwork = current;
        setSelectedNetwork(current);
      }
    };
    
    const interval = setInterval(checkNetwork, 200);
    return () => clearInterval(interval);
  }, [selectedNetwork, getCurrentNetwork]);

  const isStarknet = selectedNetwork === "starknet";

  return (
    <div className="flex items-center">
      <AnimatePresence mode="wait">
        {isStarknet ? (
          <motion.div
            key="starknet"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            {/* Starknet glow effect */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 rounded-2xl blur-sm opacity-40 animate-pulse" />
              <div className="relative flex items-center bg-base-200 hover:bg-base-300 transition-colors duration-200 rounded-2xl shadow-md">
                <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
                  <CustomConnectButton />
                </div>
                <div className="h-7 w-[1px] bg-base-300/50"></div>
                <div className="px-3 py-1.5">
                  <GasTokenSelector />
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="evm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex items-center bg-base-200 hover:bg-base-300 transition-colors duration-200 rounded-2xl shadow-md"
          >
            <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
              <RainbowKitCustomConnectButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AddressSearchBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { viewingAddress, address: connectedAddress } = useAccount();
  const [value, setValue] = useState<string>(viewingAddress ?? "");
  const [hasSubmittedInvalid, setHasSubmittedInvalid] = useState(false);

  const currentOverride = searchParams?.get("address") ?? undefined;
  const hasOverride = useMemo(() => Boolean(currentOverride), [currentOverride]);

  useEffect(() => {
    setValue(viewingAddress ?? "");
  }, [viewingAddress]);

  const updateUrlWithAddress = useCallback(
    (addressValue?: `0x${string}`) => {
      const params = new URLSearchParams(searchParams?.toString());

      if (addressValue) {
        params.set("address", addressValue);
      } else {
        params.delete("address");
      }

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalized = normalizeUserAddress(value);

      if (!normalized) {
        setHasSubmittedInvalid(true);
        return;
      }

      setHasSubmittedInvalid(false);
      setValue(normalized);
      updateUrlWithAddress(normalized);
    },
    [updateUrlWithAddress, value],
  );

  const handleClear = useCallback(() => {
    updateUrlWithAddress(undefined);
    setHasSubmittedInvalid(false);
    setValue(connectedAddress ?? "");
  }, [connectedAddress, updateUrlWithAddress]);

  const isInvalid = hasSubmittedInvalid && !normalizeUserAddress(value);

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xl">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base-content/60">
        <MagnifyingGlassIcon className="h-5 w-5" />
      </span>
      <input
        value={value}
        onChange={event => {
          setValue(event.target.value);
          if (hasSubmittedInvalid) {
            setHasSubmittedInvalid(false);
          }
        }}
        placeholder="Search address"
        className={`input input-bordered w-full bg-base-200 pl-10 pr-12 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 dark:focus:ring-accent/40 ${
          isInvalid ? "input-error" : ""
        }`}
      />
      {hasOverride && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-2 flex items-center rounded-full p-1 text-base-content/60 transition-colors hover:text-error"
          aria-label="Clear address override"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      )}
    </form>
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
  const isPositionsPage = pathname === "/app";

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
          <div className="navbar justify-between min-h-0 h-auto py-0 gap-4">
            {/* Left section - Logo */}
            <div className="flex items-center min-w-0">
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
                            <div className="flex flex-col space-y-3 items-stretch relative z-50">
                              <SmartConnectButton />
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

            {/* Middle section - Address search */}
            <div className="flex-1 hidden md:flex justify-center">
              {isPositionsPage && <AddressSearchBar />}
            </div>

            {/* Right section - Wallet connection */}
            <div className="flex items-center">
              {/* Smart connect button - adapts to selected network */}
              <motion.div
                className="hidden md:flex items-center relative z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <SmartConnectButton />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
      {isPositionsPage && (
        <div className="px-4 pb-2 md:hidden">
          <AddressSearchBar />
        </div>
      )}
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
