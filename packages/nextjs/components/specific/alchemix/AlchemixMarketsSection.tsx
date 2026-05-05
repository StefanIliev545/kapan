"use client";

import { FC, useCallback, useState } from "react";
import Image from "next/image";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { type AlchemixMarket, encodeAlchemixContext, getAlchemixMarkets } from "~~/utils/alchemix/markets";
import { ALCHEMIX_GATEWAY_NAME } from "~~/utils/alchemix/protocolConstants";
import { DepositModal } from "~~/components/modals/DepositModal";
import { useModal } from "~~/hooks/useModal";
import { useAlchemixVaultYields, type VaultYield } from "~~/hooks/useAlchemixVaultYields";

interface AlchemixMarketsSectionProps {
  chainId: number;
}

/**
 * The hard 90% LTV ceiling combined with a small safety buffer; matches the per-row Loop modal.
 * Used for "Max loop APY" preview: leverage = 1 / (1 − maxLtv) at the protocol cap.
 */
const MAX_LOOP_LTV_FRACTION = 0.89;

/**
 * Browse-and-supply UI for Alchemix V3 markets.
 *
 * Renders one card per registered market on the active chain. Each card surfaces:
 *   - underlying / debt token icons
 *   - 90% LTV (V3 design)
 *   - "self-repaying loans, no liquidation" pitch line
 *   - Supply button → opens DepositModal pre-wired with the alchemix protocol context.
 *
 * Loop (multiply) wiring is intentionally deferred — the existing MultiplyEvmModal needs
 * a few alchemix-specific glue points (mint allowance authorization, alAsset swap routing
 * through CoW chunking) before it can ship without footguns. Coming in a follow-up PR.
 */
export const AlchemixMarketsSection: FC<AlchemixMarketsSectionProps> = ({ chainId }) => {
  const markets = getAlchemixMarkets(chainId);
  const depositModal = useModal();
  const [selectedMarket, setSelectedMarket] = useState<AlchemixMarket | null>(null);

  // Pull the underlying Morpho V2 Vault APY for each MYT — same hook the position rows use,
  // tanstack-query dedupes the request so this is free.
  const { data: vaultYields } = useAlchemixVaultYields(chainId);

  const handleOpenSupply = useCallback(
    (market: AlchemixMarket) => {
      setSelectedMarket(market);
      depositModal.open();
    },
    [depositModal],
  );

  const handleCloseSupply = useCallback(() => {
    depositModal.close();
    setSelectedMarket(null);
  }, [depositModal]);

  if (markets.length === 0) {
    return (
      <div className="text-base-content/50 px-3 py-4 text-center text-xs">
        No Alchemix markets on this network.
      </div>
    );
  }

  return (
    <div className="card bg-base-200/40 border-base-300/50 border shadow-md">
      <div className="card-body p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {markets.map(m => (
            <MarketCard
              key={m.id}
              market={m}
              onSupply={handleOpenSupply}
              vaultYield={vaultYields?.[m.myt.toLowerCase()]}
            />
          ))}
        </div>
      </div>

      {selectedMarket && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={handleCloseSupply}
          token={{
            name: selectedMarket.underlyingSymbol,
            icon: tokenNameToLogo(selectedMarket.underlyingSymbol.toLowerCase()),
            address: selectedMarket.underlying,
            currentRate: 0,
            decimals: selectedMarket.underlyingDecimals,
          }}
          protocolName={ALCHEMIX_GATEWAY_NAME}
          chainId={chainId}
          // tokenId=0 → mints a fresh AlchemistV3Position NFT to the user on first deposit.
          context={encodeAlchemixContext(selectedMarket.marketId, 0n)}
        />
      )}
    </div>
  );
};

interface MarketCardProps {
  market: AlchemixMarket;
  onSupply: (market: AlchemixMarket) => void;
  vaultYield: VaultYield | undefined;
}

const MarketCard: FC<MarketCardProps> = ({ market, onSupply, vaultYield }) => {
  const handleSupplyClick = useCallback(() => onSupply(market), [market, onSupply]);

  const underlyingIcon = tokenNameToLogo(market.underlyingSymbol.toLowerCase());
  const debtIcon = tokenNameToLogo(market.debtSymbol.toLowerCase());

  // Underlying MYT yield (4 — 6% typical) and the max-loop APY at the protocol's 89% LTV cap.
  // For Alchemix's self-repaying loans, leveraged APY = vaultApy × leverage where leverage =
  // 1 / (1 − ltv); at 89% LTV that's ~9×.
  const baseApyPct = vaultYield?.netApyPct ?? 0;
  const maxLoopLeverage = 1 / (1 - MAX_LOOP_LTV_FRACTION);
  const maxLoopApyPct = baseApyPct * maxLoopLeverage;

  return (
    <div className="bg-base-100/40 border-base-300/40 rounded-lg border p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-2">
            <Image src={underlyingIcon} alt={market.underlyingSymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
            <Image src={debtIcon} alt={market.debtSymbol} width={24} height={24} className="ring-base-100 rounded-full ring-2" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{market.name}</span>
            <span className="text-base-content/50 text-[10px] uppercase tracking-wider">
              Borrow {market.debtSymbol} against {market.underlyingSymbol}
            </span>
          </div>
        </div>
      </div>

      <div className="text-base-content/60 mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Supply APY</div>
          <div className="text-success font-mono font-semibold tabular-nums">
            {baseApyPct > 0 ? `${baseApyPct.toFixed(2)}%` : "—"}
          </div>
        </div>
        <div>
          <div
            className="text-base-content/40 text-[10px] uppercase tracking-wider"
            title={`Estimated APY at ${(MAX_LOOP_LTV_FRACTION * 100).toFixed(0)}% LTV (≈ ${maxLoopLeverage.toFixed(1)}× leverage). Self-repaying — no borrow interest.`}
          >
            Max loop APY          </div>
          <div className="text-success font-mono font-semibold tabular-nums">
            {maxLoopApyPct > 0 ? `${maxLoopApyPct.toFixed(2)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Max LTV</div>
          <div className="font-mono tabular-nums">90%</div>
        </div>
        <div>
          <div className="text-base-content/40 text-[10px] uppercase tracking-wider">Liquidation</div>
          <div className="text-success font-medium">strategy-only</div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSupplyClick}
        className="btn btn-primary btn-sm w-full"
      >
        Supply {market.underlyingSymbol}
      </button>
    </div>
  );
};
