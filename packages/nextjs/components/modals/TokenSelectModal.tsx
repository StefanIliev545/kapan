import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { ProtocolPosition } from "../ProtocolView";
import { BorrowModal } from "./BorrowModal";
import { DepositModal } from "./DepositModal";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { formatUnits } from "viem";

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: ProtocolPosition[];
  protocolName: string;
  isBorrow?: boolean;
  position?: PositionManager;
  chainId?: number;
}

export const TokenSelectModal: FC<TokenSelectModalProps> = ({
  isOpen,
  onClose,
  tokens,
  protocolName,
  isBorrow = false,
  position,
  chainId,
}) => {
  const [selectedToken, setSelectedToken] = useState<ProtocolPosition | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
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
    () =>
      [...tokensWithBalances].sort((a, b) => {
        if (a.hasBalance !== b.hasBalance) return Number(b.hasBalance) - Number(a.hasBalance);
        return b.formattedBalance - a.formattedBalance;
      }),
    [tokensWithBalances],
  );
  // Handle token selection
  const handleSelectToken = (token: ProtocolPosition) => {
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

  return (
    <>
      <dialog className={`modal ${isOpen && !isTokenModalOpen ? "modal-open" : ""}`}>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleDone} />
        <div className="modal-box relative max-w-md p-4 rounded-xl bg-base-100 border border-base-300/50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-lg text-base-content">
              {isBorrow ? "Select Token to Borrow" : "Select Token to Supply"}
            </h3>
            <button
              className="p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
              onClick={handleDone}
            >
              ✕
            </button>
          </div>

          <div className="border border-base-300/50 rounded-lg divide-y divide-base-300/50 max-h-96 overflow-y-auto">
            {sortedTokens.length > 0 ? (
              sortedTokens.map(token => (
                <button
                  key={token.tokenAddress}
                  className="w-full flex items-center justify-between p-3 hover:bg-base-200/60 transition-colors cursor-pointer"
                  onClick={() => handleSelectToken(token)}
                >
                  <div className="flex items-center gap-3 text-left">
                    <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
                    <span className="text-sm font-medium text-base-content">{token.name}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <div className="text-xs text-base-content/50">
                      {formatPercentage(token.currentRate, 2, false)}% {isBorrow ? "APR" : "APY"}
                    </div>
                    <div className="text-xs text-base-content/70">
                      Balance: {token.balanceLabel}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-base-content/50">
                No tokens available to {isBorrow ? "borrow" : "supply"}
              </div>
            )}
          </div>
        </div>
      </dialog>

      {/* Render appropriate modal if a token is selected */}
      {selectedToken &&
        (isBorrow ? (
          <BorrowModal
            isOpen={isTokenModalOpen}
            onClose={handleModalClose}
            token={{
              name: selectedToken.name,
              icon: selectedToken.icon,
              currentRate: selectedToken.currentRate,
              address: selectedToken.tokenAddress,
              usdPrice: selectedToken.usdPrice ?? (selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0),
            }}
            protocolName={protocolName}
            chainId={chainId}
            currentDebt={
              selectedToken.tokenBalance
                ? Number(selectedToken.tokenBalance) / 10 ** (selectedToken.tokenDecimals || 18)
                : 0
            }
            position={position}
          />
        ) : (
          <DepositModal
            isOpen={isTokenModalOpen}
            onClose={handleModalClose}
            token={{
              name: selectedToken.name,
              icon: selectedToken.icon,
              currentRate: selectedToken.currentRate,
              address: selectedToken.tokenAddress,
              usdPrice: selectedToken.usdPrice ?? (selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0),
            }}
            protocolName={protocolName}
            position={position}
            chainId={chainId}
          />
        ))}
    </>
  );
};
