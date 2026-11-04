"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { WalletHoldingsList, WalletTokenGroup, formatWalletValue, hasWalletValue } from "./WalletHoldingsList";
import { ChevronDownIcon, InformationCircleIcon, WalletIcon } from "@heroicons/react/24/outline";
import { LoadingSpinner } from "~~/components/common/Loading";
import { useTxCompletedListenerDelayed } from "~~/hooks/common/useTxCompletedListener";
import { type WalletToken, useWalletTokens } from "~~/hooks/useWalletTokens";
import { useGlobalState } from "~~/services/store/store";
import { is1inchSupported } from "~~/utils/chainFeatures";

const WalletSwapModal = dynamic(
  () => import("~~/components/modals/WalletSwapModal").then(module => module.WalletSwapModal),
  { ssr: false },
);
const BridgeModal = dynamic(() => import("~~/components/modals/BridgeModal").then(module => module.BridgeModal), {
  ssr: false,
});
const BRIDGEABLE_CHAINS = new Set([1, 42161, 8453, 10, 59144]);

interface WalletSectionProps {
  chainId?: number;
  defaultExpanded?: boolean;
}

export function WalletSection({ chainId, defaultExpanded = false }: WalletSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const {
    tokens,
    isLoading,
    isError,
    isDiscoveryIncomplete = isError,
    refetch,
    unresolvedHoldings = [],
    visibilityScope = String(chainId ?? 1),
    valuationAvailable = true,
  } = useWalletTokens(chainId);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const identity = (address: string) => `${visibilityScope}:${address.toLowerCase()}`;
  const availableTokens = tokens.filter(token => !hidden.has(identity(token.address)));
  const isShown = (token: WalletToken) => token.source !== "indexed" || shown.has(identity(token.address));
  const mainTokens = availableTokens.filter(isShown);
  const otherTokens = availableTokens.filter(token => !isShown(token));
  const unresolved = unresolvedHoldings.filter(holding => !hidden.has(identity(holding.address)));
  const otherHoldings = [...otherTokens, ...unresolved];
  const hiddenHoldings = [...tokens, ...unresolvedHoldings].filter(holding => hidden.has(identity(holding.address)));
  const valuedTokens = mainTokens.filter(hasWalletValue);
  const shownValue = valuedTokens.reduce((sum, token) => sum + token.usdValue, 0);
  const unpricedCount = mainTokens.length - valuedTokens.length;
  const hasHoldings = tokens.length + unresolvedHoldings.length > 0;
  const failedEmpty = isError && !hasHoldings;
  const hasLoadFailure = isDiscoveryIncomplete || failedEmpty;
  const isFiltered = otherHoldings.length > 0 || hiddenHoldings.length > 0;
  const isPartialValue = isError || isDiscoveryIncomplete || unpricedCount > 0 || !valuationAvailable;
  const valueLabel = isFiltered ? "Shown value" : isPartialValue ? "Known value" : "Balance";
  const hasSubtotal = valuedTokens.length > 0 || (!hasHoldings && !hasLoadFailure && valuationAvailable);
  const valueText = isLoading || !hasSubtotal ? "—" : formatWalletValue(shownValue);
  const effectiveChainId = chainId ?? 1;

  const [swapToken, setSwapToken] = useState<WalletToken | null>(null);
  const [bridgeToken, setBridgeToken] = useState<WalletToken | null>(null);
  useEffect(() => {
    setSwapToken(null);
    setBridgeToken(null);
  }, [visibilityScope]);

  const changeVisibility = (address: string, hide: boolean) => {
    setHidden(previous => {
      const next = new Set(previous);
      if (hide) {
        next.add(identity(address));
      } else {
        next.delete(identity(address));
      }
      return next;
    });
    setSwapToken(null);
    setBridgeToken(null);
  };
  const showInWallet = (address: string) => {
    setShown(previous => new Set([...previous, identity(address)]));
  };

  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);
  useEffect(() => {
    if (isLoading || isError || !valuationAvailable) {
      return;
    }
    setProtocolTotals("Wallet", shownValue, 0);
  }, [isLoading, isError, valuationAvailable, shownValue, setProtocolTotals, chainId]);

  useTxCompletedListenerDelayed(
    useCallback(() => {
      refetch();
    }, [refetch]),
    2000,
  );

  const listActions = {
    canSwap: is1inchSupported(effectiveChainId),
    canBridge: BRIDGEABLE_CHAINS.has(effectiveChainId),
    onSwap: setSwapToken,
    onBridge: setBridgeToken,
    onVisibilityChange: changeVisibility,
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-base-content/10 bg-base-200/20" aria-label="Wallet">
        <button
          type="button"
          aria-label="Toggle wallet holdings"
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <WalletIcon className="size-5 shrink-0 text-base-content/50" />
          <span className="flex-1 text-base font-semibold">Wallet</span>
          <span className="text-right">
            <span className="block text-xs text-base-content/50">{valueLabel}</span>
            <span className="text-lg font-medium tabular-nums">{valueText}</span>
          </span>
          <ChevronDownIcon
            className={`ml-2 size-4 text-base-content/50 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
          />
        </button>

        {hasLoadFailure && (
          <div
            role="status"
            className="flex items-center gap-2 border-t border-base-content/5 px-4 py-2 text-xs text-base-content/60 sm:px-5"
          >
            <InformationCircleIcon className="size-4 shrink-0" />
            <span className="flex-1">
              {hasHoldings
                ? "Some holdings couldn't be loaded. Showing available balances."
                : "Couldn't load your wallet holdings."}
            </span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => refetch()} disabled={isLoading}>
              Retry
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="border-t border-base-content/10">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="sm" />
              </div>
            ) : !hasHoldings ? (
              <p className="px-5 py-6 text-sm text-base-content/50">
                {hasLoadFailure ? "Holdings will appear when the connection recovers." : "No tokens found in wallet"}
              </p>
            ) : (
              <>
                {mainTokens.length > 0 ? (
                  <WalletHoldingsList key={visibilityScope} holdings={mainTokens} {...listActions} />
                ) : (
                  <p className="px-4 py-5 text-sm text-base-content/50 sm:px-5">
                    {otherHoldings.length > 0
                      ? "Your discovered tokens are in Other tokens below."
                      : "All tokens are hidden."}
                  </p>
                )}
                {unpricedCount > 0 && (
                  <p className="px-4 pb-3 text-xs text-base-content/50 sm:px-5">
                    {unpricedCount} {unpricedCount === 1 ? "token has" : "tokens have"} no current price. Known balances
                    are still shown.
                  </p>
                )}
                {otherHoldings.length > 0 && (
                  <WalletTokenGroup key={`other:${visibilityScope}`} label={`Other tokens (${otherHoldings.length})`}>
                    <p className="px-4 pb-3 text-xs text-base-content/50 sm:px-5">
                      Unverified tokens may include spam. They are excluded from the shown value. Use token details to
                      show a holding in your wallet.
                    </p>
                    <WalletHoldingsList holdings={otherHoldings} {...listActions} onShow={showInWallet} />
                  </WalletTokenGroup>
                )}
                {hiddenHoldings.length > 0 && (
                  <WalletTokenGroup
                    key={`hidden:${visibilityScope}`}
                    label={`Hidden tokens (${hiddenHoldings.length})`}
                  >
                    <WalletHoldingsList holdings={hiddenHoldings} {...listActions} hidden />
                  </WalletTokenGroup>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {swapToken && (
        <WalletSwapModal
          isOpen
          onClose={() => setSwapToken(null)}
          chainId={effectiveChainId}
          fromToken={swapToken}
          walletTokens={availableTokens}
          onSuccess={refetch}
        />
      )}
      {bridgeToken && (
        <BridgeModal
          isOpen
          onClose={() => setBridgeToken(null)}
          chainId={effectiveChainId}
          fromToken={bridgeToken.address}
        />
      )}
    </>
  );
}

export default WalletSection;
