import Image from "next/image";
import { useTheme } from "next-themes";
import { useAccount, useSwitchChain } from "wagmi";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/solid";
import { getNetworkColor } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const allowedNetworks = getTargetNetworks();

// Network logo mapping
const networkLogos: Record<string, string> = {
  Arbitrum: "/logos/arb.svg",
  Ethereum: "/logos/ethereum.svg",
  Optimism: "/logos/eth.svg",  // Placeholder
  "Arbitrum Sepolia": "/logos/arb.svg",
  // Add more networks as needed
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
                {networkLogos[allowedNetwork.name] && (
                  <div className="relative w-4 h-4">
                    <Image 
                      src={networkLogos[allowedNetwork.name] || "/logos/eth.svg"} 
                      alt={allowedNetwork.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
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
