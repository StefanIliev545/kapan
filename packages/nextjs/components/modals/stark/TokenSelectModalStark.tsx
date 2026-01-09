import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { BorrowModalStark } from "./BorrowModalStark";
import { DepositModalStark } from "./DepositModalStark";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import type { VesuContext } from "~~/utils/vesu";
import formatPercentage from "~~/utils/formatPercentage";
import { getDisplayRate } from "~~/utils/protocol";
import { PositionManager } from "~~/utils/position";
import { TokenMetadata } from "~~/utils/protocols";
import { feltToString } from "~~/utils/protocols";
import { formatTokenAmount } from "~~/utils/protocols";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { sortByBalance } from "~~/utils/tokenSymbols";

export type TokenWithRates = TokenMetadata & {
  borrowAPR: number;
  supplyAPY: number;
};

interface TokenSelectModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenWithRates[];
  protocolName: string;
  collateralAsset?: string;
  vesuContext?: VesuContext;
  position?: PositionManager;
  action?: "borrow" | "deposit";
  onSelectToken?: (token: TokenWithRates) => void;
  suppressActionModals?: boolean;
}

export const TokenSelectModalStark: FC<TokenSelectModalStarkProps> = ({
  isOpen,
  onClose,
  tokens,
  protocolName,
  collateralAsset,
  vesuContext,
  position,
  action = "borrow",
  onSelectToken,
  suppressActionModals = false,
}) => {
  const [selectedToken, setSelectedToken] = useState<TokenWithRates | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const starkTokens = useMemo(
    () =>
      tokens.map(asset => ({
        address: `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` as `0x${string}`,
        decimals: asset.decimals,
      })),
    [tokens],
  );
  const { balances } = useWalletTokenBalances({ tokens: starkTokens, network: "starknet" });

  // Filter out the collateral asset from available tokens if provided
  const availableTokens = useMemo(
    () =>
      tokens.filter(
        asset => !collateralAsset || `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` !== collateralAsset,
      ),
    [tokens, collateralAsset],
  );

  const sortedTokens = useMemo(() => {
    const withBalances = availableTokens.map(token => {
      const address = `0x${BigInt(token.address).toString(16).padStart(64, "0")}`;
      const balanceInfo = balances[address.toLowerCase()];
      const balance = balanceInfo?.balance ?? 0n;
      const displayBalance = parseFloat(formatTokenAmount(balance.toString(), token.decimals));

      return {
        token,
        address,
        hasBalance: balance > 0n,
        formattedBalance: displayBalance,
        balanceLabel: formatTokenAmount(balance.toString(), token.decimals),
      };
    });

    return withBalances.sort(sortByBalance);
  }, [availableTokens, balances]);

  const modalTitle = action === "borrow" ? "Select a Token to Borrow" : "Select a Token to Deposit";

  const rateLabel = action === "borrow" ? "APR" : "APY";

  // Handle token selection
  const handleSelectToken = (token: TokenWithRates) => {
    if (suppressActionModals && onSelectToken) {
      onSelectToken(token);
      onClose();
      return;
    }
    setSelectedToken(token);
    setIsTokenModalOpen(true);
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsTokenModalOpen(false);
    // Don't close the token select modal yet to allow selecting another token
  };

  // Handle final close when done
  const handleDone = () => {
    onClose();
  };

  // Resolve selected token display values with fallback (needed for tokens like xSTRK)
  const selectedAddress = selectedToken
    ? `0x${BigInt(selectedToken.address).toString(16).padStart(64, "0")}`
    : "";
  const selectedRawSymbol = selectedToken ? feltToString(selectedToken.symbol) : "";
  const selectedSymbol = selectedToken
    ? (selectedRawSymbol && selectedRawSymbol.trim().length > 0
      ? selectedRawSymbol
      : getTokenNameFallback(selectedAddress) ?? selectedRawSymbol)
    : "";

  return (
    <>
      <dialog className={`modal ${isOpen && !isTokenModalOpen ? "modal-open" : ""}`}>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleDone} />
        <div className="modal-box relative max-w-md p-4 rounded-xl bg-base-100 border border-base-300/50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-lg text-base-content">{modalTitle}</h3>
            <button
              className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
              onClick={handleDone}
            >
              ✕
            </button>
          </div>

          <div className="border border-base-300/50 rounded-lg divide-y divide-base-300/50 max-h-96 overflow-y-auto">
            {sortedTokens.length > 0 ? (
              sortedTokens.map(({ token, address, balanceLabel }) => {
                const raw = feltToString(token.symbol);
                const symbol = raw && raw.trim().length > 0 ? raw : getTokenNameFallback(address) ?? raw;
                return (
                  <button
                    key={address}
                    className="w-full flex items-center justify-between p-3 hover:bg-base-200/60 transition-colors cursor-pointer"
                    onClick={() => handleSelectToken(token)}
                  >
                    <div className="flex items-center gap-3">
                      <Image src={tokenNameToLogo(symbol.toLowerCase())} alt={symbol} width={24} height={24} className="rounded-full" />
                      <span className="text-sm font-medium text-base-content">{symbol}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <div className="text-xs text-base-content/50">
                        {formatPercentage(
                          getDisplayRate(protocolName, action === "borrow" ? token.borrowAPR ?? 0 : token.supplyAPY ?? 0),
                        )}% {rateLabel}
                      </div>
                      <div className="text-xs text-base-content/70">Balance: {balanceLabel}</div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-sm text-base-content/50">No tokens available to {action === "borrow" ? "borrow" : "deposit"}</div>
            )}
          </div>
        </div>
      </dialog>

      {/* Render borrow modal if a token is selected */}
      {!suppressActionModals && selectedToken && action === "borrow" && (
        // For VesuV2, enrich context with collateral metadata when available (needed for vToken migration)
        // We do not mutate the original context; we pass an adjusted copy to the modal
        // eslint-disable-next-line react/jsx-no-useless-fragment
        <BorrowModalStark
          isOpen={isTokenModalOpen}
          onClose={handleModalClose}
          token={{
            name: selectedSymbol,
            icon: tokenNameToLogo(selectedSymbol.toLowerCase()),
            address: selectedAddress,
            currentRate: selectedToken.borrowAPR ?? 0,
            usdPrice:
              selectedToken.price && selectedToken.price.is_valid
                ? Number(selectedToken.price.value) / 1e18
                : 0,
          }}
          protocolName={protocolName}
          currentDebt={0}
          vesuContext={
            protocolName === "vesu_v2" && vesuContext
              ? { ...(vesuContext as any), collateralToken: collateralAsset, isVtoken: true }
              : vesuContext
          }
          position={position}
        />
      )}

      {!suppressActionModals && selectedToken && action === "deposit" && (
        <DepositModalStark
          isOpen={isTokenModalOpen}
          onClose={handleModalClose}
          token={{
            name: selectedSymbol,
            icon: tokenNameToLogo(selectedSymbol.toLowerCase()),
            address: selectedAddress,
            currentRate: selectedToken.supplyAPY ?? 0,
            usdPrice:
              selectedToken.price && selectedToken.price.is_valid
                ? Number(selectedToken.price.value) / 1e18
                : 0,
          }}
          protocolName={protocolName}
          vesuContext={vesuContext}
          position={position}
        />
      )}
    </>
  );
};
