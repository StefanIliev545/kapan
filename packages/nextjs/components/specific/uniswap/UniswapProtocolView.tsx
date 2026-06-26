"use client";

import { FC } from "react";
import { useAccount } from "wagmi";
import { LpProtocolView } from "~~/components/lp/LpProtocolView";
import { useUniswapPositions } from "~~/hooks/useUniswapPositions";
import { getEffectiveChainId } from "~~/utils/forkChain";

/** Uniswap V3 + V4 LP positions (view-only). Thin wrapper over the shared LpProtocolView. */
export const UniswapProtocolView: FC<{ chainId?: number }> = ({ chainId: propChainId }) => {
  const { address, chainId: walletChainId } = useAccount();
  const effectiveChainId = getEffectiveChainId(propChainId ?? walletChainId ?? 1);
  const { positions, isLoading, hasLoadedOnce } = useUniswapPositions(effectiveChainId, address);

  return (
    <LpProtocolView
      protocolName="Uniswap"
      protocolIcon="/logos/uni.svg"
      protocolUrl="https://app.uniswap.org/positions"
      chainId={effectiveChainId}
      positions={positions}
      isLoading={isLoading}
      hasLoadedOnce={hasLoadedOnce}
    />
  );
};
