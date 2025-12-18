import Image from "next/image";
import { useTheme } from "next-themes";
import { useAccount, useSwitchChain } from "wagmi";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/solid";
import { getNetworkColor } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const allowedNetworks = getTargetNetworks();

// Network logo mapping with theme support
interface NetworkLogoConfig {
  logo: string;
  logoDark?: string;
}

const networkLogos: Record<string, NetworkLogoConfig> = {
  Arbitrum: { logo: "/logos/arb.svg" },
  Ethereum: { logo: "/logos/ethereum.svg" },
  Optimism: { logo: "/logos/optimism.svg" },
  Base: { logo: "/logos/base.svg" },
  Linea: { logo: "/logos/linea.svg" },
  Plasma: { logo: "/logos/plasma.png", logoDark: "/logos/plasma-dark.png" },
  "Arbitrum Sepolia": { logo: "/logos/arb.svg" },
};

// Helper to get theme-aware logo
const getNetworkLogo = (networkName: string, isDarkMode: boolean): string => {
  const config = networkLogos[networkName];
  if (!config) return "/logos/eth.svg";
  
  // In dark mode, use logo. In light mode, use logoDark if available
  if (!isDarkMode && config.logoDark) {
    return config.logoDark;
  }
  return config.logo;
};

type NetworkOptionsProps = {
  hidden?: boolean;
};

export const NetworkOptions = ({ hidden = false }: NetworkOptionsProps) => {
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  return (
    <>
      {allowedNetworks
        .filter(allowedNetwork => allowedNetwork.id !== chain?.id)
        .map(allowedNetwork => (
          <li key={allowedNetwork.id} className={hidden ? "hidden" : ""}>
            <button
              className="menu-item btn-sm !rounded-xl flex gap-3 py-3 whitespace-nowrap"
              type="button"
              onClick={() => {
                switchChain?.({ chainId: allowedNetwork.id });
              }}
            >
              <div className="flex items-center gap-2">
                <ArrowsRightLeftIcon className="h-5 w-4 ml-2 sm:ml-0" />
                <div className="relative w-4 h-4">
                  <Image 
                    src={getNetworkLogo(allowedNetwork.name, isDarkMode)} 
                    alt={allowedNetwork.name}
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
              <span>
                Switch to{" "}
                <span
                  style={{
                    color: getNetworkColor(allowedNetwork, isDarkMode),
                  }}
                >
                  {allowedNetwork.name}
                </span>
              </span>
            </button>
          </li>
        ))}
    </>
  );
};
