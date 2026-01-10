"use client";

import { track } from "@vercel/analytics";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo, FC } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import Image from "next/image";
import { getNetworkOptionLogo, NETWORK_ID_TO_CHAIN_ID } from "~~/utils/networkLogos";

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
        relative z-10 flex min-w-[90px] items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-200
        ${isActive
          ? "text-base-content"
          : "text-base-content/35 hover:text-base-content/60"
        }
      `}
      onClick={handleClick}
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
      if (isValid(urlNetwork) && urlNetwork && urlNetwork !== selectedRef.current) {
        setSelectedNetwork(urlNetwork);
        onNetworkChange(urlNetwork);

        // cache
        try {
          localStorage.setItem(STORAGE_KEY, urlNetwork);
        } catch { }
        // non-blocking wallet network switch
        const chainId = NETWORK_ID_TO_CHAIN_ID[urlNetwork];
        if (chainId && chainId !== chain?.id) {
          try {
            void switchChain?.({ chainId });
          } catch (e) {
            console.warn("Auto network switch failed on popstate", e);
          }
        }
      }
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
    } else {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (isValid(cached) && cached) initial = cached;
      } catch { }
    }

    if (initial && initial !== selectedRef.current) {
      setSelectedNetwork(initial);
      onNetworkChange(initial);

      // Switch wallet network if it's an EVM network (non-blocking)
      const chainId = NETWORK_ID_TO_CHAIN_ID[initial];
      if (chainId && chainId !== chain?.id) {
        try {
          void switchChain?.({ chainId });
        } catch (e) {
          console.warn("Auto network switch failed on init", e);
        }
      }
    }
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
    if (isValid(urlNetwork) && urlNetwork && urlNetwork !== selectedRef.current) {
      setSelectedNetwork(urlNetwork);
      onNetworkChange(urlNetwork);
      try {
        localStorage.setItem(STORAGE_KEY, urlNetwork);
      } catch { }
      const chainId = NETWORK_ID_TO_CHAIN_ID[urlNetwork];
      if (chainId && chainId !== chain?.id) {
        try {
          void switchChain?.({ chainId });
        } catch (e) {
          console.warn("Auto network switch failed on URL change", e);
        }
      }
    }
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

  const handleNetworkChange = useCallback((networkId: string, { trackEvent = true }: { trackEvent?: boolean } = {}) => {
    if (!isValid(networkId) || networkId === selectedRef.current) return;

    if (trackEvent) {
      track("network_filter_select", {
        networkId,
        pathname,
      });
    }

    // Update UI immediately
    setSelectedNetwork(networkId);
    onNetworkChange(networkId);

    // Persist to cache
    try {
      localStorage.setItem(STORAGE_KEY, networkId);
    } catch { }

    // Switch wallet network if it's an EVM network (non-blocking)
    const chainId = NETWORK_ID_TO_CHAIN_ID[networkId];
    if (chainId && chainId !== chain?.id) {
      try {
        void switchChain?.({ chainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }

    // Update URL
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : searchParams.toString()
    );
    if (params.get("network") !== networkId) {
      if (SHALLOW_URL_SYNC) {
        shallowUpdateUrl(networkId, HISTORY_MODE); // no navigation
      } else {
        // Fallback to Next navigation (rare case if you really need it)
        const next = new URLSearchParams(searchParams.toString());
        next.set("network", networkId);
        suppressNextUrlSyncRef.current = true;
        // No startTransition here; let Next handle it
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }
    }
  }, [isValid, pathname, onNetworkChange, chain?.id, switchChain, searchParams, shallowUpdateUrl, router]);

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

  return (
    <div
      ref={containerRef}
      className="bg-base-200/50 border-base-content/10 relative inline-flex items-center gap-0.5 rounded-lg border p-1"
    >
      {/* Animated sliding indicator */}
      {indicatorStyleObject && (
        <div
          className="bg-base-content/10 absolute inset-y-1 rounded-md transition-all duration-300 ease-out"
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
  );
};

export const NetworkFilter: React.FC<NetworkFilterProps> = (props) => {
  // Memoize fallback JSX to avoid re-creating on each render
  const suspenseFallback = useMemo(
    () => (
      <div className="flex items-center gap-4 rounded-lg bg-transparent p-4">
        <div className="flex items-center gap-2">
          {props.networks.map((network) => (
            <button
              key={network.id}
              type="button"
              disabled
              // keep pointer-events enabled for other parts of the page:
              className="btn btn-sm btn-outline inline-flex items-center gap-2 normal-case opacity-60"
            >
              <div className="relative size-5">
                <Image
                  src={network.logo}
                  alt={network.name}
                  fill
                  sizes="20px"
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
