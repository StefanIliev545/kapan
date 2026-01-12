import React, { FC, useMemo, useCallback, MouseEvent } from "react";
import { Address } from "viem";
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
import { PositionInfoDropdown } from "./common/PositionInfoDropdown";
import { SegmentedAction } from "./common/SegmentedActionBar";
import { buildModalTokenInfo, encodeCompoundContext } from "./modals/common/modalUtils";
import { useModal } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { PositionManager } from "~~/utils/position";
import { normalizeProtocolName } from "~~/utils/protocol";
import { isVesuContextV1, isVesuContextV2, VesuContext } from "~~/utils/vesu";

// --- Helper Functions ---

/**
 * Extracts pool ID from a VesuContext for use in RefinanceModal
 */
function extractPoolIdFromVesuContext(context: VesuContext | undefined): bigint | undefined {
  if (!context) return undefined;
  if (isVesuContextV1(context)) return context.poolId;
  if (isVesuContextV2(context)) return BigInt(context.poolAddress);
  return undefined;
}

/**
 * Maps protocol name to the protocol type expected by RefinanceModal
 */
function getMoveFromProtocol(protocolName: string): "Vesu" | "Nostra" | "VesuV2" {
  const normalized = protocolName.toLowerCase();
  if (normalized === "vesu") return "Vesu";
  if (normalized === "vesu_v2") return "VesuV2";
  if (normalized === "nostra") return "Nostra";
  return "Vesu";
}

/**
 * Determines if a better rate is available on another protocol
 */
function checkHasBetterRate(params: {
  hasBalance: boolean;
  displayedOptimalProtocol: string | undefined;
  displayedOptimalRate: number;
  currentRate: number;
  protocolName: string;
}): boolean {
  const { hasBalance, displayedOptimalProtocol, displayedOptimalRate, currentRate, protocolName } = params;
  const ratesAreSame = Math.abs(currentRate - displayedOptimalRate) < 0.000001;
  return (
    hasBalance &&
    displayedOptimalProtocol !== undefined &&
    displayedOptimalProtocol !== null &&
    !ratesAreSame &&
    normalizeProtocolName(displayedOptimalProtocol) !== normalizeProtocolName(protocolName) &&
    displayedOptimalRate < currentRate
  );
}

/**
 * Gets the tooltip/title text for action buttons based on state
 */
function getActionTitle(params: {
  isWalletConnected: boolean | undefined;
  actionsDisabled: boolean;
  disabledMessage: string;
  disconnectedMessage: string;
  enabledMessage: string;
}): string {
  const { isWalletConnected, actionsDisabled, disabledMessage, disconnectedMessage, enabledMessage } = params;
  if (!isWalletConnected) return disconnectedMessage;
  if (actionsDisabled) return disabledMessage;
  return enabledMessage;
}

interface ActionBuilderParams {
  showRepayButton: boolean;
  showBorrowButton: boolean;
  showSwapButton: boolean;
  showMoveButton: boolean;
  showCloseButton: boolean;
  hasBalance: boolean;
  isWalletConnected: boolean | undefined;
  actionsDisabled: boolean;
  disabledMessage: string;
  borrowCtaLabel?: string;
  repayModalOpen: () => void;
  handleBorrowClick: () => void;
  handleSwapClick: () => void;
  moveModalOpen: () => void;
  handleCloseClick: () => void;
}

/**
 * Calculates displayed optimal protocol and rate considering demo override
 */
function getDisplayedOptimalValues(params: {
  demoOptimalOverride?: { protocol: string; rate: number };
  optimalProtocol: string | undefined;
  optimalRateDisplay: number;
  currentRate: number;
  protocolName: string;
}): { displayedOptimalProtocol: string | undefined; displayedOptimalRate: number } {
  const { demoOptimalOverride, optimalProtocol, optimalRateDisplay, currentRate, protocolName } = params;
  const hasOptimalProtocol = Boolean(optimalProtocol);
  return {
    displayedOptimalProtocol: demoOptimalOverride?.protocol ?? (hasOptimalProtocol ? optimalProtocol : protocolName),
    displayedOptimalRate: demoOptimalOverride?.rate ?? (hasOptimalProtocol ? optimalRateDisplay : currentRate),
  };
}

interface ButtonVisibilityConfig {
  availableActions?: {
    borrow?: boolean;
    repay?: boolean;
    move?: boolean;
    close?: boolean;
    swap?: boolean;
  };
  showNoDebtLabel: boolean;
  canInitiateBorrow: boolean;
  hasBalance: boolean;
  networkType: "evm" | "starknet";
  onClosePosition?: () => void;
  onSwap?: () => void;
}

/**
 * Calculates which action buttons should be visible
 */
function getButtonVisibility(config: ButtonVisibilityConfig) {
  const { availableActions, showNoDebtLabel, canInitiateBorrow, hasBalance, networkType, onClosePosition, onSwap } =
    config;

  const actionConfig = {
    borrow: availableActions?.borrow !== false,
    repay: availableActions?.repay !== false,
    move: availableActions?.move !== false,
    close: availableActions?.close !== false,
    swap: availableActions?.swap !== false,
  };

  const supportsClose = networkType === "evm" || Boolean(onClosePosition);
  const supportsSwap = networkType === "evm" || Boolean(onSwap);

  return {
    showBorrowButton: actionConfig.borrow || (showNoDebtLabel && canInitiateBorrow),
    showRepayButton: actionConfig.repay,
    showMoveButton: actionConfig.move && hasBalance,
    showCloseButton: supportsClose && actionConfig.close && hasBalance,
    showSwapButton: supportsSwap && actionConfig.swap && hasBalance,
  };
}

interface ClickHandlers {
  networkType: "evm" | "starknet";
  onBorrow?: () => void;
  onClosePosition?: () => void;
  onSwap?: () => void;
  borrowModalOpen: () => void;
  closeWithCollateralModalOpen: () => void;
  debtSwapModalOpen: () => void;
}

/**
 * Returns appropriate click handlers based on network type
 */
function getClickHandlers(config: ClickHandlers & { protocolName: string }) {
  const { networkType, onBorrow, onClosePosition, onSwap, borrowModalOpen, closeWithCollateralModalOpen, debtSwapModalOpen, protocolName } = config;
  const noop = () => { return; };

  // Morpho requires custom handler (external modal has Morpho-specific props)
  const isMorpho = protocolName.toLowerCase().includes("morpho");

  return {
    handleBorrowClick: onBorrow ?? borrowModalOpen,
    handleCloseClick: networkType === "evm" ? closeWithCollateralModalOpen : (onClosePosition ?? noop),
    // Morpho uses custom handler; other EVM protocols use internal modal; non-EVM uses custom handler
    handleSwapClick: isMorpho && onSwap ? onSwap : (networkType === "evm" ? debtSwapModalOpen : (onSwap ?? noop)),
  };
}

function buildActions(params: ActionBuilderParams): SegmentedAction[] {
  const {
    showRepayButton,
    showBorrowButton,
    showSwapButton,
    showMoveButton,
    showCloseButton,
    hasBalance,
    isWalletConnected,
    actionsDisabled,
    disabledMessage,
    borrowCtaLabel,
    repayModalOpen,
    handleBorrowClick,
    handleSwapClick,
    moveModalOpen,
    handleCloseClick,
  } = params;

  const actions: SegmentedAction[] = [];

  if (showRepayButton) {
    actions.push({
      key: "repay",
      label: "Repay",
      icon: <MinusIcon className="size-4" />,
      onClick: repayModalOpen,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: getActionTitle({
        isWalletConnected,
        actionsDisabled,
        disabledMessage,
        disconnectedMessage: "Connect wallet to repay",
        enabledMessage: "Repay debt",
      }),
      variant: "ghost",
    });
  }

  if (showBorrowButton) {
    actions.push({
      key: "borrow",
      label: borrowCtaLabel ?? "Borrow",
      icon: <PlusIcon className="size-4" />,
      onClick: handleBorrowClick,
      disabled: !isWalletConnected || actionsDisabled,
      title: getActionTitle({
        isWalletConnected,
        actionsDisabled,
        disabledMessage,
        disconnectedMessage: "Connect wallet to borrow",
        enabledMessage: "Borrow more tokens",
      }),
      variant: "ghost",
    });
  }

  if (showSwapButton) {
    actions.push({
      key: "swap",
      label: "Swap",
      icon: <ArrowPathIcon className="size-4" />,
      onClick: handleSwapClick,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: getActionTitle({
        isWalletConnected,
        actionsDisabled,
        disabledMessage,
        disconnectedMessage: "Connect wallet to switch debt",
        enabledMessage: "Switch debt token",
      }),
      variant: "ghost",
      compactOnHover: true,
    });
  }

  if (showMoveButton) {
    actions.push({
      key: "move",
      label: "Move",
      icon: <ArrowRightIcon className="size-4" />,
      onClick: moveModalOpen,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: getActionTitle({
        isWalletConnected,
        actionsDisabled,
        disabledMessage,
        disconnectedMessage: "Connect wallet to move debt",
        enabledMessage: "Move debt to another protocol",
      }),
      variant: "ghost",
      compactOnHover: true,
    });
  }

  if (showCloseButton) {
    actions.push({
      key: "close",
      label: "Close",
      icon: <XMarkIcon className="size-4" />,
      onClick: handleCloseClick,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      title: getActionTitle({
        isWalletConnected,
        actionsDisabled,
        disabledMessage,
        disconnectedMessage: "Connect wallet to close position",
        enabledMessage: "Close position with collateral",
      }),
      variant: "ghost",
      compactOnHover: true,
    });
  }

  return actions;
}

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

  // Position data for Starknet move modal (includes poolId)
  const movePoolIdForMemo = useMemo(() => {
    const borrowPoolId = extractPoolIdFromVesuContext(vesuContext?.borrow);
    const repayPoolId = extractPoolIdFromVesuContext(vesuContext?.repay);
    return borrowPoolId ?? repayPoolId;
  }, [vesuContext?.borrow, vesuContext?.repay]);
  const movePosition = useMemo(
    () => ({
      name,
      tokenAddress,
      decimals: tokenDecimals ?? 18,
      balance: tokenBalance ?? 0n,
      poolId: movePoolIdForMemo,
      type: "borrow" as const,
    }),
    [name, tokenAddress, tokenDecimals, tokenBalance, movePoolIdForMemo],
  );

  // Shared token info for modals - eliminates duplicate token prop construction
  const modalTokenInfo = useMemo(
    () => buildModalTokenInfo({ name, icon, tokenAddress, currentRate, usdPrice, tokenDecimals }),
    [name, icon, tokenAddress, currentRate, usdPrice, tokenDecimals],
  );

  // Computed context for Compound protocol - used by CloseWithCollateral and DebtSwap modals
  const compoundAwareContext = useMemo(
    () => encodeCompoundContext(protocolName, tokenAddress as Address, protocolContext),
    [protocolName, tokenAddress, protocolContext],
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

  // Calculate displayed optimal values for "better rate" badge
  const { displayedOptimalProtocol, displayedOptimalRate } = getDisplayedOptimalValues({
    demoOptimalOverride,
    optimalProtocol,
    optimalRateDisplay,
    currentRate,
    protocolName,
  });

  // Determine if there's a better rate available on another protocol
  const hasBetterRate = checkHasBetterRate({
    hasBalance,
    displayedOptimalProtocol,
    displayedOptimalRate,
    currentRate,
    protocolName,
  });

  // Calculate which buttons to show
  const canInitiateBorrow = networkType === "evm" || Boolean(vesuContext?.borrow || onBorrow);
  const { showBorrowButton, showRepayButton, showMoveButton, showCloseButton, showSwapButton } = getButtonVisibility({
    availableActions,
    showNoDebtLabel,
    canInitiateBorrow,
    hasBalance,
    networkType,
    onClosePosition,
    onSwap,
  });

  // Get click handlers based on network type
  const { handleBorrowClick, handleCloseClick, handleSwapClick } = getClickHandlers({
    networkType,
    onBorrow,
    onClosePosition,
    onSwap,
    borrowModalOpen: borrowModal.open,
    closeWithCollateralModalOpen: closeWithCollateralModal.open,
    debtSwapModalOpen: debtSwapModal.open,
    protocolName,
  });

  // Extract protocol name for RefinanceModal
  const moveFromProtocol = getMoveFromProtocol(protocolName);

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

  // Build actions array using helper function
  const actions = buildActions({
    showRepayButton,
    showBorrowButton,
    showSwapButton,
    showMoveButton,
    showCloseButton,
    hasBalance,
    isWalletConnected,
    actionsDisabled,
    disabledMessage,
    borrowCtaLabel,
    repayModalOpen: repayModal.open,
    handleBorrowClick,
    handleSwapClick,
    moveModalOpen: moveModal.open,
    handleCloseClick,
  });

  // Quick "Move" badge shown in header when better rate available
  const isQuickMoveDisabled = !isWalletConnected || actionsDisabled;
  const quickMoveTitle = getActionTitle({
    isWalletConnected,
    actionsDisabled,
    disabledMessage,
    disconnectedMessage: "Connect wallet to move debt",
    enabledMessage: "Move debt to another protocol",
  });
  const handleQuickMoveClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (!isQuickMoveDisabled) {
      moveModal.open();
    }
  }, [isQuickMoveDisabled, moveModal]);
  const headerQuickAction = hasBetterRate && showMoveButton ? (
    <button
      className={`flex-shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        isQuickMoveDisabled
          ? "bg-base-300 text-base-content/50 cursor-not-allowed"
          : "bg-primary text-primary-content hover:bg-primary/80 animate-pulse"
      }`}
      onClick={handleQuickMoveClick}
      disabled={isQuickMoveDisabled}
      aria-label="Move"
      title={quickMoveTitle}
    >
      Move
    </button>
  ) : null;

  // Collateral view content shown when expanded
  const collateralContent = collateralView ? (
    <div className="mt-2 overflow-hidden transition-all duration-300">
      <div className="py-2">{collateralViewWithVisibility}</div>
    </div>
  ) : null;

  // Custom info button with collateral value - uses PositionInfoDropdown
  const collateralValueContent = collateralValue ? (
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
  ) : null;

  const customInfoButton = infoButton ?? (showInfoDropdown ? (
    <PositionInfoDropdown
      name={name}
      tokenAddress={tokenAddress}
      protocolName={protocolName}
      positionType="Borrow Position"
      extraContent={collateralValueContent}
    />
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
            token={modalTokenInfo}
            protocolName={protocolName}
            currentDebt={debtAmount}
            position={position}
            vesuContext={vesuContext?.borrow}
          />
          <RepayModalStark
            isOpen={repayModal.isOpen}
            onClose={repayModal.close}
            token={modalTokenInfo}
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
              position={movePosition}
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
            token={modalTokenInfo}
            protocolName={protocolName}
            currentDebt={debtAmount}
            position={position}
            chainId={chainId}
            context={protocolContext}
          />
          <RepayModal
            isOpen={repayModal.isOpen}
            onClose={repayModal.close}
            token={modalTokenInfo}
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
            context={compoundAwareContext}
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
            context={compoundAwareContext}
          />
        </>
      )}
    </>
  );
};
