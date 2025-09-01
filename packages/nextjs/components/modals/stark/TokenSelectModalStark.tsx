import { FC, useState } from "react";
import Image from "next/image";
import { BorrowModalStark } from "./BorrowModalStark";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { VesuContext } from "~~/hooks/useLendingAction";
import { TokenMetadata } from "~~/utils/protocols";
import { feltToString } from "~~/utils/protocols";
import { PositionManager } from "~~/utils/position";

interface TokenSelectModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenMetadata[];
  protocolName: string;
  collateralAsset?: string;
  isVesu?: boolean;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const TokenSelectModalStark: FC<TokenSelectModalStarkProps> = ({
  isOpen,
  onClose,
  tokens,
  protocolName,
  collateralAsset,
  isVesu = false,
  vesuContext,
  position,
}) => {
  const [selectedToken, setSelectedToken] = useState<TokenMetadata | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  // Filter out the collateral asset from available tokens if provided
  const availableTokens = tokens.filter(
    asset => !collateralAsset || `0x${BigInt(asset.address).toString(16).padStart(64, "0")}` !== collateralAsset,
  );

  // Handle token selection
  const handleSelectToken = (token: TokenMetadata) => {
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
        <div className="modal-box max-w-4xl bg-base-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-xl tracking-tight">Select a Token to Borrow</h3>
            <button className="btn btn-sm btn-circle btn-ghost" onClick={handleDone}>
              ✕
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-2">
            {availableTokens.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {availableTokens.map((token, index) => {
                  const address = `0x${BigInt(token.address).toString(16).padStart(64, "0")}`;
                  const symbol = feltToString(token.symbol);
                  return (
                    <div
                      key={address}
                      className={`bg-base-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 
                        ${hoveredToken === address ? "shadow-lg bg-base-300 scale-105 border-primary" : "shadow-md hover:shadow-lg border-transparent"}
                        border transform hover:scale-105`}
                      onClick={() => handleSelectToken(token)}
                      onMouseEnter={() => handleTokenHover(address)}
                      onMouseLeave={() => handleTokenHover(null)}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animation: "fadeIn 0.3s ease-in-out forwards",
                        opacity: 0,
                      }}
                    >
                      <div className="avatar mb-3">
                        <div
                          className={`w-16 h-16 rounded-full bg-base-100 p-1 ring-2 
                          ${hoveredToken === address ? "ring-primary" : "ring-base-300 dark:ring-base-content/20"}`}
                        >
                          <Image
                            src={tokenNameToLogo(symbol.toLowerCase())}
                            alt={symbol}
                            width={64}
                            height={64}
                            className={`object-contain transition-transform duration-300 ${hoveredToken === address ? "scale-110" : ""}`}
                          />
                        </div>
                      </div>
                      <span className="font-bold text-lg mb-1">{symbol}</span>
                      <div
                        className={`badge ${hoveredToken === address ? "badge-primary" : "badge-outline"} p-3 font-medium`}
                      >
                        {token.borrowAPR ? (token.borrowAPR * 100).toFixed(2) : "0.00"}% APR
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-base-content/70 bg-base-200/50 rounded-xl">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  className="w-12 h-12 mx-auto mb-4 opacity-50"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-lg">No tokens available to borrow</p>
              </div>
            )}
          </div>

          <style jsx global>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={handleDone}>
          <button>close</button>
        </form>
      </dialog>

      {/* Render borrow modal if a token is selected */}
      {selectedToken && (
        <BorrowModalStark
          isOpen={isTokenModalOpen}
          onClose={handleModalClose}
          token={{
            name: feltToString(selectedToken.symbol),
            icon: tokenNameToLogo(feltToString(selectedToken.symbol).toLowerCase()),
            address: `0x${BigInt(selectedToken.address).toString(16).padStart(64, "0")}`,
            currentRate: selectedToken.borrowAPR ? selectedToken.borrowAPR * 100 : 0,
            usdPrice:
              selectedToken.price && selectedToken.price.is_valid ? Number(selectedToken.price.value) / 1e18 : 0,
          }}
          protocolName={protocolName}
          currentDebt={
            selectedToken.total_nominal_debt
              ? Number(selectedToken.total_nominal_debt) / 10 ** selectedToken.decimals
              : 0
          }
          vesuContext={vesuContext}
          position={position}
        />
      )}
    </>
  );
};
