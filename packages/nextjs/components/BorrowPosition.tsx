import React, { FC, useState } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { MovePositionModal } from "./modals/MovePositionModal";
import { RepayModal } from "./modals/RepayModal";
import { BorrowModal } from "./modals/BorrowModal";
import { FiInfo, FiChevronDown, FiChevronUp, FiPlus, FiMinus, FiRepeat } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { ProtocolPosition } from "./ProtocolView";

// BorrowPositionProps extends ProtocolPosition but can add borrow-specific props
export type BorrowPositionProps = ProtocolPosition & {
  protocolName: string;
};

export const BorrowPosition: FC<BorrowPositionProps> = ({
  icon,
  name,
  balance,
  tokenBalance,
  currentRate,
  protocolName,
  tokenAddress,
  collateralView,
  collateralValue,
}) => {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [isCollateralVisible, setIsCollateralVisible] = useState(false);

  // Get wallet connection status
  const { address: userAddress } = useAccount();
  const isWalletConnected = !!userAddress;

  // Check if position has a balance (debt)
  const hasBalance = tokenBalance > 0;

  // Fetch optimal rate from the OptimalInterestRateFinder contract
  const { data: optimalRateData } = useScaffoldReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: "findOptimalBorrowRate",
    args: [tokenAddress],
  });

  let optimalProtocol = "";
  let optimalRateDisplay = 0;
  if (optimalRateData) {
    const [proto, rate] = optimalRateData;
    optimalProtocol = proto;
    optimalRateDisplay = Number(rate) / 1e8;
  }

  const formatNumber = (num: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);
  
  const handleOpenBorrowModal = () => {
    setIsBorrowModalOpen(true);
  };
  
  const handleCloseBorrowModal = () => {
    setIsBorrowModalOpen(false);
  };

  // Toggle collateral visibility
  const toggleCollateralVisibility = () => {
    setIsCollateralVisible(prev => !prev);
  };

  // Get the collateral view with isVisible prop
  const collateralViewWithVisibility = collateralView 
    ? React.cloneElement(collateralView as React.ReactElement, { isVisible: isCollateralVisible })
    : null;

  return (
    <>
      {/* Outer container uses grid that becomes a single column on mobile */}
      <div className="w-full p-1 pl-2 pr-2 rounded-md bg-base-200 grid grid-cols-1 lg:grid-cols-7">
        {/* Header: Icon and Title */}
        <div className="order-1 lg:order-none lg:col-span-2 flex items-center">
          <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
            <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
          </div>
          <span className="ml-2 font-semibold text-lg truncate">{name}</span>
          <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0 ml-1">
            <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
              <FiInfo 
                className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors"
                aria-hidden="true"
              />
            </div>
            <div
              tabIndex={0}
              className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
              style={{
                right: "auto",
                transform: "translateX(-50%)",
                left: "50%",
                borderRadius: "4px",
              }}
            >
              <div className="card-body p-3">
                <h3 className="card-title text-sm">{name} Details</h3>
                <div className="text-xs space-y-1">
                  <p className="text-base-content/70">Contract Address:</p>
                  <p className="font-mono break-all">{tokenAddress}</p>
                  <p className="text-base-content/70">Protocol:</p>
                  <p>{protocolName}</p>
                  <p className="text-base-content/70">Type:</p>
                  <p className="capitalize">Borrow Position</p>
                  {collateralValue && (
                    <>
                      <p className="text-base-content/70">Collateral Value:</p>
                      <p>${formatNumber(collateralValue)}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats: Rates */}
        <div className="order-2 lg:order-none lg:col-span-3 grid grid-cols-3 gap-0 items-center">
          <div className="px-2 border-r border-base-300">
            <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
            <div className="text-sm font-medium h-6 line-clamp-1 text-red-500">
              -${formatNumber(Math.abs(balance))}
            </div>
          </div>
          <div className="px-2 border-r border-base-300">
            <div className="text-sm text-base-content/70 overflow-hidden h-6 flex items-center">
              APR
            </div>
            <div className="font-medium tabular-nums whitespace-nowrap text-ellipsis h-6 line-clamp-1">
              {currentRate.toFixed(2)}%
            </div>
          </div>
          <div className="px-2">
            <div className="text-sm text-base-content/70 overflow-hidden h-6">Best APR</div>
            <div className="font-medium flex items-center h-6">
              <span className="tabular-nums whitespace-nowrap text-ellipsis min-w-0 line-clamp-1">
                {optimalRateDisplay.toFixed(2)}%
              </span>
              <Image
                src={getProtocolLogo(optimalProtocol)}
                alt={optimalProtocol}
                width={16}
                height={16}
                className="flex-shrink-0 rounded-full ml-1"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="order-3 lg:order-none lg:col-span-2 flex items-center justify-end gap-1">
          <button 
            className="btn btn-sm btn-primary" 
            onClick={() => setIsRepayModalOpen(true)} 
            disabled={!hasBalance || !isWalletConnected}
            aria-label="Repay"
            title={!isWalletConnected ? "Connect wallet to repay" : "Repay debt"}
          >
            <FiMinus className="w-4 h-4 md:hidden" />
            <span className="hidden md:inline">Repay</span>
          </button>
            
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setIsMoveModalOpen(true)}
            disabled={!hasBalance || !isWalletConnected}
            aria-label="Move"
            title={!isWalletConnected ? "Connect wallet to move debt" : "Move debt to another protocol"}
          >
            <FiRepeat className="w-4 h-4 md:hidden" />
            <span className="hidden md:inline">Move</span>
          </button>
            
          <button
            className="btn btn-sm btn-primary"
            onClick={handleOpenBorrowModal}
            disabled={!isWalletConnected}
            aria-label="Borrow"
            title={!isWalletConnected ? "Connect wallet to borrow" : "Borrow more tokens"}
          >
            <FiPlus className="w-4 h-4 md:hidden" />
            <span className="hidden md:inline">Borrow</span>
          </button>
            
          {collateralView && (
            <button 
              className={`btn btn-sm btn-circle h-9 w-9 btn-ghost ${!isWalletConnected ? 'btn-disabled' : ''}`}
              onClick={toggleCollateralVisibility}
              title={!isWalletConnected ? "Connect wallet to view collateral" : "Toggle collateral view"}
            >
              {isCollateralVisible ? (
                <FiChevronUp className="w-4 h-4 text-base-content/70" />
              ) : (
                <FiChevronDown className="w-4 h-4 text-base-content/70" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Collateral View (if provided) */}
      {collateralView && (
        <div className={`overflow-hidden transition-all duration-300 ${isCollateralVisible ? 'max-h-[500px]' : 'max-h-0'}`}>
          <div className="py-2">
            {collateralViewWithVisibility}
          </div>
        </div>
      )}

      {/* Modals */}
      <MovePositionModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        fromProtocol={protocolName}
        position={{
          name,
          balance,
          type: "borrow",
          tokenAddress,
        }}
      />

      <RepayModal
        isOpen={isRepayModalOpen}
        onClose={() => setIsRepayModalOpen(false)}
        token={{ name, icon, currentRate, address: tokenAddress }}
        protocolName={protocolName}
      />
      
      <BorrowModal
        isOpen={isBorrowModalOpen}
        onClose={handleCloseBorrowModal}
        token={{ name, icon, currentRate, address: tokenAddress }}
        protocolName={protocolName}
      />
    </>
  );
}; 