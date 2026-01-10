import { memo, useEffect, useMemo, useCallback } from "react";
import { useTheme } from "next-themes";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/solid";
import { getNetworkColor } from "~~/hooks/scaffold-stark";
import { getTargetNetworks, type ChainWithAttributes } from "~~/utils/scaffold-stark";
import { useSwitchChain } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { track } from "@vercel/analytics";

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
  const { switchChain, error: switchChainError } = useSwitchChain({});
  const { chainId } = useAccount();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const allowedNetworks = getTargetNetworks();

  useEffect(() => {
    if (switchChainError)
      console.error(`Error switching chains: ${switchChainError}`);
  }, [switchChainError]);

  // note: might need a cleaner solutiojn
  const allowedNetworksMapping = useMemo(() => {
    return Object.fromEntries(
      allowedNetworks.map((chain) => [chain.network, chain.id.toString(16)]),
    );
  }, [allowedNetworks]);

  // Factory for network switch handlers
  const createSwitchHandler = useCallback(
    (network: ChainWithAttributes) => () => {
      const nextChainId = allowedNetworksMapping[network.network];
      track("Network switched event", {
        network: network.name,
        chainId: nextChainId,
      });
      switchChain({
        chainId: nextChainId,
      });
    },
    [allowedNetworksMapping, switchChain],
  );

  return (
    <>
      {allowedNetworks
        .filter((allowedNetwork) => allowedNetwork.id !== chainId)
        .map((allowedNetwork) => (
          <li key={allowedNetwork.network} className={hidden ? "hidden" : ""}>
            <button
              className="menu-item btn-sm flex gap-3 whitespace-nowrap !rounded-xl py-3"
              type="button"
              onClick={createSwitchHandler(allowedNetwork)}
            >
              <ArrowsRightLeftIcon className="ml-2 h-6 w-4 sm:ml-0" />
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
