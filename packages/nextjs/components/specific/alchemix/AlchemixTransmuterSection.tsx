"use client";

import { FC, useMemo } from "react";
import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useAlchemixTransmuterPositions, type AlchemixTransmuterPosition } from "~~/hooks/useAlchemixTransmuterPositions";
import { type AlchemixMarket, getAlchemixMarkets } from "~~/utils/alchemix/markets";
import { ALCHEMIX_GATEWAY_NAME } from "~~/utils/alchemix/protocolConstants";

interface AlchemixTransmuterSectionProps {
  chainId: number;
  /** Maps token address (lowercase) → 1e8-scaled USD price; used for APY estimate + row USD label. */
  pricesRaw: Record<string, bigint>;
}

// Multicall3 — deployed at the same address on every chain. `getBlockNumber()` reads
// Solidity's `block.number` opcode, which on Arbitrum returns the L1 block number (NOT L2)
// — exactly what the Transmuter uses when stamping `maturationBlock = block.number + ttl`.
// wagmi's `useBlockNumber` returns the L2 block, which is ~18× larger and would make every
// position read as already matured. Source: Arbitrum docs on block.number semantics.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const GET_BLOCK_NUMBER_ABI = [
  {
    type: "function",
    name: "getBlockNumber",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Average L1 block time in seconds — used to convert "blocks until maturity" → time. */
const L1_SECONDS_PER_BLOCK = 12;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

/**
 * Renders the user's Alchemix V3 transmuter positions as supply-style rows.
 *
 * The transmuter is a vesting redemption — users stake alAsset, then after `timeToTransmute`
 * L1 blocks they can claim an equivalent value of the underlying. APY is estimated from the
 * market discount of alAsset vs the underlying (1:1 at maturity) over the remaining maturity
 * period — no extra RPC call beyond what we already do for prices.
 */
export const AlchemixTransmuterSection: FC<AlchemixTransmuterSectionProps> = ({ chainId, pricesRaw }) => {
  const markets = useMemo(() => getAlchemixMarkets(chainId), [chainId]);

  // L1 block number — see comment above for why we don't use wagmi's useBlockNumber here.
  // Refetches every 30s; sub-30s precision doesn't matter for maturity readouts.
  const { data: solidityBlockNumber } = useReadContract({
    address: MULTICALL3_ADDRESS,
    abi: GET_BLOCK_NUMBER_ABI,
    functionName: "getBlockNumber",
    chainId,
    query: { refetchInterval: 30_000, staleTime: 25_000 },
  });

  // Hooks must be called unconditionally — markets list is stable per chain (alUSD + alETH
  // on Arbitrum, etc.), so this is safe across renders.
  const market0 = markets[0];
  const market1 = markets[1];
  const q0 = useAlchemixTransmuterPositions({
    alchemist: market0?.alchemist as Address | undefined,
    marketId: market0?.marketId ?? -1,
    chainId,
    enabled: !!market0,
  });
  const q1 = useAlchemixTransmuterPositions({
    alchemist: market1?.alchemist as Address | undefined,
    marketId: market1?.marketId ?? -1,
    chainId,
    enabled: !!market1,
  });

  const queries = [
    market0 && !q0.isUnavailable ? { market: market0, query: q0 } : null,
    market1 && !q1.isUnavailable ? { market: market1, query: q1 } : null,
  ].filter((x): x is { market: AlchemixMarket; query: typeof q0 } => x !== null);

  if (queries.length === 0) return null;

  const anyLoading = queries.some(q => q.query.isLoading && q.query.positions.length === 0);
  const totalPositions = queries.reduce((sum, q) => sum + q.query.positions.length, 0);

  if (anyLoading && totalPositions === 0) {
    return (
      <div className="flex items-center justify-center py-3">
        <LoadingSpinner />
      </div>
    );
  }

  if (totalPositions === 0) return null;

  return (
    <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
      <div className="card-body p-4">
        <div className="text-base-content/40 mb-2 text-[10px] font-semibold uppercase tracking-wider">
          Transmuter Positions
        </div>
        <div className="divide-base-content/10 divide-y space-y-2">
          {queries.flatMap(({ market, query }) =>
            query.positions.map(pos => (
              <TransmuterPositionRow
                key={`${market.alchemist}-${pos.id.toString()}`}
                market={market}
                position={pos}
                chainId={chainId}
                currentL1Block={solidityBlockNumber as bigint | undefined}
                debtPriceRaw={pricesRaw[market.debtToken.toLowerCase()] ?? 0n}
                underlyingPriceRaw={pricesRaw[market.underlying.toLowerCase()] ?? 0n}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
};

interface TransmuterPositionRowProps {
  market: AlchemixMarket;
  position: AlchemixTransmuterPosition;
  chainId: number;
  /** L1 block number (Solidity's block.number on Arbitrum) — see section header comment. */
  currentL1Block: bigint | undefined;
  /** alAsset (debt token) market USD price, 1e8 scaled. Lower than underlying when at peg discount. */
  debtPriceRaw: bigint;
  /** Underlying token USD price, 1e8 scaled — what the position redeems to 1:1 at maturity. */
  underlyingPriceRaw: bigint;
}

const TransmuterPositionRow: FC<TransmuterPositionRowProps> = ({
  market,
  position,
  chainId,
  currentL1Block,
  debtPriceRaw,
  underlyingPriceRaw,
}) => {
  // Maturation progress = (now − start) / (maturation − start), clamped to [0, 1].
  const progressPct = useMemo(() => {
    if (!currentL1Block) return null;
    const total = position.maturationBlock - position.startBlock;
    if (total <= 0n) return 100;
    const elapsed = currentL1Block > position.maturationBlock ? total : currentL1Block - position.startBlock;
    if (elapsed <= 0n) return 0;
    const ratio = Number((elapsed * 10000n) / total) / 100;
    return Math.min(100, Math.max(0, ratio));
  }, [currentL1Block, position.maturationBlock, position.startBlock]);

  const isMatured = currentL1Block !== undefined && currentL1Block >= position.maturationBlock;

  // APY estimate from peg-discount over the remaining maturity period.
  //   1 alAsset costs alAssetUsd today on market.
  //   1 alAsset redeems for 1 underlying (= underlyingUsd) at maturation.
  //   gainRatio = underlyingUsd / alAssetUsd  (≥ 1 when alAsset trades at a discount)
  //   apy = gainRatio^(yearSeconds / remainingSeconds) − 1
  // Returns null when we don't have enough data (matured / no prices / no discount).
  const apyPct = useMemo<number | null>(() => {
    if (isMatured || !currentL1Block) return null;
    const alPriceUsd = Number(debtPriceRaw) / 1e8;
    const underUsd = Number(underlyingPriceRaw) / 1e8;
    if (alPriceUsd <= 0 || underUsd <= 0 || alPriceUsd >= underUsd) return null;
    const blocksRemaining = position.maturationBlock - currentL1Block;
    if (blocksRemaining <= 0n) return null;
    const secondsRemaining = Number(blocksRemaining) * L1_SECONDS_PER_BLOCK;
    if (secondsRemaining <= 0) return null;
    const gainRatio = underUsd / alPriceUsd;
    const apy = Math.pow(gainRatio, SECONDS_PER_YEAR / secondsRemaining) - 1;
    return apy * 100;
  }, [isMatured, currentL1Block, debtPriceRaw, underlyingPriceRaw, position.maturationBlock]);

  // Subtitle: maturity progress, or APY-friendly hint when still maturing. Matured positions
  // are flagged with the green left border via `adlActive`, not a "ready" label (label was
  // misleading since matured doesn't mean *profitable* — claiming early can net a loss).
  const subtitle = useMemo(() => {
    if (progressPct === null) return null;
    if (isMatured) return "Matured";
    return `Maturing · ${progressPct.toFixed(1)}%`;
  }, [progressPct, isMatured]);

  const balanceUsd = useMemo(() => {
    if (debtPriceRaw <= 0n || position.amount <= 0n) return 0;
    return (Number(position.amount) / 10 ** market.debtDecimals) * (Number(debtPriceRaw) / 1e8);
  }, [position.amount, debtPriceRaw, market.debtDecimals]);

  return (
    <SupplyPosition
      icon={tokenNameToLogo(market.debtSymbol.toLowerCase())}
      name={market.debtSymbol}
      tokenSymbol={market.debtSymbol}
      balance={balanceUsd}
      tokenBalance={position.amount}
      // Estimated APY from peg-discount over remaining maturity. 0 when matured / no discount.
      currentRate={apyPct ?? 0}
      tokenAddress={market.debtToken}
      tokenDecimals={market.debtDecimals}
      tokenPrice={debtPriceRaw}
      protocolName={ALCHEMIX_GATEWAY_NAME}
      networkType="evm"
      chainId={chainId}
      // No claim/exit actions — transmuter writes aren't part of Kapan's gateway scope, so the
      // dropdown, expand chevron, and action buttons are all suppressed. Row reads as pure info.
      availableActions={{ deposit: false, withdraw: false, move: false, swap: false }}
      showInfoDropdown={false}
      showExpandIndicator={false}
      suppressDisabledMessage
      subtitle={subtitle ?? undefined}
      adlActive={isMatured}
    />
  );
};
