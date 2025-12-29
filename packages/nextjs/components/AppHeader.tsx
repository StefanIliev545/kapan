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
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  // Find active link
  const activeHref = appMenuLinks.find(link => pathname === link.href || pathname.startsWith(link.href + "/"))?.href || appMenuLinks[0].href;

  // Update indicator position
  useEffect(() => {
    const button = buttonRefs.current.get(activeHref);
    const container = containerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [activeHref, pathname]);

  if (isMobile) {
    // Mobile: vertical list style
    return (
      <>
        {appMenuLinks.map(({ label, href, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="relative">
              <Link
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? "bg-base-content/10 text-base-content" 
                    : "text-base-content/50 hover:bg-base-content/5 hover:text-base-content/70"
                }`}
              >
                <span>{icon}</span>
                <span className="font-medium uppercase tracking-wider text-sm">{label}</span>
              </Link>
            </li>
          );
        })}
      </>
    );
  }

  // Desktop: pill-style segmented control
  return (
    <div
      ref={containerRef}
      className="relative flex items-center p-1 bg-base-200/60 rounded-lg border border-base-300/40"
    >
      {/* Sliding indicator */}
      {indicatorStyle && (
        <motion.div
          className="absolute top-1 bottom-1 bg-base-content/10 rounded-md"
          initial={false}
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      
      {appMenuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            ref={(el) => {
              if (el) buttonRefs.current.set(href, el);
            }}
            className={`relative z-10 flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
              isActive 
                ? "text-base-content" 
                : "text-base-content/40 hover:text-base-content/70"
            }`}
          >
            <span className={`transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
              {icon}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
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
            {/* Starknet glow effect - subtle */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-400/30 rounded-lg blur-sm opacity-60" />
              <div className="relative flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10">
                <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
                  <CustomConnectButton />
                </div>
                <div className="h-7 w-[1px] bg-base-content/10"></div>
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
            className="flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10"
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
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base-content/40">
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
        className={`w-full bg-base-200/60 border border-base-content/10 rounded-lg pl-10 pr-12 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-base-content/20 focus:border-base-content/20 placeholder:text-base-content/30 ${
          isInvalid ? "border-error focus:ring-error/40" : ""
        }`}
      />
      {hasOverride && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-2 flex items-center rounded-full p-1 text-base-content/40 transition-colors hover:text-error"
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
        {/* Background - simple dark with subtle border */}
        <div
          className={`absolute inset-0 bg-base-100/95 backdrop-blur-md transition-all duration-300 ${
            scrolled ? "shadow-[0_1px_3px_rgba(0,0,0,0.3)]" : ""
          }`}
          style={{ zIndex: -1 }}
        >
          {/* Subtle bottom border */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-base-content/5"></div>
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
                        <div className="bg-base-200/95 backdrop-blur-md p-6 rounded-xl border border-base-content/10 shadow-lg">
                          <div className="mb-6 pb-3 border-b border-base-content/10">
                            <div className="flex items-center gap-3">
                              <div className="relative w-10 h-10">
                                <Image
                                  alt="Kapan logo"
                                  className="object-contain opacity-60"
                                  fill
                                  src="/seal-logo.png"
                                />
                              </div>
                              <span className="text-base font-bold text-base-content/60 uppercase tracking-wider">Kapan</span>
                            </div>
                          </div>
                          {/* Mobile nav links */}
                          <ul className="space-y-2">
                            <AppHeaderMenuLinks isMobile />
                          </ul>
                          <div className="mt-6 pt-4 border-t border-base-content/10">
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
              <Link href="/" className="flex items-center group">
                <div className="relative flex items-center">
                  <div className="relative">
                    <div className={`relative w-9 h-9 transition-all duration-300 ${scrolled ? "scale-90" : ""}`}>
                      <Image
                        alt="Kapan logo"
                        className="object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                        fill
                        src="/seal-logo.png"
                        priority
                      />
                    </div>
                  </div>
                  <div className={`ml-2 transition-all duration-300 ${scrolled ? "scale-95" : ""}`}>
                    <span className="text-sm font-bold text-base-content/60 group-hover:text-base-content transition-colors duration-300 uppercase tracking-wider">Kapan</span>
                  </div>
                </div>
              </Link>
              {/* Desktop Nav */}
              <div className="hidden lg:flex ml-6">
                <AppHeaderMenuLinks />
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
    </>
  );
};
