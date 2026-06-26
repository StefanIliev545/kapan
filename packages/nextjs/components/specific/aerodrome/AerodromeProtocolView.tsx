"use client";

import { FC } from "react";
import { useAccount } from "wagmi";
import { LpProtocolView } from "~~/components/lp/LpProtocolView";
import { useAerodromePositions } from "~~/hooks/useAerodromePositions";
import { getEffectiveChainId } from "~~/utils/forkChain";

// Slipstream lives on two chains under two brands — pick identity per chain.
const META: Record<number, { name: string; icon: string; url: string }> = {
  8453: { name: "Aerodrome", icon: "/logos/aero.svg", url: "https://aerodrome.finance/positions" },
  10: { name: "Velodrome", icon: "/logos/velo.png", url: "https://velodrome.finance/positions" },
};

/**
 * Aerodrome (Base) / Velodrome (Optimism) concentrated-liquidity LP positions (view-only).
 * Thin wrapper over the shared LpProtocolView — reuses the same card as Uniswap.
 */
export const AerodromeProtocolView: FC<{ chainId?: number }> = ({ chainId: propChainId }) => {
  const { address, chainId: walletChainId } = useAccount();
  const effectiveChainId = getEffectiveChainId(propChainId ?? walletChainId ?? 8453);
  const { positions, isLoading, hasLoadedOnce } = useAerodromePositions(effectiveChainId, address);
  const meta = META[effectiveChainId] ?? META[8453];

  return (
    <LpProtocolView
      protocolName={meta.name}
      protocolIcon={meta.icon}
      protocolUrl={meta.url}
      chainId={effectiveChainId}
      positions={positions}
      isLoading={isLoading}
      hasLoadedOnce={hasLoadedOnce}
    />
  );
};
