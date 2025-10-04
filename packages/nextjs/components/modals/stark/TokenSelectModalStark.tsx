import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { BorrowModalStark } from "./BorrowModalStark";
import { DepositModalStark } from "./DepositModalStark";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import type { VesuContext } from "~~/utils/vesu";
import formatPercentage from "~~/utils/formatPercentage";
import { getDisplayRate } from "~~/utils/protocol";
import { PositionManager } from "~~/utils/position";
import { TokenMetadata } from "~~/utils/protocols";
import { feltToString } from "~~/utils/protocols";

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
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  // Filter out the collateral asset from available tokens if provided
  const availableTokens = useMemo(
    () =>
      tokens.filter(
        asset => !collateralAsset || `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` !== collateralAsset,
      ),
    [tokens, collateralAsset],
  );

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

  // Handle token hover
  const handleTokenHover = (tokenAddress: string | null) => {
    setHoveredToken(tokenAddress);
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
        <div className="modal-box max-w-md p-4 rounded-none">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-xl">{modalTitle}</h3>
            <button className="btn btn-sm btn-ghost" onClick={handleDone}>Close</button>
          </div>

          <div className="border border-base-300 divide-y divide-base-300 max-h-96 overflow-y-auto">
            {availableTokens.length > 0 ? (
              availableTokens.map(token => {
                const address = `0x${BigInt(token.address).toString(16).padStart(64, "0")}`;
                const symbol = feltToString(token.symbol);
                return (
                  <button
                    key={address}
                    className="w-full flex items-center justify-between p-3 hover:bg-base-200/60"
                    onClick={() => handleSelectToken(token)}
                    onMouseEnter={() => handleTokenHover(address)}
                    onMouseLeave={() => handleTokenHover(null)}
                  >
                    <div className="flex items-center gap-2">
                      <Image src={tokenNameToLogo(symbol.toLowerCase())} alt={symbol} width={16} height={16} className="w-4 h-4" />
                      <span className="text-sm font-medium">{symbol}</span>
                    </div>
                    <div className="text-[11px] text-base-content/60">
                      {formatPercentage(
                        getDisplayRate(protocolName, action === "borrow" ? token.borrowAPR ?? 0 : token.supplyAPY ?? 0),
                      )}% {rateLabel}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-sm text-base-content/70">No tokens available to {action === "borrow" ? "borrow" : "deposit"}</div>
            )}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={handleDone}>
          <button>close</button>
        </form>
      </dialog>

      {/* Render borrow modal if a token is selected */}
      {!suppressActionModals && selectedToken && action === "borrow" && (
        <BorrowModalStark
          isOpen={isTokenModalOpen}
          onClose={handleModalClose}
          token={{
            name: feltToString(selectedToken.symbol),
            icon: tokenNameToLogo(feltToString(selectedToken.symbol).toLowerCase()),
            address: `0x${BigInt(selectedToken.address).toString(16).padStart(64, "0")}`,
            currentRate: selectedToken.borrowAPR ?? 0,
            usdPrice:
              selectedToken.price && selectedToken.price.is_valid
              ? Number(selectedToken.price.value) / 1e18
              : 0,
            }}
          protocolName={protocolName}
          currentDebt={0}
          vesuContext={vesuContext}
          position={position}
        />
      )}

      {!suppressActionModals && selectedToken && action === "deposit" && (
        <DepositModalStark
          isOpen={isTokenModalOpen}
          onClose={handleModalClose}
          token={{
            name: feltToString(selectedToken.symbol),
            icon: tokenNameToLogo(feltToString(selectedToken.symbol).toLowerCase()),
            address: `0x${BigInt(selectedToken.address).toString(16).padStart(64, "0")}`,
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
