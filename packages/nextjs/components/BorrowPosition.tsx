import React, { FC, useMemo } from "react";
import Image from "next/image";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { BorrowModal } from "./modals/BorrowModal";
import { RefinanceModal } from "./modals/RefinanceModal";
import { RepayModal } from "./modals/RepayModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { MovePositionModal as MovePositionModalStark } from "./modals/stark/MovePositionModal";
import { RepayModalStark } from "./modals/stark/RepayModalStark";
import { CloseWithCollateralEvmModal } from "./modals/CloseWithCollateralEvmModal";
import { DebtSwapEvmModal } from "./modals/DebtSwapEvmModal";
import { SwapAsset } from "./modals/SwapModalShell";
import { Address } from "viem";
import { FiChevronDown, FiChevronUp, FiInfo, FiMinus, FiPlus, FiRepeat, FiX, FiArrowRight } from "react-icons/fi";
import { SegmentedActionBar } from "./common/SegmentedActionBar";
import { getProtocolLogo as getProtocolLogoUtil } from "~~/utils/protocol";
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
  chainId?: number;
  position?: PositionManager;
  availableAssets?: Array<{
    symbol: string;
    address: string;
    decimals: number;
    rawBalance: bigint;
    balance: number;
    icon: string;
    usdValue?: number;
    price?: bigint;
  }>;
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
  suppressDisabledMessage?: boolean;
  demoOptimalOverride?: { protocol: string; rate: number };
  defaultExpanded?: boolean;
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
  usdPrice: usdPriceOverride,
  tokenDecimals,
  collateralView,
  collateralValue,
  networkType,
  chainId,
  position,
  availableAssets: availableAssetsList,
  vesuContext,
  protocolContext,
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
  suppressDisabledMessage = false,
  demoOptimalOverride,
  defaultExpanded = false,
}) => {
  const moveModal = useModal();
  const repayModal = useModal();
  const borrowModal = useModal();
  const closeWithCollateralModal = useModal();
  const debtSwapModal = useModal();
  const expanded = useToggle(defaultExpanded);
  const isExpanded = controlledExpanded ?? expanded.isOpen;

  const usdPrice = useMemo(() => {
    if (typeof usdPriceOverride === "number") return usdPriceOverride;
    return tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  }, [tokenPrice, usdPriceOverride]);
  const debtAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;

  // Stable position object for RefinanceModal (avoid hook re-ordering; defined at top-level)
  const tokenBalanceBn = useMemo(
    () => (typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)),
    [tokenBalance],
  );
  const refiPosition = useMemo(
    () => ({
      name,
      tokenAddress,
      decimals: tokenDecimals || 18,
      balance: tokenBalanceBn,
      type: "borrow" as const,
    }),
    [name, tokenAddress, tokenDecimals, tokenBalanceBn],
  );

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
  const displayedOptimalProtocol = (typeof demoOptimalOverride !== "undefined" && demoOptimalOverride?.protocol)
    ? demoOptimalOverride.protocol
    : (hasOptimalProtocol ? optimalProtocol : protocolName);
  const displayedOptimalRate = (typeof demoOptimalOverride !== "undefined" && typeof demoOptimalOverride?.rate === "number")
    ? demoOptimalOverride.rate
    : (hasOptimalProtocol ? optimalRateDisplay : currentRate);

  // Determine if there's a better rate available on another protocol
  const ratesAreSame = Math.abs(currentRate - displayedOptimalRate) < 0.000001;
  const hasBetterRate =
    hasBalance &&
    displayedOptimalProtocol &&
    !ratesAreSame &&
    normalizeProtocolName(displayedOptimalProtocol) !== normalizeProtocolName(protocolName) &&
    displayedOptimalRate < currentRate;

  // const formatNumber = (num: number) =>
  //   new Intl.NumberFormat("en-US", {
  //     minimumFractionDigits: 2,
  //     maximumFractionDigits: 2,
  //   }).format(Math.abs(num));

  // Use shared protocol logo resolver to support keys like "vesu_v2"
  const getProtocolLogo = (protocol: string) => getProtocolLogoUtil(protocol);

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
  // Enable buttons if either external handler exists OR we can open local modal (EVM)
  const showCloseButton =
    (networkType === "evm" ? true : Boolean(onClosePosition)) && actionConfig.close && hasBalance;
  const showSwapButton =
    (networkType === "evm" ? true : Boolean(onSwap)) && actionConfig.swap && hasBalance;

  const visibleActionCount = [showRepayButton, showMoveButton, showBorrowButton, showCloseButton, showSwapButton].filter(Boolean).length;
  const hasAnyActions = visibleActionCount > 0;

  // Render actions in a single horizontal row for both mobile and desktop

  const handleBorrowClick = onBorrow ?? borrowModal.open;
  // For EVM, always open local modals to avoid state lifting issues
  const handleCloseClick = networkType === "evm" ? closeWithCollateralModal.open : (onClosePosition ?? (() => { return; }));
  const handleSwapClick = networkType === "evm" ? debtSwapModal.open : (onSwap ?? (() => { return; }));

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
      {/* Container */}
      <div
        className={`w-full ${isExpanded && hasAnyActions ? "px-4 sm:px-5 pt-4 pb-0" : "p-4 sm:p-5"} rounded-xl bg-base-200/30 border border-base-300/40 ${hasAnyActions ? "cursor-pointer hover:bg-base-200/50" : "cursor-default"
          } transition-colors duration-200 ${containerClassName ?? ""}`}
        onClick={toggleExpanded}
      >
        {/* Mobile Layout (< lg) - single row, spread out */}
        <div className="lg:hidden flex items-center gap-2 sm:gap-3">
          {/* Token icon + name */}
          <div className="flex items-center gap-1.5 flex-shrink-0" title={name}>
            <div className="w-7 h-7 relative rounded-lg bg-gradient-to-br from-base-200 to-base-300/50 p-0.5 ring-1 ring-base-300/50 flex-shrink-0">
              <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded object-contain" />
            </div>
            <span className="font-bold text-sm tracking-tight leading-none">
              {renderName ? renderName(name) : name}
            </span>
            {infoButtonNode && (
              <div className="flex-shrink-0 hidden sm:block" onClick={e => e.stopPropagation()}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div className="hidden sm:block" onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
          </div>
          
          {/* Stats - spread out across available space */}
          <div className="flex-1 flex items-center justify-around min-w-0">
            {!hideBalanceColumn && (
              <div className="flex flex-col items-center text-center">
                <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">Bal</div>
                <div className="text-[11px] font-mono font-semibold tabular-nums">
                  {showNoDebtLabel ? (
                    <span className="text-base-content/50">—</span>
                  ) : (
                    <FiatBalance
                      tokenAddress={tokenAddress}
                      rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
                      price={tokenPrice}
                      decimals={tokenDecimals}
                      tokenSymbol={name}
                      isNegative={true}
                      className="text-error"
                    />
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col items-center text-center">
              <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">APR</div>
              <div className="text-[11px] font-mono font-semibold tabular-nums text-base-content">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            {/* Best APR - hidden on very narrow screens */}
            <div className="hidden min-[400px]:flex flex-col items-center text-center">
              <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">Best</div>
              <div className="flex items-center gap-0.5">
                <span className="text-[11px] font-mono font-semibold tabular-nums text-success">
                  {formatPercentage(displayedOptimalRate)}%
                </span>
                <div className="w-3 h-3 relative flex-shrink-0">
                  <Image
                    src={getProtocolLogo(displayedOptimalProtocol)}
                    alt={displayedOptimalProtocol}
                    fill
                    className="object-contain rounded"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Move badge + expand indicator */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasBetterRate && showMoveButton && (
              <button
                className="px-1.5 py-0.5 text-[7px] uppercase tracking-wider font-semibold rounded bg-secondary/20 text-secondary hover:bg-secondary/30 transition-colors animate-pulse"
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
                className={`flex items-center justify-center w-5 h-5 rounded-md ${isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                  } transition-all duration-200`}
              >
                {isExpanded ? (
                  <FiChevronUp className="w-3 h-3 text-primary" />
                ) : (
                  <FiChevronDown className="w-3 h-3 text-base-content/50" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Layout (>= lg) */}
        <div className="hidden lg:grid lg:grid-cols-12 relative gap-0">
          {/* Token */}
          <div className="lg:col-span-3 flex items-center">
            <div className="w-10 h-10 relative min-w-[40px] min-h-[40px] rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-1.5 ring-1 ring-base-300/50">
              <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-lg object-contain" />
            </div>
            <div className="ml-3 flex items-center gap-1.5">
              {renderName ? (
                <>{renderName(name)}</>
              ) : (
                <span className="font-bold text-base text-base-content">{name}</span>
              )}
            </div>
            {infoButtonNode && (
              <div className="flex-shrink-0 ml-1.5" onClick={e => e.stopPropagation()}>
                {infoButtonNode}
              </div>
            )}
            {afterInfoContent && <div onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
          </div>

          {/* Stats: Rates */}
          <div
            className={`lg:col-span-8 grid gap-0 items-center min-w-[200px] ${hideBalanceColumn ? "grid-cols-2" : "grid-cols-3"
              }`}
          >
            {!hideBalanceColumn && (
              <div className="px-3 border-r border-base-300/50">
                <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Balance</div>
                <div className="text-sm font-mono font-semibold tabular-nums">
                  {showNoDebtLabel ? (
                    <span className="text-base-content/50">No debt</span>
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
                      className="text-error"
                    />
                  )}
                </div>
              </div>
            )}
            <div className="px-3 border-r border-base-300/50">
              <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">APR</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-base-content">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            <div className="px-3">
              <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Best APR</div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono font-semibold tabular-nums text-success">
                  {formatPercentage(displayedOptimalRate)}%
                </span>
                <div className="w-4 h-4 relative flex-shrink-0">
                  <Image
                    src={getProtocolLogo(displayedOptimalProtocol)}
                    alt={displayedOptimalProtocol}
                    fill
                    className="object-contain rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Expand Indicator and quick Move action */}
          <div className="lg:col-span-1 flex items-center justify-end gap-2">
            {hasBetterRate && showMoveButton && (
              <button
                className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-md bg-secondary/20 text-secondary hover:bg-secondary/30 transition-colors animate-pulse"
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
                className={`flex items-center justify-center w-6 h-6 rounded-lg ${isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                  } transition-all duration-200`}
              >
                {isExpanded ? (
                  <FiChevronUp className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <FiChevronDown className="w-3.5 h-3.5 text-base-content/50" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && hasAnyActions && (
          <div className="-mx-4 mt-3 pt-2 border-t border-base-300/50" onClick={e => e.stopPropagation()}>
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
                    ? [{ key: "swap", label: "Swap", icon: <FiRepeat className="w-4 h-4" />, onClick: handleSwapClick, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to switch debt" : actionsDisabled ? disabledMessage : "Switch debt token", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showMoveButton
                    ? [{ key: "move", label: "Move", icon: <FiArrowRight className="w-4 h-4" />, onClick: moveModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move debt" : actionsDisabled ? disabledMessage : "Move debt to another protocol", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showCloseButton
                    ? [{ key: "close", label: "Close", icon: <FiX className="w-4 h-4" />, onClick: handleCloseClick, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to close position" : actionsDisabled ? disabledMessage : "Close position with collateral", variant: "ghost" as const, compactOnHover: true }]
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
                    ? [{ key: "swap", label: "Swap", icon: <FiRepeat className="w-4 h-4" />, onClick: handleSwapClick, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to switch debt" : actionsDisabled ? disabledMessage : "Switch debt token", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showMoveButton
                    ? [{ key: "move", label: "Move", icon: <FiArrowRight className="w-4 h-4" />, onClick: moveModal.open, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move debt" : actionsDisabled ? disabledMessage : "Move debt to another protocol", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showCloseButton
                    ? [{ key: "close", label: "Close", icon: <FiX className="w-4 h-4" />, onClick: handleCloseClick, disabled: !hasBalance || !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to close position" : actionsDisabled ? disabledMessage : "Close position with collateral", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                ]}
              />
            </div>

            {actionsDisabled && !suppressDisabledMessage && (
              <div className="mt-3 text-sm text-base-content/50">
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
          {moveModal.isOpen && (
            <RefinanceModal
              isOpen={moveModal.isOpen}
              onClose={moveModal.close}
              fromProtocol={moveFromProtocol}
              position={{
                name,
                tokenAddress,
                decimals: tokenDecimals ?? 18,
                balance: tokenBalance ?? 0n,
                poolId: movePoolId,
                type: "borrow",
              }}
              networkType="starknet"
              preSelectedCollaterals={moveSupport?.preselectedCollaterals}
              disableCollateralSelection={moveSupport?.disableCollateralSelection}
            />
          )}
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
            chainId={chainId}
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
            chainId={chainId}
            context={protocolContext}
          />
          {moveModal.isOpen && (
            <RefinanceModal
              isOpen={moveModal.isOpen}
              onClose={moveModal.close}
              fromProtocol={protocolName}
              position={refiPosition}
              chainId={chainId}
              networkType="evm"
            />
          )}
          <CloseWithCollateralEvmModal
            isOpen={closeWithCollateralModal.isOpen}
            onClose={closeWithCollateralModal.close}
            protocolName={protocolName}
            chainId={chainId || 1}
            debtToken={tokenAddress as Address}
            debtName={name}
            debtIcon={icon}
            debtDecimals={tokenDecimals || 18}
            debtPrice={tokenPrice}
            debtBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
            availableCollaterals={availableAssetsList as SwapAsset[]}
            market={
              protocolName.toLowerCase().includes("compound") ? (tokenAddress as Address) : undefined
            }
          />
          <DebtSwapEvmModal
            isOpen={debtSwapModal.isOpen}
            onClose={debtSwapModal.close}
            protocolName={protocolName}
            chainId={chainId || 1}
            debtFromToken={tokenAddress as Address}
            currentDebtBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
            debtFromName={name}
            debtFromIcon={icon}
            debtFromDecimals={tokenDecimals || 18}
            debtFromPrice={tokenPrice}
            availableAssets={availableAssetsList as SwapAsset[]}
            market={
              protocolName.toLowerCase().includes("compound") ? (tokenAddress as Address) : undefined
            }
          />
        </>
      )}
    </>
  );
};
