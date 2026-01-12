"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  RectangleStackIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  HeaderLogo,
  MobileMenuButton,
  MobileNavigationDrawer,
  WalletButton,
} from "~~/components/common";
import { useHeaderState } from "~~/hooks/common/useHeaderState";
import { useAccount } from "~~/hooks/useAccount";
import { normalizeUserAddress } from "~~/utils/address";

// Motion animation constants
const INITIAL_OPACITY = { opacity: 0 };
const ANIMATE_OPACITY = { opacity: 1 };
const INDICATOR_TRANSITION = { type: "spring" as const, stiffness: 400, damping: 30 };
const WALLET_TRANSITION = { delay: 0.5, duration: 0.5 };

// Style constants
const Z_INDEX_BACK = { zIndex: -1 };

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

const appMenuLinks: HeaderMenuLink[] = [
  {
    label: "Positions",
    href: "/app",
    icon: <RectangleStackIcon className="size-5" />,
  },
  {
    label: "Markets",
    href: "/markets",
    icon: <BanknotesIcon className="size-5" />,
  },
];

// Helper component for individual menu link to avoid inline ref callback
const MenuLinkItem = ({
  href,
  icon,
  label,
  isActive,
  buttonRefs,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  buttonRefs: React.MutableRefObject<Map<string, HTMLAnchorElement>>;
}) => {
  const setRef = useCallback(
    (el: HTMLAnchorElement | null) => {
      if (el) buttonRefs.current.set(href, el);
    },
    [buttonRefs, href],
  );

  return (
    <Link
      href={href}
      ref={setRef}
      className={`relative z-10 flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
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
};

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

  // Memoize indicator animation to avoid inline object
  const indicatorAnimate = useMemo(
    () =>
      indicatorStyle
        ? { left: indicatorStyle.left, width: indicatorStyle.width }
        : undefined,
    [indicatorStyle],
  );

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
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isActive
                    ? "bg-base-content/10 text-base-content"
                    : "text-base-content/50 hover:bg-base-content/5 hover:text-base-content/70"
                }`}
              >
                <span>{icon}</span>
                <span className="text-sm font-medium uppercase tracking-wider">{label}</span>
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
      className="bg-base-200/60 border-base-300/40 relative flex items-center rounded-lg border p-1"
    >
      {/* Sliding indicator */}
      {indicatorAnimate && (
        <motion.div
          className="bg-base-content/10 absolute inset-y-1 rounded-md"
          initial={false}
          animate={indicatorAnimate}
          transition={INDICATOR_TRANSITION}
        />
      )}

      {appMenuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <MenuLinkItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            isActive={isActive}
            buttonRefs={buttonRefs}
          />
        );
      })}
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

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
      if (hasSubmittedInvalid) {
        setHasSubmittedInvalid(false);
      }
    },
    [hasSubmittedInvalid],
  );

  const isInvalid = hasSubmittedInvalid && !normalizeUserAddress(value);

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xl">
      <span className="text-base-content/40 pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <MagnifyingGlassIcon className="size-5" />
      </span>
      <input
        value={value}
        onChange={handleInputChange}
        placeholder="Search address"
        className={`bg-base-200/60 border-base-content/10 focus:ring-base-content/20 focus:border-base-content/20 placeholder:text-base-content/30 w-full rounded-lg border py-2.5 pl-10 pr-12 text-sm transition-colors focus:outline-none focus:ring-1 ${
          isInvalid ? "border-error focus:ring-error/40" : ""
        }`}
      />
      {hasOverride && (
        <button
          type="button"
          onClick={handleClear}
          className="text-base-content/40 hover:text-error absolute inset-y-0 right-2 flex items-center rounded-full p-1 transition-colors"
          aria-label="Clear address override"
        >
          <XMarkIcon className="size-5" />
        </button>
      )}
    </form>
  );
};
// Menu links component for mobile to avoid inline JSX
const MobileAppMenuLinksWrapper = () => <AppHeaderMenuLinks isMobile />;

// Wallet button wrapper for mobile drawer
const AutoWalletButton = () => <WalletButton variant="auto" />;

/**
 * App header for /app/app page with wallet connection and settings
 */
export const AppHeader = () => {
  const { isDrawerOpen, scrolled, burgerMenuRef, pathname, toggleDrawer, closeDrawer } = useHeaderState();
  const isPositionsPage = pathname === "/app";

  // Memoize JSX elements passed as props to avoid re-creating on each render
  const mobileMenuLinks = useMemo(() => <MobileAppMenuLinksWrapper />, []);
  const mobileWalletButtons = useMemo(() => <AutoWalletButton />, []);

  return (
    <>
      <div className={`sticky top-0 z-30 transition-all duration-300 ${scrolled ? "py-1" : "py-2"}`}>
        {/* Background - simple dark with subtle border */}
        <div
          className={`bg-base-100/95 absolute inset-0 backdrop-blur-md transition-all duration-300 ${
            scrolled ? "shadow-[0_1px_3px_rgba(0,0,0,0.3)]" : ""
          }`}
          style={Z_INDEX_BACK}
        >
          {/* Subtle bottom border */}
          <div className="bg-base-content/5 absolute inset-x-0 bottom-0 h-[1px]"></div>
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <div className="navbar h-auto min-h-0 justify-between gap-4 py-0">
            {/* Left section - Logo */}
            <div className="flex min-w-0 items-center">
              <div
                className="dropdown z-50 mr-2 lg:hidden"
                ref={burgerMenuRef}
                data-state={isDrawerOpen ? "open" : "closed"}
              >
                <MobileMenuButton isOpen={isDrawerOpen} onClick={toggleDrawer} />
                <MobileNavigationDrawer
                  isOpen={isDrawerOpen}
                  onClose={closeDrawer}
                  menuLinks={mobileMenuLinks}
                  walletButtons={mobileWalletButtons}
                />
              </div>

              {/* Logo */}
              <HeaderLogo scrolled={scrolled} />

              {/* Desktop Nav */}
              <div className="ml-6 hidden lg:flex">
                <AppHeaderMenuLinks />
              </div>
            </div>

            {/* Middle section - Address search */}
            <div className="hidden flex-1 justify-center md:flex">
              {isPositionsPage && <AddressSearchBar />}
            </div>

            {/* Right section - Wallet connection */}
            <div className="flex items-center">
              {/* Smart connect button - adapts to selected network */}
              <motion.div
                className="relative z-20 hidden items-center md:flex"
                initial={INITIAL_OPACITY}
                animate={ANIMATE_OPACITY}
                transition={WALLET_TRANSITION}
              >
                <WalletButton variant="auto" />
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
