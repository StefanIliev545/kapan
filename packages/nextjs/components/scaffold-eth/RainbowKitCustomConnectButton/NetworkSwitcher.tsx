import { useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Chain } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { track } from "@vercel/analytics";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { getNetworkColor } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const allowedNetworks = getTargetNetworks();

// Network logo mapping with theme support
// logo = dark mode, logoDark = light mode (following NetworkFilter pattern)
interface NetworkLogoConfig {
  logo: string;
  logoDark?: string;
}

const networkLogos: Record<string, NetworkLogoConfig> = {
  Arbitrum: { logo: "/logos/arb.svg" },
  "Arbitrum One": { logo: "/logos/arb.svg" },
  Ethereum: { logo: "/logos/ethereum.svg" },
  Optimism: { logo: "/logos/optimism.svg" },
  Base: { logo: "/logos/base.svg" },
  Linea: { logo: "/logos/linea.svg" },
  Plasma: { logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  "Arbitrum Sepolia": { logo: "/logos/arb.svg" },
};

// Chain ID to logo config mapping
const chainIdLogos: Record<number, NetworkLogoConfig> = {
  42161: { logo: "/logos/arb.svg" }, // Arbitrum
  1: { logo: "/logos/ethereum.svg" }, // Ethereum Mainnet
  10: { logo: "/logos/optimism.svg" }, // Optimism
  8453: { logo: "/logos/base.svg" }, // Base
  59144: { logo: "/logos/linea.svg" }, // Linea
  9745: { logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" }, // Plasma
  130: { logo: "/logos/unichain.svg" }, // Base Sepolia
};

/**
 * Helper function to get network logo by ID or name, theme-aware
 */
const getNetworkLogo = (chain: Chain | null | undefined, isDarkMode: boolean): string => {
  if (!chain) return "/logos/eth.svg";
  
  // Try to get logo config by name first
  let config = networkLogos[chain.name];
  
  // If not found by name, check by chain ID
  if (!config) {
    config = chainIdLogos[chain.id];
  }
  
  if (!config) return "/logos/eth.svg";
  
  // In dark mode, use logo. In light mode, use logoDark if available
  if (!isDarkMode && config.logoDark) {
    return config.logoDark;
  }
  return config.logo;
};

/**
 * Network switcher component that displays just the network icon
 */
export const NetworkSwitcher = () => {
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useOutsideClick(dropdownRef, () => setIsOpen(false));
  
  if (!chain) return null;
  
  const networkColor = getNetworkColor(chain as Chain, isDarkMode);
  const networkLogo = getNetworkLogo(chain, isDarkMode);
  
  return (
    <div ref={dropdownRef} className="relative flex-1">
      <div 
        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity duration-200 py-1"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Switch Network"
      >
        <div className="relative w-5 h-5">
          <Image 
            src={networkLogo} 
            alt={chain.name} 
            fill 
            className="object-contain"
          />
        </div>
        <span className="text-sm font-medium">{chain.name}</span>
        {allowedNetworks.length > 1 && (
          <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
        )}
      </div>
      
      {isOpen && allowedNetworks.length > 1 && (
        <div className="absolute right-0 mt-2 py-2 w-48 bg-base-200 rounded-box shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2 text-xs font-semibold text-base-content/70 border-b border-base-300">
            Select Network
          </div>
          <div className="max-h-80 overflow-y-auto">
            {allowedNetworks.map(network => {
              const isActive = network.id === chain?.id;
              const networkLogo = getNetworkLogo(network, isDarkMode);
              
              return (
                <button
                  key={network.id}
                  className={`w-full px-4 py-3 text-left hover:bg-base-300/50 ${isActive ? "bg-base-300/70" : ""} flex items-center gap-3`}
                  onClick={() => {
                    if (!isActive) {
                      track("Network switched event", {
                        network: network.name,
                        chainId: network.id,
                      });
                      switchChain?.({ chainId: network.id });
                    }
                    setIsOpen(false);
                  }}
                >
                  <div className="relative w-5 h-5 flex-shrink-0">
                    <Image 
                      src={networkLogo} 
                      alt={network.name} 
                      fill 
                      className="object-contain"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span 
                      className="font-medium text-sm"
                      style={{ color: isActive ? getNetworkColor(network, isDarkMode) : undefined }}
                    >
                      {network.name}
                    </span>
                    {isActive && (
                      <span className="text-xs text-base-content/60">Connected</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}; 