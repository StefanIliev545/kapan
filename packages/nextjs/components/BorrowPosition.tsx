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
import { FiChevronDown, FiChevronUp, FiInfo, FiMinus, FiPlus, FiRepeat, FiX, FiArrowRight } from "react-icons/fi";
import { SegmentedActionBar } from "./common/SegmentedActionBar";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { normalizeProtocolName } from "~~/utils/protocol";
import { isVesuContextV1, isVesuContextV2 } from "~~/utils/vesu";

// BorrowPositionProps extends ProtocolPosition but can add borrow-specific props
export type BorrowPositionProps = ProtocolPosition & {
  protocolName: string;
  networkType: "evm" | "starknet";
  position?: PositionManager;
  containerClassName?: string;
  hideBalanceColumn?: boolean;
  availableActions?: {
    borrow?: boolean;
    repay?: boolean;
    move?: boolean;
    close?: boolean;
    swap?: boolean;
  };
  afterInfoContent?: React.ReactNode;
  renderName?: (name: string) => React.ReactNode;
  onBorrow?: () => void;
  borrowCtaLabel?: string;
  showNoDebtLabel?: boolean;
  infoButton?: React.ReactNode;
  extraActions?: React.ReactNode;
  showInfoDropdown?: boolean;
  onClosePosition?: () => void;
  onSwap?: () => void;
  controlledExpanded?: boolean;
  onToggleExpanded?: () => void;
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
  position,
  vesuContext,
  moveSupport,
  actionsDisabled = false,
  actionsDisabledReason,
  containerClassName,
  hideBalanceColumn = false,
  availableActions,
  afterInfoContent,
  renderName,
  onBorrow,
  borrowCtaLabel,
  showNoDebtLabel = false,
  infoButton,
  extraActions,
  showInfoDropdown = false,
  onClosePosition,
  onSwap,
  controlledExpanded,
  onToggleExpanded,
}) => {
  const moveModal = useModal();
  const repayModal = useModal();
  const borrowModal = useModal();
  const expanded = useToggle();
  const isExpanded = controlledExpanded ?? expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  const debtAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;

  // Get wallet connection status for both networks
  const { evm, starknet } = useWalletConnection();
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;

  // Check if position has a balance (debt)
  const hasBalance =
    typeof tokenBalance === "bigint" ? tokenBalance > 0n : (tokenBalance ?? 0) > 0;

  const disabledMessage =
    actionsDisabledReason ||
    (networkType === "starknet"
      ? "Action unavailable for this market"
      : "Action unavailable");

  // Fetch optimal rate
  const { protocol: optimalProtocol, rate: optimalRateDisplay } = useOptimalRate({
    networkType,
    tokenAddress,
    type: "borrow",
  });

  const hasOptimalProtocol = Boolean(optimalProtocol);
  const displayedOptimalProtocol = hasOptimalProtocol ? optimalProtocol : protocolName;
  const displayedOptimalRate = hasOptimalProtocol ? optimalRateDisplay : currentRate;

  // Determine if there's a better rate available on another protocol
  const ratesAreSame = Math.abs(currentRate - optimalRateDisplay) < 0.000001;
  const hasBetterRate =
    hasBalance &&
    optimalProtocol &&
    !ratesAreSame &&
    normalizeProtocolName(optimalProtocol) !== normalizeProtocolName(protocolName) &&
    optimalRateDisplay < currentRate;

  const formatNumber = (num: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  const actionConfig = {
    borrow: availableActions?.borrow !== false,
    repay: availableActions?.repay !== false,
    move: availableActions?.move !== false,
    close: availableActions?.close !== false,
    swap: availableActions?.swap !== false,
  };

  const canInitiateBorrow =
    networkType === "evm" ? true : Boolean(vesuContext?.borrow || onBorrow);

  const showBorrowButton = actionConfig.borrow || (showNoDebtLabel && canInitiateBorrow);
  const showRepayButton = actionConfig.repay;
  const showMoveButton = actionConfig.move && hasBalance;
  const showCloseButton = Boolean(onClosePosition) && actionConfig.close && hasBalance;
  const showSwapButton = Boolean(onSwap) && actionConfig.swap && hasBalance;

  const visibleActionCount = [showRepayButton, showMoveButton, showBorrowButton, showCloseButton, showSwapButton].filter(Boolean).length;
  const hasAnyActions = visibleActionCount > 0;

  // Render actions in a single horizontal row for both mobile and desktop

  const handleBorrowClick = onBorrow ?? borrowModal.open;

  const borrowPoolId = (() => {
    if (!vesuContext?.borrow) return undefined;
    if (isVesuContextV1(vesuContext.borrow)) return vesuContext.borrow.poolId;
    if (isVesuContextV2(vesuContext.borrow)) return BigInt(vesuContext.borrow.poolAddress);
    return undefined;
  })();
  const repayPoolId = (() => {
    if (!vesuContext?.repay) return undefined;
    if (isVesuContextV1(vesuContext.repay)) return vesuContext.repay.poolId;
    if (isVesuContextV2(vesuContext.repay)) return BigInt(vesuContext.repay.poolAddress);
    return undefined;
  })();
  const movePoolId = borrowPoolId ?? repayPoolId;

  const moveFromProtocol: "Vesu" | "Nostra" | "VesuV2" = (() => {
    const normalized = protocolName.toLowerCase();
    if (normalized === "vesu") return "Vesu";
    if (normalized === "vesu_v2") return "VesuV2";
    if (normalized === "nostra") return "Nostra";
    return "Vesu";
  })();

  // Toggle expanded state
  const toggleExpanded = (e: React.MouseEvent) => {
    // Don't expand if clicking on the info button or its dropdown
    if ((e.target as HTMLElement).closest(".dropdown")) {
      return;
    }
    if (!hasAnyActions) {
      return;
    }
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      expanded.toggle();
    }
  };

  // Get the collateral view with isVisible prop
  const collateralViewWithVisibility = collateralView
    ? React.cloneElement(collateralView as React.ReactElement, {
        isVisible: isExpanded,
        initialShowAll: false,
      })
    : null;

  const defaultInfoButton = (
    <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
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
  );

  const infoButtonNode = infoButton ?? (showInfoDropdown ? defaultInfoButton : null);

  return (
    <>
      {/* Outer container - clickable to expand/collapse */}
      <div
        className={`w-full ${isExpanded && hasAnyActions ? "px-3 pt-3 pb-0" : "p-3"} rounded-md bg-base-200 ${
          hasAnyActions ? "cursor-pointer hover:bg-base-300/80" : "cursor-default"
        } transition-all duration-200 ${containerClassName ?? ""}`}
        onClick={toggleExpanded}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 relative">
          {/* Header: Icon and Title */}
          <div className="order-1 lg:order-none lg:col-span-3 flex items-center">
            <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
              <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
            </div>
            <div className="ml-2 flex items-center gap-1">
              {renderName ? (
                <>{renderName(name)}</>
              ) : (
                <span className="font-semibold text-lg truncate">{name}</span>
              )}
            </div>
            {infoButtonNode && (
              <div className="flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                {infoButtonNode}
              </div>
            )}

            {afterInfoContent && <div onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
          </div>

          {/* Stats: Rates */}
          <div
            className={`order-2 lg:order-none lg:col-span-6 grid gap-0 items-center min-w-[200px] ${
              hideBalanceColumn ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {!hideBalanceColumn && (
              <div className="px-2 border-r border-base-300">
                <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
                <div className="text-sm font-medium h-6 line-clamp-1">
                  {showNoDebtLabel ? (
                    <span className="text-base-content/70">No debt</span>
                  ) : (
                    <FiatBalance
                      tokenAddress={tokenAddress}
                      rawValue={
                        typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)
                      }
                      price={tokenPrice}
                      decimals={tokenDecimals}
                      tokenSymbol={name}
                      isNegative={true}
                      className="text-red-500"
                    />
                  )}
                </div>
              </div>
            )}
            <div className="px-2 border-r border-base-300">
              <div className="text-sm text-base-content/70 overflow-hidden h-6 flex items-center">APR</div>
              <div className="font-medium tabular-nums whitespace-nowrap text-ellipsis h-6 line-clamp-1">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            <div className="px-2">
              <div className="text-sm text-base-content/70 overflow-hidden h-6">Best APR</div>
              <div className="font-medium flex items-center h-6">
                <span className="tabular-nums whitespace-nowrap text-ellipsis min-w-0 line-clamp-1">
                  {formatPercentage(displayedOptimalRate)}%
                </span>
                <Image
                  src={getProtocolLogo(displayedOptimalProtocol)}
                  alt={displayedOptimalProtocol}
                  width={displayedOptimalProtocol == "vesu" ? 35 : 16}
                  height={displayedOptimalProtocol == "vesu" ? 35 : 16}
                  className={`flex-shrink-0 ${displayedOptimalProtocol == "vesu" ? "" : "rounded-md"} ml-1`}
                />
              </div>
            </div>
          </div>

          {/* Expand Indicator and quick Move action */}
          <div className="order-3 lg:order-none lg:col-span-3 flex items-center justify-end gap-2">
            {hasBetterRate && showMoveButton && (
              <button
                className="btn btn-xs btn-secondary animate-pulse"
                onClick={e => {
                  e.stopPropagation();
                  moveModal.open();
                }}
                disabled={!isWalletConnected || actionsDisabled}
                aria-label="Move"
                title={
                  !isWalletConnected
                    ? "Connect wallet to move debt"
                    : actionsDisabled
                      ? disabledMessage
                      : "Move debt to another protocol"
                }
              >
                Move
              </button>
            )}
            {hasAnyActions && (
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full ${
                  isExpanded ? "bg-primary/20" : "bg-base-300/50"
                } transition-colors duration-200`}
              >
                {isExpanded ? (
                  <FiChevronUp className="w-4 h-4 text-primary" />
                ) : (
                  <FiChevronDown className="w-4 h-4 text-base-content/70" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && hasAnyActions && (
          <div className="-mx-3 mt-0 pt-1 border-t border-base-300" onClick={e => e.stopPropagation()}>
            {/* Mobile layout - unified segmented bar (centered) */}
            <div className="md:hidden flex justify-center w-full pb-0">
              <SegmentedActionBar
                className="w-full"
                autoCompact
                actions={[
                ...(showRepayButton
                  ? [{ key: "repay", label: "Repay", icon: <FiMinus className="w-4 h-4" />, onClick: repayModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to repay" : actionsDisabled ? disabledMessage : "Repay debt", variant: "ghost" as const }]
                  : []),
                ...(showBorrowButton
                  ? [{ key: "borrow", label: borrowCtaLabel ?? "Borrow", icon: <FiPlus className="w-4 h-4" />, onClick: handleBorrowClick, disabled: !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to borrow" : actionsDisabled ? disabledMessage : "Borrow more tokens", variant: "ghost" as const }]
                  : []),
                ...(showSwapButton
                  ? [{ key: "swap", label: "Swap", icon: <FiRepeat className="w-4 h-4" />, onClick: onSwap!, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to switch debt" : actionsDisabled ? disabledMessage : "Switch debt token", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ...(showMoveButton
                  ? [{ key: "move", label: "Move", icon: <FiArrowRight className="w-4 h-4" />, onClick: moveModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move debt" : actionsDisabled ? disabledMessage : "Move debt to another protocol", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ...(showCloseButton
                  ? [{ key: "close", label: "Close", icon: <FiX className="w-4 h-4" />, onClick: onClosePosition!, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to close position" : actionsDisabled ? disabledMessage : "Close position with collateral", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ]}
              />
            </div>

            {/* Desktop layout - unified segmented bar (centered) */}
            <div className="hidden md:flex justify-center w-full pb-0">
              <SegmentedActionBar
                className="w-full"
                autoCompact
                actions={[
                ...(showRepayButton
                  ? [{ key: "repay", label: "Repay", icon: <FiMinus className="w-4 h-4" />, onClick: repayModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to repay" : actionsDisabled ? disabledMessage : "Repay debt", variant: "ghost" as const }]
                  : []),
                ...(showBorrowButton
                  ? [{ key: "borrow", label: borrowCtaLabel ?? "Borrow", icon: <FiPlus className="w-4 h-4" />, onClick: handleBorrowClick, disabled: !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to borrow" : actionsDisabled ? disabledMessage : "Borrow more tokens", variant: "ghost" as const }]
                  : []),
                ...(showSwapButton
                  ? [{ key: "swap", label: "Swap", icon: <FiRepeat className="w-4 h-4" />, onClick: onSwap!, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to switch debt" : actionsDisabled ? disabledMessage : "Switch debt token", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ...(showMoveButton
                  ? [{ key: "move", label: "Move", icon: <FiArrowRight className="w-4 h-4" />, onClick: moveModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move debt" : actionsDisabled ? disabledMessage : "Move debt to another protocol", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ...(showCloseButton
                  ? [{ key: "close", label: "Close", icon: <FiX className="w-4 h-4" />, onClick: onClosePosition!, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to close position" : actionsDisabled ? disabledMessage : "Close position with collateral", variant: "ghost" as const, compactOnHover: true }]
                  : []),
                ]}
              />
            </div>

            {actionsDisabled && (
              <div className="mt-3 text-sm text-base-content/70">
                {disabledMessage}
              </div>
            )}

            {extraActions && <div className="mt-3">{extraActions}</div>}
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
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            currentDebt={debtAmount}
            position={position}
            vesuContext={vesuContext?.borrow}
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
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            debtBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
            position={position}
            vesuContext={vesuContext?.repay}
          />
          <MovePositionModalStark
            isOpen={moveModal.isOpen}
            onClose={moveModal.close}
            fromProtocol={moveFromProtocol}
            position={{
              name,
              balance: tokenBalance ?? 0n,
              type: "borrow",
              tokenAddress,
              decimals: tokenDecimals ?? 18,
              poolId: movePoolId,
            }}
            preSelectedCollaterals={moveSupport?.preselectedCollaterals}
            disableCollateralSelection={moveSupport?.disableCollateralSelection}
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
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            currentDebt={debtAmount}
            position={position}
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
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            debtBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
            position={position}
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
