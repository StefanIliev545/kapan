import Image from "next/image";
import { memo, useMemo, useCallback } from "react";
import { useTheme } from "next-themes";
import { useAccount, useSwitchChain } from "wagmi";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/solid";
import { getNetworkColor } from "~~/hooks/scaffold-eth";
import { getTargetNetworks, type ChainWithAttributes } from "~~/utils/scaffold-eth";
import { getNetworkLogo } from "~~/utils/networkLogos";

const allowedNetworks = getTargetNetworks();

// Memoized network name span to avoid creating inline style objects
const NetworkName = memo(function NetworkName({
  network,
  isDarkMode,
}: {
  network: ChainWithAttributes;
  isDarkMode: boolean;
}) {
  const style = useMemo(
    () => ({ color: getNetworkColor(network, isDarkMode) }),
    [network, isDarkMode]
  );
  return <span style={style}>{network.name}</span>;
});

type NetworkOptionsProps = {
  hidden?: boolean;
};

export const NetworkOptions = ({ hidden = false }: NetworkOptionsProps) => {
  const { switchChain } = useSwitchChain();
  const { chain } = useAccount();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  // Factory for network switch handlers
  const createSwitchHandler = useCallback(
    (chainId: number) => () => switchChain?.({ chainId }),
    [switchChain],
  );

  return (
    <>
      {allowedNetworks
        .filter(allowedNetwork => allowedNetwork.id !== chain?.id)
        .map(allowedNetwork => (
          <li key={allowedNetwork.id} className={hidden ? "hidden" : ""}>
            <button
              className="menu-item btn-sm flex gap-3 whitespace-nowrap !rounded-xl py-3"
              type="button"
              onClick={createSwitchHandler(allowedNetwork.id)}
            >
              <div className="flex items-center gap-2">
                <ArrowsRightLeftIcon className="ml-2 h-5 w-4 sm:ml-0" />
                <div className="relative size-4">
                  <Image
                    src={getNetworkLogo(allowedNetwork, isDarkMode)}
                    alt={allowedNetwork.name}
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
              <span>
                Switch to{" "}
                <NetworkName network={allowedNetwork} isDarkMode={isDarkMode} />
              </span>
            </button>
          </li>
        ))}
    </>
  );
};
