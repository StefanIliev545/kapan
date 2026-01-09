import React, { FC, useMemo } from "react";
import { Address, encodeAbiParameters } from "viem";
import { MinusIcon, PlusIcon, ArrowPathIcon, XMarkIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { BorrowModal } from "./modals/BorrowModal";
import { RefinanceModal } from "./modals/RefinanceModal";
import { RepayModal } from "./modals/RepayModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { RepayModalStark } from "./modals/stark/RepayModalStark";
import { CloseWithCollateralEvmModal } from "./modals/CloseWithCollateralEvmModal";
import { DebtSwapEvmModal } from "./modals/DebtSwapEvmModal";
import { SwapAsset } from "./modals/SwapModalShell";
import { BasePosition, usePositionState } from "./common/BasePosition";
import { SegmentedAction } from "./common/SegmentedActionBar";
import { useModal } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
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

  const usdPrice = useMemo(() => {
    if (typeof usdPriceOverride === "number") return usdPriceOverride;
    return tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  }, [tokenPrice, usdPriceOverride]);
  const debtAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;

  // Stable position object for RefinanceModal
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

  // Use shared position state hook
  const { isWalletConnected, hasBalance, disabledMessage } = usePositionState({
    networkType,
    tokenBalance: tokenBalanceBn,
    actionsDisabled,
    actionsDisabledReason,
  });

  // Fetch optimal rate for "better rate" badge calculation
  const { protocol: optimalProtocol, rate: optimalRateDisplay } = useOptimalRate({
    networkType,
    tokenAddress,
    type: "borrow",
  });

  const hasOptimalProtocol = Boolean(optimalProtocol);
  const displayedOptimalProtocol =
    demoOptimalOverride?.protocol ??
    (hasOptimalProtocol ? optimalProtocol : protocolName);
  const displayedOptimalRate =
    demoOptimalOverride?.rate ??
    (hasOptimalProtocol ? optimalRateDisplay : currentRate);

  // Determine if there's a better rate available on another protocol
  const ratesAreSame = Math.abs(currentRate - displayedOptimalRate) < 0.000001;
  const hasBetterRate =
    hasBalance &&
    displayedOptimalProtocol &&
    !ratesAreSame &&
    normalizeProtocolName(displayedOptimalProtocol) !== normalizeProtocolName(protocolName) &&
    displayedOptimalRate < currentRate;

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
  const showCloseButton =
    (networkType === "evm" ? true : Boolean(onClosePosition)) && actionConfig.close && hasBalance;
  const showSwapButton =
    (networkType === "evm" ? true : Boolean(onSwap)) && actionConfig.swap && hasBalance;

  const handleBorrowClick = onBorrow ?? borrowModal.open;
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

  // Get the collateral view with isVisible prop
  const collateralViewWithVisibility = collateralView
    ? React.cloneElement(
        collateralView as React.ReactElement<{ isVisible?: boolean; initialShowAll?: boolean }>,
        {
          isVisible: controlledExpanded ?? defaultExpanded,
          initialShowAll: false,
        },
      )
    : null;

  // Build actions array for SegmentedActionBar
  const actions: SegmentedAction[] = [];

  if (showRepayButton) {
    actions.push({
      key: "repay",
      label: "Repay",
      icon: <MinusIcon className="w-4 h-4" />,
      onClick: repayModal.open,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: !isWalletConnected
        ? "Connect wallet to repay"
        : actionsDisabled
          ? disabledMessage
          : "Repay debt",
      variant: "ghost",
    });
  }

  if (showBorrowButton) {
    actions.push({
      key: "borrow",
      label: borrowCtaLabel ?? "Borrow",
      icon: <PlusIcon className="w-4 h-4" />,
      onClick: handleBorrowClick,
      disabled: !isWalletConnected || actionsDisabled,
      title: !isWalletConnected
        ? "Connect wallet to borrow"
        : actionsDisabled
          ? disabledMessage
          : "Borrow more tokens",
      variant: "ghost",
    });
  }

  if (showSwapButton) {
    actions.push({
      key: "swap",
      label: "Swap",
      icon: <ArrowPathIcon className="w-4 h-4" />,
      onClick: handleSwapClick,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: !isWalletConnected
        ? "Connect wallet to switch debt"
        : actionsDisabled
          ? disabledMessage
          : "Switch debt token",
      variant: "ghost",
      compactOnHover: true,
    });
  }

  if (showMoveButton) {
    actions.push({
      key: "move",
      label: "Move",
      icon: <ArrowRightIcon className="w-4 h-4" />,
      onClick: moveModal.open,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: !isWalletConnected
        ? "Connect wallet to move debt"
        : actionsDisabled
          ? disabledMessage
          : "Move debt to another protocol",
      variant: "ghost",
      compactOnHover: true,
    });
  }

  if (showCloseButton) {
    actions.push({
      key: "close",
      label: "Close",
      icon: <XMarkIcon className="w-4 h-4" />,
      onClick: handleCloseClick,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: !isWalletConnected
        ? "Connect wallet to close position"
        : actionsDisabled
          ? disabledMessage
          : "Close position with collateral",
      variant: "ghost",
      compactOnHover: true,
    });
  }

  // Quick "Move" badge shown in header when better rate available
  const headerQuickAction = hasBetterRate && showMoveButton ? (
    <button
      className={`px-2 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
        !isWalletConnected || actionsDisabled
          ? "bg-base-300 text-base-content/50 cursor-not-allowed"
          : "bg-primary text-primary-content hover:bg-primary/80 animate-pulse"
      }`}
      onClick={e => {
        e.stopPropagation();
        if (isWalletConnected && !actionsDisabled) {
          moveModal.open();
        }
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
  ) : null;

  // Collateral view content shown when expanded
  const collateralContent = collateralView ? (
    <div className="overflow-hidden transition-all duration-300 mt-2">
      <div className="py-2">{collateralViewWithVisibility}</div>
    </div>
  ) : null;

  // Custom info button with collateral value
  const customInfoButton = infoButton ?? (showInfoDropdown ? (
    <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
      <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
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
  ) : null);

  return (
    <>
      <BasePosition
        // Token info
        icon={icon}
        name={name}
        tokenAddress={tokenAddress}
        tokenPrice={tokenPrice}
        tokenDecimals={tokenDecimals}
        tokenBalance={tokenBalanceBn}
        // Protocol info
        protocolName={protocolName}
        networkType={networkType}
        currentRate={currentRate}
        // Position type
        positionType="borrow"
        rateLabel="APR"
        // UI customization
        containerClassName={containerClassName}
        hideBalanceColumn={hideBalanceColumn}
        infoButton={customInfoButton}
        afterInfoContent={afterInfoContent}
        renderName={renderName}
        showInfoDropdown={showInfoDropdown}
        showExpandIndicator={true}
        defaultExpanded={defaultExpanded}
        suppressDisabledMessage={suppressDisabledMessage}
        // Actions
        actionsDisabled={actionsDisabled}
        actionsDisabledReason={actionsDisabledReason}
        extraActions={extraActions}
        // Controlled expansion
        controlledExpanded={controlledExpanded}
        onToggleExpanded={onToggleExpanded}
        // Action bar
        actions={actions}
        // Optimal rate override for demo
        optimalRateOverride={demoOptimalOverride}
        // Balance display
        balanceClassName="text-error"
        isNegativeBalance={true}
        showNoBalanceLabel={showNoDebtLabel}
        noBalanceText="No debt"
        // Header quick action (Move badge)
        headerQuickAction={headerQuickAction}
      />

      {/* Collateral View (if provided) - Only visible when expanded */}
      {collateralView && (controlledExpanded ?? defaultExpanded) && collateralContent}

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
            debtBalance={tokenBalanceBn}
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
            context={protocolContext}
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
            debtBalance={tokenBalanceBn}
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
              fromContext={protocolContext}
              preSelectedCollaterals={moveSupport?.preselectedCollaterals}
              disableCollateralSelection={moveSupport?.disableCollateralSelection}
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
            debtBalance={tokenBalanceBn}
            availableCollaterals={availableAssetsList as SwapAsset[]}
            context={
              protocolName.toLowerCase().includes("compound")
                ? encodeAbiParameters([{ type: "address" }], [tokenAddress as Address]) as `0x${string}`
                : protocolContext
            }
          />
          <DebtSwapEvmModal
            isOpen={debtSwapModal.isOpen}
            onClose={debtSwapModal.close}
            protocolName={protocolName}
            chainId={chainId || 1}
            debtFromToken={tokenAddress as Address}
            currentDebtBalance={tokenBalanceBn}
            debtFromName={name}
            debtFromIcon={icon}
            debtFromDecimals={tokenDecimals || 18}
            debtFromPrice={tokenPrice}
            availableAssets={availableAssetsList as SwapAsset[]}
            context={
              protocolName.toLowerCase().includes("compound")
                ? encodeAbiParameters([{ type: "address" }], [tokenAddress as Address]) as `0x${string}`
                : protocolContext
            }
          />
        </>
      )}
    </>
  );
};
