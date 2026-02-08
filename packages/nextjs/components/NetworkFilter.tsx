"use client";

import { track } from "@vercel/analytics";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo, FC } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import Image from "next/image";
import { getNetworkOptionLogo, NETWORK_ID_TO_CHAIN_ID, CHAIN_ID_TO_NETWORK_ID } from "~~/utils/networkLogos";

export interface NetworkOption {
  id: string;
  name: string;
  logo: string;
  logoDark?: string; // Optional dark mode logo (if different from light mode)
}

interface NetworkFilterProps {
  networks: NetworkOption[];
  defaultNetwork?: string;
  onNetworkChange: (networkId: string) => void;
}

const STORAGE_KEY = "kapan-network-filter-selection";

// --- tweakable behavior flags ---
const SHALLOW_URL_SYNC = true; // don't trigger app-router navigation
const HISTORY_MODE: "replace" | "push" = "push"; // "push" so Back works
// ============ Extracted helpers to reduce cognitive complexity ============

/**
 * Try to switch wallet to EVM chain for networkId. Non-blocking, skips hardhat.
 */
function trySwitchWalletChain(
  networkId: string,
  currentChainId: number | undefined,
  switchChain: ((args: { chainId: number }) => void) | undefined,
  label: string,
): void {
  if (networkId === "hardhat") return;
  const chainId = NETWORK_ID_TO_CHAIN_ID[networkId];
  if (!chainId || chainId === currentChainId) return;
  try { void switchChain?.({ chainId }); }
  catch (e) { console.warn(`Auto network switch failed on ${label}`, e); }
}

/** Persist network selection to localStorage (best-effort). */
function cacheNetworkSelection(networkId: string): void {
  try { localStorage.setItem(STORAGE_KEY, networkId); } catch { }
}

/** Read cached network selection from localStorage (best-effort). */
function readCachedNetwork(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

/**
 * Apply a network selection: update React state, notify parent, persist to cache,
 * and optionally switch the wallet chain.
 */
function applyNetworkSelection(
  networkId: string,
  setSelectedNetwork: (id: string) => void,
  onNetworkChange: (id: string) => void,
  currentChainId: number | undefined,
  switchChain: ((args: { chainId: number }) => void) | undefined,
  label: string,
): void {
  setSelectedNetwork(networkId);
  onNetworkChange(networkId);
  cacheNetworkSelection(networkId);
  trySwitchWalletChain(networkId, currentChainId, switchChain, label);
}

// Sub-component for network button to handle ref and click properly
interface NetworkButtonProps {
  network: NetworkOption;
  isActive: boolean;
  isDarkMode: boolean;
  onNetworkChange: (networkId: string) => void;
  onRef: (id: string, el: HTMLButtonElement | null) => void;
}

const NetworkButton: FC<NetworkButtonProps> = ({
  network,
  isActive,
  isDarkMode,
  onNetworkChange,
  onRef,
}) => {
  const handleClick = useCallback(() => {
    onNetworkChange(network.id);
  }, [onNetworkChange, network.id]);

  const handleRef = useCallback((el: HTMLButtonElement | null) => {
    onRef(network.id, el);
  }, [onRef, network.id]);

  return (
    <button
      ref={handleRef}
      type="button"
      aria-pressed={isActive}
      className={`
        relative z-10 flex min-w-[65px] items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-200
        ${isActive
          ? "text-base-content"
          : "text-base-content/35 hover:text-base-content/60"
        }
      `}
      onClick={handleClick}
    >
      <div className="relative size-3 shrink-0">
        <Image
          src={getNetworkOptionLogo(network, isDarkMode)}
          alt={network.name}
          fill
          sizes="12px"
          className="object-contain"
        />
      </div>
      <span className="whitespace-nowrap">{network.name}</span>
    </button>
  );
};

const NetworkFilterInner: React.FC<NetworkFilterProps> = ({
  networks,
  defaultNetwork = networks[0]?.id,
  onNetworkChange,
}) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  // Always dark mode with kapan theme
  const isDarkMode = true;

  const [selectedNetwork, setSelectedNetwork] = useState<string>(defaultNetwork);
  const selectedRef = useRef(selectedNetwork);
  const didInitRef = useRef(false);
  const suppressNextUrlSyncRef = useRef(false); // guards URL->state loop
  const weInitiatedChainSwitchRef = useRef(false); // guards wallet->filter loop

  // keep ref in sync
  useEffect(() => {
    selectedRef.current = selectedNetwork;
  }, [selectedNetwork]);

  const isValid = useCallback(
    (id: string | null | undefined) => !!id && networks.some((n) => n.id === id),
    [networks]
  );

  // Helper: write the ?network=... into the URL *without* triggering navigation
  const shallowUpdateUrl = useCallback((networkId: string, mode: "replace" | "push") => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("network", networkId);
    if (mode === "push") {
      window.history.pushState({ network: networkId }, "", url.toString());
    } else {
      window.history.replaceState({ network: networkId }, "", url.toString());
    }
  }, []);

  // Listen to Back/Forward and keep our state in sync (because shallow updates won't notify Next)
  useEffect(() => {
    if (!SHALLOW_URL_SYNC) return;

    const onPopState = () => {
      const url = new URL(window.location.href);
      const urlNetwork = url.searchParams.get("network");
      if (!isValid(urlNetwork) || !urlNetwork || urlNetwork === selectedRef.current) return;
      applyNetworkSelection(urlNetwork, setSelectedNetwork, onNetworkChange, chain?.id, switchChain, "popstate");
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isValid, onNetworkChange, chain?.id, switchChain]);

  // 1) Initialize once after mount (URL > cache > default)
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const urlNetwork = searchParams.get("network");
    let initial = defaultNetwork;

    if (isValid(urlNetwork) && urlNetwork) {
      initial = urlNetwork;
    } else if (defaultNetwork !== "hardhat") {
      // Only use cache if not in hardhat dev mode
      const cached = readCachedNetwork();
      if (isValid(cached) && cached) initial = cached;
    }

    if (!initial || initial === selectedRef.current) return;
    applyNetworkSelection(initial, setSelectedNetwork, onNetworkChange, chain?.id, switchChain, "init");
  }, [defaultNetwork, isValid, onNetworkChange, searchParams, chain?.id, switchChain]);

  // 2) React to *external* URL param changes driven by Next navigation only.
  //    (If SHALLOW_URL_SYNC is true, our own URL changes won't trigger this effect.)
  useEffect(() => {
    if (suppressNextUrlSyncRef.current) {
      suppressNextUrlSyncRef.current = false;
      return;
    }
    if (SHALLOW_URL_SYNC) return; // shallow mode: we manage URL with popstate above

    const urlNetwork = searchParams.get("network");
    if (!isValid(urlNetwork) || !urlNetwork || urlNetwork === selectedRef.current) return;
    applyNetworkSelection(urlNetwork, setSelectedNetwork, onNetworkChange, chain?.id, switchChain, "URL change");
  }, [isValid, onNetworkChange, searchParams, chain?.id, switchChain]);

  // 3) Handle invalid selection if networks change
  useEffect(() => {
    if (!isValid(selectedRef.current)) {
      const fallback = (isValid(defaultNetwork) && defaultNetwork) || networks[0]?.id;
      if (fallback && fallback !== selectedRef.current) {
        handleNetworkChange(fallback, { trackEvent: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networks, defaultNetwork]);

  // 4) Sync wallet network changes (from navbar) back to the filter
  // Disabled entirely in hardhat dev mode to prevent unwanted network switches
  const isHardhatDevMode = process.env.NEXT_PUBLIC_ENABLE_HARDHAT_UI === "true";
  useEffect(() => {
    if (isHardhatDevMode || !chain?.id) return;

    // If we initiated the chain switch, skip syncing back
    if (weInitiatedChainSwitchRef.current) {
      weInitiatedChainSwitchRef.current = false;
      return;
    }

    // Map chain ID to network filter ID
    const networkId = CHAIN_ID_TO_NETWORK_ID[chain.id];
    if (!networkId || !isValid(networkId)) return;

    // Only update if different from current selection
    if (networkId !== selectedRef.current) {
      setSelectedNetwork(networkId);
      onNetworkChange(networkId);

      cacheNetworkSelection(networkId);

      // Update URL
      if (SHALLOW_URL_SYNC) {
        shallowUpdateUrl(networkId, "replace");
      }
    }
  }, [chain?.id, isValid, onNetworkChange, shallowUpdateUrl, isHardhatDevMode]);

  const handleNetworkChange = useCallback((networkId: string, { trackEvent = true }: { trackEvent?: boolean } = {}) => {
    // In hardhat dev mode, always allow hardhat even if not in networks array
    const isValidOrHardhat = isValid(networkId) || (isHardhatDevMode && networkId === "hardhat");
    if (!isValidOrHardhat || networkId === selectedRef.current) return;

    if (trackEvent) {
      track("network_filter_select", {
        networkId,
        pathname,
      });
    }

    // Update UI immediately
    setSelectedNetwork(networkId);
    onNetworkChange(networkId);

    cacheNetworkSelection(networkId);

    // Switch wallet network if it's an EVM network (non-blocking)
    // Skip for hardhat - user should manually add hardhat network to wallet if needed
    if (networkId !== "hardhat") {
      const chainId = NETWORK_ID_TO_CHAIN_ID[networkId];
      if (chainId && chainId !== chain?.id) {
        try {
          weInitiatedChainSwitchRef.current = true; // Prevent sync loop
          void switchChain?.({ chainId });
        } catch (e) {
          weInitiatedChainSwitchRef.current = false;
          console.warn("Auto network switch failed", e);
        }
      }
    }

    // Update URL
    const currentUrlNetwork = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("network")
      : searchParams.get("network");

    if (currentUrlNetwork === networkId) return;

    if (SHALLOW_URL_SYNC) {
      shallowUpdateUrl(networkId, HISTORY_MODE);
    } else {
      const next = new URLSearchParams(searchParams.toString());
      next.set("network", networkId);
      suppressNextUrlSyncRef.current = true;
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [isValid, pathname, onNetworkChange, chain?.id, switchChain, searchParams, shallowUpdateUrl, router, isHardhatDevMode]);

  // Track button refs for measuring positions
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  // Callback for storing button refs
  const handleButtonRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) {
      buttonRefs.current.set(id, el);
    }
  }, []);

  // Update indicator position when selection changes
  useEffect(() => {
    const button = buttonRefs.current.get(selectedNetwork);
    const container = containerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [selectedNetwork, networks]);

  // Memoize the indicator style object
  const indicatorStyleObject = useMemo(() => {
    if (!indicatorStyle) return undefined;
    return {
      left: indicatorStyle.left,
      width: indicatorStyle.width,
    };
  }, [indicatorStyle]);

  // Mobile dropdown state
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  // Close mobile dropdown on outside click
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setIsMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileOpen]);

  const activeNetwork = networks.find(n => n.id === selectedNetwork) || networks[0];

  return (
    <>
      {/* Mobile: dropdown trigger + popover */}
      <div ref={mobileRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setIsMobileOpen(prev => !prev)}
          className="bg-base-200/50 border-base-content/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
        >
          <div className="relative size-4 shrink-0">
            <Image
              src={getNetworkOptionLogo(activeNetwork, isDarkMode)}
              alt={activeNetwork.name}
              fill
              sizes="16px"
              className="object-contain"
            />
          </div>
          <span>{activeNetwork.name}</span>
          <ChevronDownIcon className={`size-3.5 transition-transform ${isMobileOpen ? "rotate-180" : ""}`} />
        </button>
        {isMobileOpen && (
          <div className="bg-base-200 border-base-content/10 absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border py-1 shadow-xl">
            {networks.map((network) => (
              <button
                key={network.id}
                type="button"
                onClick={() => {
                  handleNetworkChange(network.id);
                  setIsMobileOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  network.id === selectedNetwork
                    ? "bg-base-content/10 text-base-content font-semibold"
                    : "text-base-content/60 hover:bg-base-content/5 hover:text-base-content"
                }`}
              >
                <div className="relative size-4 shrink-0">
                  <Image
                    src={getNetworkOptionLogo(network, isDarkMode)}
                    alt={network.name}
                    fill
                    sizes="16px"
                    className="object-contain"
                  />
                </div>
                <span>{network.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: inline tab bar with sliding indicator */}
      <div
        ref={containerRef}
        className="bg-base-200/50 border-base-content/10 relative hidden items-center gap-0.5 rounded-lg border p-1 transition-[width] duration-200 ease-out sm:inline-flex"
      >
        {indicatorStyleObject && (
          <div
            className="bg-base-content/10 absolute inset-y-1 rounded-md transition-all duration-200 ease-out"
            style={indicatorStyleObject}
          />
        )}
        {networks.map((network) => {
          const isActive = selectedNetwork === network.id;
          return (
            <NetworkButton
              key={network.id}
              network={network}
              isActive={isActive}
              isDarkMode={isDarkMode}
              onNetworkChange={handleNetworkChange}
              onRef={handleButtonRef}
            />
          );
        })}
      </div>
    </>
  );
};

export const NetworkFilter: React.FC<NetworkFilterProps> = (props) => {
  // Memoize fallback JSX to avoid re-creating on each render
  const suspenseFallback = useMemo(
    () => (
      <div className="flex items-center gap-1 rounded-lg bg-transparent p-1">
        <div className="flex items-center gap-0.5">
          {props.networks.map((network) => (
            <button
              key={network.id}
              type="button"
              disabled
              className="inline-flex min-w-[65px] items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase opacity-60"
            >
              <div className="relative size-3">
                <Image
                  src={network.logo}
                  alt={network.name}
                  fill
                  sizes="12px"
                  className="object-contain"
                />
              </div>
              <span className="whitespace-nowrap">{network.name}</span>
            </button>
          ))}
        </div>
      </div>
    ),
    [props.networks],
  );

  return (
    <Suspense fallback={suspenseFallback}>
      <NetworkFilterInner {...props} />
    </Suspense>
  );
};
