import { FC, useMemo } from "react";
import { BorrowModalStark } from "./BorrowModalStark";
import { DepositModalStark } from "./DepositModalStark";
import {
  TokenListItem,
  TokenListContainer,
  TokenSelectModalShell,
} from "../common/TokenListItem";
import { useTokenSelectModal } from "../common/useTokenSelectModal";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import type { VesuContext } from "~~/utils/vesu";
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

/**
 * Helper to normalize Starknet addresses to padded hex format.
 */
function normalizeStarkAddress(address: string | bigint): string {
  return `0x${BigInt(address).toString(16).padStart(64, "0")}`;
}

/**
 * Helper to get token symbol with fallback for tokens like xSTRK.
 */
function getTokenSymbol(token: TokenMetadata, address: string): string {
  const raw = feltToString(token.symbol);
  return raw && raw.trim().length > 0 ? raw : getTokenNameFallback(address) ?? raw;
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
  const {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
  } = useTokenSelectModal<TokenWithRates>({
    onClose,
    onSelectToken,
    suppressActionModals,
  });

  const starkTokens = useMemo(
    () =>
      tokens.map(asset => ({
        address: normalizeStarkAddress(asset.address) as `0x${string}`,
        decimals: asset.decimals,
      })),
    [tokens],
  );
  const { balances } = useWalletTokenBalances({ tokens: starkTokens, network: "starknet" });

  // Filter out the collateral asset from available tokens if provided
  const availableTokens = useMemo(
    () =>
      tokens.filter(
        asset => !collateralAsset || normalizeStarkAddress(asset.address) !== collateralAsset,
      ),
    [tokens, collateralAsset],
  );

  const sortedTokens = useMemo(() => {
    const withBalances = availableTokens.map(token => {
      const address = normalizeStarkAddress(token.address);
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
  const emptyMessage = `No tokens available to ${action === "borrow" ? "borrow" : "deposit"}`;

  // Compute selected token display values with fallback (needed for tokens like xSTRK)
  const selectedAddress = selectedToken ? normalizeStarkAddress(selectedToken.address) : "";
  const selectedSymbol = selectedToken ? getTokenSymbol(selectedToken, selectedAddress) : "";

  return (
    <>
      <TokenSelectModalShell
        isOpen={isOpen}
        isActionModalOpen={isActionModalOpen}
        onClose={handleDone}
        title={modalTitle}
      >
        <TokenListContainer isEmpty={sortedTokens.length === 0} emptyMessage={emptyMessage}>
          {sortedTokens.map(({ token, address, balanceLabel }) => {
            const symbol = getTokenSymbol(token, address);
            const rate = getDisplayRate(
              protocolName,
              action === "borrow" ? token.borrowAPR ?? 0 : token.supplyAPY ?? 0,
            );
            return (
              <TokenListItem
                key={address}
                name={symbol}
                icon={tokenNameToLogo(symbol.toLowerCase())}
                rate={rate}
                rateLabel={rateLabel}
                balanceLabel={balanceLabel}
                onClick={() => handleSelectToken(token)}
              />
            );
          })}
        </TokenListContainer>
      </TokenSelectModalShell>

      {/* Render borrow modal if a token is selected */}
      {!suppressActionModals && selectedToken && action === "borrow" && (
        <BorrowModalStark
          isOpen={isActionModalOpen}
          onClose={handleActionModalClose}
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
          isOpen={isActionModalOpen}
          onClose={handleActionModalClose}
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
