import { FC, useState } from "react";
import Image from "next/image";
import { DepositModal } from "./DepositModal";
import { BorrowModal } from "./BorrowModal";
import { ProtocolPosition } from "../ProtocolView";
import { PositionManager } from "~~/utils/position";

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: ProtocolPosition[];
  protocolName: string;
  isBorrow?: boolean;
  position?: PositionManager;
}

export const TokenSelectModal: FC<TokenSelectModalProps> = ({
  isOpen,
  onClose,
  tokens,
  protocolName,
  isBorrow = false,
  position,
}) => {
  const [selectedToken, setSelectedToken] = useState<ProtocolPosition | null>(null);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  // Handle token selection
  const handleSelectToken = (token: ProtocolPosition) => {
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
            <h3 className="font-bold text-xl tracking-tight">
              {isBorrow ? "Select a Token to Borrow" : "Select a Token to Supply"}
            </h3>
            <button 
              className="btn btn-sm btn-circle btn-ghost" 
              onClick={handleDone}
            >
              ✕
            </button>
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            {tokens.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {tokens.map((token, index) => (
                  <div 
                    key={token.tokenAddress} 
                    className={`token-fade bg-base-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 
                      ${hoveredToken === token.tokenAddress ? 'shadow-lg bg-base-300 scale-105 border-primary' : 'shadow-md hover:shadow-lg border-transparent'}
                      border transform hover:scale-105`}
                    onClick={() => handleSelectToken(token)}
                    onMouseEnter={() => handleTokenHover(token.tokenAddress)}
                    onMouseLeave={() => handleTokenHover(null)}
                    style={{ ['--stagger' as any]: `${index * 50}ms` }}
                  >
                    <div className="avatar mb-3">
                      <div className={`w-16 h-16 rounded-full bg-base-100 p-1 ring-2 
                        ${hoveredToken === token.tokenAddress ? 'ring-primary' : 'ring-base-300 dark:ring-base-content/20'}`}>
                        <Image 
                          src={token.icon} 
                          alt={token.name} 
                          width={64} 
                          height={64} 
                          className={`object-contain transition-transform duration-300 ${hoveredToken === token.tokenAddress ? 'scale-110' : ''}`}
                        />
                      </div>
                    </div>
                    <span className="font-bold text-lg mb-1">{token.name}</span>
                    <div className={`badge ${hoveredToken === token.tokenAddress ? 'badge-primary' : 'badge-outline'} p-3 font-medium`}>
                      {token.currentRate.toFixed(2)}% {isBorrow ? "APR" : "APY"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-base-content/70 bg-base-200/50 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12 mx-auto mb-4 opacity-50">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-lg">No tokens available to {isBorrow ? "borrow" : "supply"}</p>
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
            .token-fade {
              opacity: 0;
              animation-name: fadeIn;
              animation-duration: 0.3s;
              animation-timing-function: ease-in-out;
              animation-fill-mode: forwards;
              animation-delay: var(--stagger, 0ms);
            }
          `}</style>
        </div>
        <form method="dialog" className="modal-backdrop" onClick={handleDone}>
          <button>close</button>
        </form>
      </dialog>

      {/* Render appropriate modal if a token is selected */}
      {selectedToken && (
        isBorrow ? (
          <BorrowModal
            isOpen={isTokenModalOpen}
            onClose={handleModalClose}
            token={{
              name: selectedToken.name,
              icon: selectedToken.icon,
              currentRate: selectedToken.currentRate,
              address: selectedToken.tokenAddress,
              usdPrice: selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0,
            }}
            protocolName={protocolName}
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
              usdPrice: selectedToken.tokenPrice ? Number(selectedToken.tokenPrice) / 1e8 : 0,
            }}
            protocolName={protocolName}
            position={position}
          />
        )
      )}
    </>
  );
}; 