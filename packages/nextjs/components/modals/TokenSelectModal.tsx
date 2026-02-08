import { FC, useMemo, useCallback } from "react";
import { ProtocolPosition } from "../ProtocolView";
import { BorrowModal } from "./BorrowModal";
import { DepositModal } from "./DepositModal";
import {
  TokenListItem,
  TokenListContainer,
  TokenSelectModalShell,
} from "./common/TokenListItem";
import { useTokenSelectModal } from "./common/useTokenSelectModal";
import { buildModalTokenInfo } from "./common/modalUtils";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { PositionManager } from "~~/utils/position";
import { formatUnits } from "viem";
import { sortByBalance } from "~~/utils/tokenSymbols";

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: ProtocolPosition[];
  protocolName: string;
  isBorrow?: boolean;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Compound market address) passed through to DepositModal/BorrowModal */
  context?: string;
  /** Custom modal title (overrides default "Select Token to Supply/Borrow") */
  title?: string;
  /** When provided, fires callback with the selected token instead of opening the default Deposit/Borrow modal.
   *  Useful for custom flows like DepositAndBorrowModal where the parent controls the next modal. */
  onTokenSelected?: (token: ProtocolPosition) => void;
}

export const TokenSelectModal: FC<TokenSelectModalProps> = ({
  isOpen,
  onClose,
  tokens,
  protocolName,
  isBorrow = false,
  position,
  chainId,
  context,
  title: customTitle,
  onTokenSelected,
}) => {
  const {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
  } = useTokenSelectModal<ProtocolPosition>({
    onClose,
    onSelectToken: onTokenSelected,
    suppressActionModals: !!onTokenSelected,
  });

  const { balances } = useWalletTokenBalances({
    tokens: tokens.map(token => ({ address: token.tokenAddress, decimals: token.tokenDecimals })),
    network: "evm",
    chainId,
  });

  const tokensWithBalances = useMemo(
    () =>
      tokens.map(token => {
        const key = token.tokenAddress.toLowerCase();
        const balanceInfo = balances[key];
        const decimals = balanceInfo?.decimals ?? token.tokenDecimals ?? 18;
        const rawBalance = balanceInfo?.balance ?? 0n;
        const balance = Number(formatUnits(rawBalance, decimals));

        return {
          ...token,
          formattedBalance: balance,
          hasBalance: rawBalance > 0n,
          balanceLabel: balance.toLocaleString("en-US", {
            maximumFractionDigits: 6,
          }),
        };
      }),
    [balances, tokens],
  );

  const sortedTokens = useMemo(
    () => [...tokensWithBalances].sort(sortByBalance),
    [tokensWithBalances],
  );

  // Factory for token click handlers
  const createTokenClickHandler = useCallback(
    (token: ProtocolPosition) => () => handleSelectToken(token),
    [handleSelectToken],
  );

  const modalTitle = customTitle ?? (isBorrow ? "Select Token to Borrow" : "Select Token to Supply");
  const rateLabel = isBorrow ? "APR" : "APY";
  const emptyMessage = `No tokens available to ${isBorrow ? "borrow" : "supply"}`;

  // Build token info for the action modal
  const selectedTokenInfo = selectedToken
    ? buildModalTokenInfo({
        name: selectedToken.name,
        icon: selectedToken.icon,
        tokenAddress: selectedToken.tokenAddress,
        currentRate: selectedToken.currentRate,
        usdPrice:
          selectedToken.usdPrice ??
          (selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0),
        tokenDecimals: selectedToken.tokenDecimals,
      })
    : null;

  const currentDebt = selectedToken?.tokenBalance
    ? Number(selectedToken.tokenBalance) / 10 ** (selectedToken.tokenDecimals || 18)
    : 0;

  return (
    <>
      <TokenSelectModalShell
        isOpen={isOpen}
        isActionModalOpen={isActionModalOpen}
        onClose={handleDone}
        title={modalTitle}
      >
        <TokenListContainer isEmpty={sortedTokens.length === 0} emptyMessage={emptyMessage}>
          {sortedTokens.map(token => (
            <TokenListItem
              key={token.tokenAddress}
              name={token.name}
              icon={token.icon}
              rate={token.currentRate}
              rateLabel={rateLabel}
              rateDecimals={2}
              rateIsRaw={false}
              balanceLabel={token.balanceLabel}
              onClick={createTokenClickHandler(token)}
            />
          ))}
        </TokenListContainer>
      </TokenSelectModalShell>

      {/* Render appropriate modal if a token is selected */}
      {selectedTokenInfo &&
        (isBorrow ? (
          <BorrowModal
            isOpen={isActionModalOpen}
            onClose={handleActionModalClose}
            token={selectedTokenInfo}
            protocolName={protocolName}
            chainId={chainId}
            currentDebt={currentDebt}
            position={position}
          />
        ) : (
          <DepositModal
            isOpen={isActionModalOpen}
            onClose={handleActionModalClose}
            token={selectedTokenInfo}
            protocolName={protocolName}
            position={position}
            chainId={chainId}
            context={context}
          />
        ))}
    </>
  );
};
