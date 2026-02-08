import { useMemo } from "react";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { PositionGroup, TokenPosition, ProtocolId } from "~~/types/positions";

/**
 * Context stored for cross-topology protocols (Aave, Venus, Spark, ZeroLend)
 * Contains the original ProtocolPosition arrays needed by modals.
 */
export interface CrossPositionContext {
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
}

function protocolPositionToToken(pos: ProtocolPosition): TokenPosition {
  return {
    address: pos.tokenAddress,
    symbol: pos.tokenSymbol || pos.name,
    icon: pos.icon,
    decimals: pos.tokenDecimals || 18,
    rawBalance: pos.tokenBalance,
    usdValue: Math.abs(pos.balance), // borrow balances are negative in ProtocolPosition
    priceRaw: pos.tokenPrice || 0n,
    rate: pos.currentRate,
    rateLabel: "APY",
  };
}

/**
 * Adapter hook for cross-topology protocols (Aave, Venus, Spark, ZeroLend).
 * Takes the existing suppliedPositions/borrowedPositions and wraps them as a single PositionGroup.
 *
 * NOTE: Compound V3 uses multi-topology (N collaterals : 1 debt per Comet market)
 * and has its own adapter at hooks/adapters/useCompoundPositionGroups.ts.
 *
 * NOTE: This hook doesn't fetch data itself. It expects pre-fetched positions
 * from the existing AaveLike data flow.
 */
export function useAavePositionGroups(
  protocol: ProtocolId,
  chainId: number,
  suppliedPositions: ProtocolPosition[],
  borrowedPositions: ProtocolPosition[],
): PositionGroup[] {
  return useMemo(() => {
    // Filter to positions with actual balances
    const activeSupply = suppliedPositions.filter(p => p.tokenBalance && p.tokenBalance > 0n);
    const activeDebt = borrowedPositions.filter(p => p.tokenBalance && p.tokenBalance > 0n);

    // If no positions at all, return empty
    if (activeSupply.length === 0 && activeDebt.length === 0) return [];

    const collaterals = activeSupply.map(p => protocolPositionToToken(p));
    const debts = activeDebt.map(p => protocolPositionToToken(p));

    const context: CrossPositionContext = {
      suppliedPositions,
      borrowedPositions,
    };

    const group: PositionGroup = {
      id: `${protocol}-${chainId}`,
      protocol,
      chainId,
      network: "evm",
      topology: "cross",
      collaterals,
      debts,
      health: null, // Cross-topology health comes from contract-level (LTV from gateway)
      context,
    };

    return [group];
  }, [protocol, chainId, suppliedPositions, borrowedPositions]);
}
