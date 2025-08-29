import React, { FC } from "react";
import Image from "next/image";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { BorrowModal } from "./modals/BorrowModal";
import { MovePositionModal } from "./modals/MovePositionModal";
import { RepayModal } from "./modals/RepayModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { MovePositionModal as MovePositionModalStark } from "./modals/stark/MovePositionModal";
import { RepayModalStark } from "./modals/stark/RepayModalStark";
import { FiChevronDown, FiChevronUp, FiInfo, FiMinus, FiPlus, FiRepeat } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";

// BorrowPositionProps extends ProtocolPosition but can add borrow-specific props
export type BorrowPositionProps = ProtocolPosition & {
  protocolName: string;
  networkType: "evm" | "starknet";
};

export const BorrowPosition: FC<BorrowPositionProps> = ({
  icon,
  name,
  balance,
  tokenBalance,
  currentRate,
  protocolName,
  tokenAddress,
  tokenPrice,
  tokenDecimals,
  tokenSymbol,
  collateralView,
  collateralValue,
  networkType,
}) => {
  const moveModal = useModal();
  const repayModal = useModal();
  const borrowModal = useModal();
  const expanded = useToggle();
  const isExpanded = expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;

  // Get wallet connection status for both networks
  const { evm, starknet } = useWalletConnection();
  const address = networkType === "evm" ? evm.address : starknet.address;
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;

  // Check if position has a balance (debt)
  const hasBalance = tokenBalance > 0;

  // Fetch optimal rate
  const { protocol: optimalProtocol, rate: optimalRateDisplay } = useOptimalRate({
    networkType,
    tokenAddress,
    type: "borrow",
  });

  const formatNumber = (num: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  // Toggle expanded state
  const toggleExpanded = (e: React.MouseEvent) => {
    // Don't expand if clicking on the info button or its dropdown
    if ((e.target as HTMLElement).closest(".dropdown")) {
      return;
    }
    expanded.toggle();
  };

  // Get the collateral view with isVisible prop
  const collateralViewWithVisibility = collateralView
    ? React.cloneElement(collateralView as React.ReactElement, {
        isVisible: isExpanded,
        initialShowAll: false,
      })
    : null;

  return (
    <>
      {/* Outer container - clickable to expand/collapse */}
      <div
        className={`w-full p-3 rounded-md ${isExpanded ? "bg-base-300" : "bg-base-200"} cursor-pointer transition-all duration-200 hover:bg-primary/10 hover:shadow-md`}
        onClick={toggleExpanded}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 relative">
          {/* Header: Icon and Title */}
          <div className="order-1 lg:order-none lg:col-span-3 flex items-center">
            <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
              <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
            </div>
            <span className="ml-2 font-semibold text-lg truncate">{name}</span>
            <div
              className="dropdown dropdown-end dropdown-bottom flex-shrink-0 ml-1"
              onClick={e => e.stopPropagation()}
            >
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
                        <p>
                          <FiatBalance
                            tokenAddress={tokenAddress}
                            rawValue={BigInt(Math.round(collateralValue * 10 ** 8))}
                            price={BigInt(10 ** 8)}
                            decimals={8}
                            tokenSymbol={name}
                            isNegative={false}
                          />
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats: Rates */}
          <div className="order-2 lg:order-none lg:col-span-6 grid grid-cols-3 gap-0 items-center min-w-[200px]">
            <div className="px-2 border-r border-base-300">
              <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
              <div className="text-sm font-medium h-6 line-clamp-1">
                <FiatBalance
                  tokenAddress={tokenAddress}
                  rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
                  price={tokenPrice}
                  decimals={tokenDecimals}
                  tokenSymbol={name}
                  isNegative={true}
                  className="text-red-500"
                />
              </div>
            </div>
            <div className="px-2 border-r border-base-300">
              <div className="text-sm text-base-content/70 overflow-hidden h-6 flex items-center">APR</div>
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
                  width={optimalProtocol == "vesu" ? 35 : 16}
                  height={optimalProtocol == "vesu" ? 35 : 16}
                  className={`flex-shrink-0 ${optimalProtocol == "vesu" ? "" : "rounded-md"} ml-1`}
                />
              </div>
            </div>
          </div>

          {/* Expand Indicator */}
          <div className="order-3 lg:order-none lg:col-span-3 flex items-center justify-end">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full ${isExpanded ? "bg-primary/20" : "bg-base-300/50"} transition-colors duration-200`}
            >
              {isExpanded ? (
                <FiChevronUp className="w-4 h-4 text-primary" />
              ) : (
                <FiChevronDown className="w-4 h-4 text-base-content/70" />
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-base-300" onClick={e => e.stopPropagation()}>
            {/* Mobile layout - full width buttons stacked vertically */}
            <div className="flex flex-col gap-2 md:hidden">
              <button
                className="btn btn-sm btn-primary w-full flex justify-center items-center"
                onClick={repayModal.open}
                disabled={!hasBalance || !isWalletConnected}
                aria-label="Repay"
                title={!isWalletConnected ? "Connect wallet to repay" : "Repay debt"}
              >
                <div className="flex items-center justify-center">
                  <FiMinus className="w-4 h-4 mr-1" />
                  <span>Repay</span>
                </div>
              </button>

              <button
                className="btn btn-sm btn-outline w-full flex justify-center items-center"
                onClick={moveModal.open}
                disabled={!hasBalance || !isWalletConnected}
                aria-label="Move"
                title={!isWalletConnected ? "Connect wallet to move debt" : "Move debt to another protocol"}
              >
                <div className="flex items-center justify-center">
                  <FiRepeat className="w-4 h-4 mr-1" />
                  <span>Move</span>
                </div>
              </button>

              <button
                className="btn btn-sm btn-primary w-full flex justify-center items-center"
                onClick={borrowModal.open}
                disabled={!isWalletConnected}
                aria-label="Borrow"
                title={!isWalletConnected ? "Connect wallet to borrow" : "Borrow more tokens"}
              >
                <div className="flex items-center justify-center">
                  <FiPlus className="w-4 h-4 mr-1" />
                  <span>Borrow</span>
                </div>
              </button>
            </div>

            {/* Desktop layout - evenly distributed buttons in a row */}
            <div className="hidden md:grid grid-cols-3 gap-3">
              <button
                className="btn btn-sm btn-primary flex justify-center items-center"
                onClick={repayModal.open}
                disabled={!hasBalance || !isWalletConnected}
                aria-label="Repay"
                title={!isWalletConnected ? "Connect wallet to repay" : "Repay debt"}
              >
                <div className="flex items-center justify-center">
                  <FiMinus className="w-4 h-4 mr-1" />
                  <span>Repay</span>
                </div>
              </button>

              <button
                className="btn btn-sm btn-outline flex justify-center items-center"
                onClick={moveModal.open}
                disabled={!hasBalance || !isWalletConnected}
                aria-label="Move"
                title={!isWalletConnected ? "Connect wallet to move debt" : "Move debt to another protocol"}
              >
                <div className="flex items-center justify-center">
                  <FiRepeat className="w-4 h-4 mr-1" />
                  <span>Move</span>
                </div>
              </button>

              <button
                className="btn btn-sm btn-primary flex justify-center items-center"
                onClick={borrowModal.open}
                disabled={!isWalletConnected}
                aria-label="Borrow"
                title={!isWalletConnected ? "Connect wallet to borrow" : "Borrow more tokens"}
              >
                <div className="flex items-center justify-center">
                  <FiPlus className="w-4 h-4 mr-1" />
                  <span>Borrow</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collateral View (if provided) - Only visible when expanded */}
      {collateralView && isExpanded && (
        <div className="overflow-hidden transition-all duration-300 mt-2">
          <div className="py-2">{collateralViewWithVisibility}</div>
        </div>
      )}

      {/* Modals */}
      {networkType === "starknet" ? (
        <>
          <BorrowModalStark
            isOpen={borrowModal.isOpen}
            onClose={borrowModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
            }}
            protocolName={protocolName}
          />
          <RepayModalStark
            isOpen={repayModal.isOpen}
            onClose={repayModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
            }}
            protocolName={protocolName}
          />
          <MovePositionModalStark
            isOpen={moveModal.isOpen}
            onClose={moveModal.close}
            fromProtocol={protocolName}
            position={{
              name,
              balance: tokenBalance ?? 0n,
              type: "borrow",
              tokenAddress,
              decimals: tokenDecimals ?? 18,
            }}
          />
        </>
      ) : (
        <>
          <BorrowModal
            isOpen={borrowModal.isOpen}
            onClose={borrowModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
            }}
            protocolName={protocolName}
          />
          <RepayModal
            isOpen={repayModal.isOpen}
            onClose={repayModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
            }}
            protocolName={protocolName}
          />
          <MovePositionModal
            isOpen={moveModal.isOpen}
            onClose={moveModal.close}
            fromProtocol={protocolName}
            position={{
              name,
              balance: balance ? balance : 0,
              type: "borrow",
              tokenAddress,
              decimals: tokenDecimals || 18,
            }}
          />
        </>
      )}
    </>
  );
};
