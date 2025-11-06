"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import Image from "next/image";

export interface NetworkOption {
  id: string;
  name: string;
  logo: string;
}

interface NetworkFilterProps {
  networks: NetworkOption[];
  defaultNetwork?: string;
  onNetworkChange: (networkId: string) => void;
}

const STORAGE_KEY = "kapan-network-filter-selection";

// Map network IDs to EVM chain IDs
const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
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
  const [selectedNetwork, setSelectedNetwork] = useState<string>(defaultNetwork);
  const selectedRef = useRef(selectedNetwork);
  const didInitRef = useRef(false);
  const suppressNextUrlSyncRef = useRef(false); // guards URL->state loop
  const [isPending, startTransition] = useTransition();

  // keep ref in sync
  useEffect(() => {
    selectedRef.current = selectedNetwork;
  }, [selectedNetwork]);

  const isValid = useCallback(
    (id: string | null | undefined) => !!id && networks.some((n) => n.id === id),
    [networks]
  );

  // 1) Initialize once after mount (and when networks/default change):
  //    URL param > cache > default
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const urlNetwork = searchParams.get("network");
    let initial = defaultNetwork;

    if (isValid(urlNetwork)) {
      initial = urlNetwork!;
    } else {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (isValid(cached)) initial = cached!;
      } catch {
        // ignore
      }
    }

    if (initial && initial !== selectedRef.current) {
      setSelectedNetwork(initial);
      onNetworkChange(initial);
      
      // Switch wallet network if it's an EVM network
      const chainId = NETWORK_TO_CHAIN_ID[initial];
      if (chainId && chainId !== chain?.id) {
        try {
          switchChain?.({ chainId });
        } catch (e) {
          // Non-blocking; user can still switch manually
          console.warn("Auto network switch failed on init", e);
        }
      }
    }
  }, [defaultNetwork, isValid, onNetworkChange, searchParams, chain?.id, switchChain]);

  // 2) React to *external* URL param changes (e.g. user navigates, shares a link).
  //    Guard against the change we just made ourselves via suppressNextUrlSyncRef.
  useEffect(() => {
    if (suppressNextUrlSyncRef.current) {
      suppressNextUrlSyncRef.current = false;
      return;
    }
    const urlNetwork = searchParams.get("network");
    if (isValid(urlNetwork) && urlNetwork !== selectedRef.current) {
      setSelectedNetwork(urlNetwork!);
      onNetworkChange(urlNetwork!);
      try {
        localStorage.setItem(STORAGE_KEY, urlNetwork!);
      } catch {
        // ignore
      }
      
      // Switch wallet network if it's an EVM network
      const chainId = NETWORK_TO_CHAIN_ID[urlNetwork!];
      if (chainId && chainId !== chain?.id) {
        try {
          switchChain?.({ chainId });
        } catch (e) {
          // Non-blocking; user can still switch manually
          console.warn("Auto network switch failed on URL change", e);
        }
      }
    }
  }, [isValid, onNetworkChange, searchParams, chain?.id, switchChain]);

  // 3) If the networks list changes and current selection becomes invalid, fall back.
  useEffect(() => {
    if (!isValid(selectedRef.current)) {
      const fallback = (isValid(defaultNetwork) && defaultNetwork) || networks[0]?.id;
      if (fallback && fallback !== selectedRef.current) {
        // Use the same handler so URL/cache stay consistent
        handleNetworkChange(fallback);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networks, defaultNetwork]); // intentionally not depending on handleNetworkChange

  const handleNetworkChange = (networkId: string) => {
    if (!isValid(networkId) || networkId === selectedRef.current) return;

    // Update UI immediately
    setSelectedNetwork(networkId);
    onNetworkChange(networkId);

    // Persist to cache
    try {
      localStorage.setItem(STORAGE_KEY, networkId);
    } catch {
      // ignore
    }

    // Switch wallet network if it's an EVM network
    const chainId = NETWORK_TO_CHAIN_ID[networkId];
    if (chainId && chainId !== chain?.id) {
      try {
        switchChain?.({ chainId });
      } catch (e) {
        // Non-blocking; user can still switch manually
        console.warn("Auto network switch failed", e);
      }
    }

    // Update URL param (replace to avoid history spam) only if needed
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("network") !== networkId) {
      params.set("network", networkId);
      suppressNextUrlSyncRef.current = true; // prevent the URL effect from re-applying
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-transparent rounded-lg">
      <div className="flex items-center gap-2">
        {networks.map((network) => {
          const isActive = selectedNetwork === network.id;
          return (
            <button
              key={network.id}
              type="button"
              aria-pressed={isActive}
              className={`btn btn-sm normal-case flex items-center gap-2 ${
                isActive ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => handleNetworkChange(network.id)}
              disabled={isPending && !isActive} // optional: avoid spamming while URL updates
            >
              <div className="w-5 h-5 relative">
                <Image
                  src={network.logo}
                  alt={network.name}
                  fill
                  sizes="20px"
                  className="object-contain"
                />
              </div>
              <span>{network.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Wrapper component that handles Suspense boundary for useSearchParams
export const NetworkFilter: React.FC<NetworkFilterProps> = (props) => {
  return (
    <Suspense fallback={
      <div className="flex items-center gap-4 p-4 bg-transparent rounded-lg">
        <div className="flex items-center gap-2">
          {props.networks.map((network) => (
            <button
              key={network.id}
              type="button"
              disabled
              className="btn btn-sm normal-case flex items-center gap-2 btn-ghost opacity-50"
            >
              <div className="w-5 h-5 relative">
                <Image
                  src={network.logo}
                  alt={network.name}
                  fill
                  sizes="20px"
                  className="object-contain"
                />
              </div>
              <span>{network.name}</span>
            </button>
          ))}
        </div>
      </div>
    }>
      <NetworkFilterInner {...props} />
    </Suspense>
  );
};
