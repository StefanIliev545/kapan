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

// Network logo mapping
const networkLogos: Record<string, string> = {
  Arbitrum: "/logos/arb.svg",
  "Arbitrum One": "/logos/arb.svg",  // The actual chain name from Wagmi
  Ethereum: "/logos/ethereum.svg", 
  Optimism: "/logos/eth.svg",  // Placeholder
  "Arbitrum Sepolia": "/logos/arb.svg",
  // Add more networks as needed
};

/**
 * Helper function to get network logo by ID or name
 */
const getNetworkLogo = (chain: Chain | null | undefined): string => {
  if (!chain) return "/logos/eth.svg";
  
  // Try to get logo by name first
  if (networkLogos[chain.name]) {
    return networkLogos[chain.name];
  }
  
  // If not found, check by chain ID
  switch (chain.id) {
    case 42161: // Arbitrum
      return "/logos/arb.svg";
    case 1: // Ethereum Mainnet
      return "/logos/ethereum.svg";
    case 10: // Optimism
      return "/logos/eth.svg"; // Using ETH as placeholder
    default:
      return "/logos/eth.svg";
  }
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
  const networkLogo = getNetworkLogo(chain);
  
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
              const networkLogo = getNetworkLogo(network);
              
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