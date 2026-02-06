import { FC, ReactNode, useCallback, useMemo } from "react";
import { PlusIcon, MinusIcon, ArrowPathIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { ProtocolPosition } from "./ProtocolView";
import { DepositModal } from "./modals/DepositModal";
import { WithdrawModal } from "./modals/WithdrawModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";
import { DepositModalStark } from "./modals/stark/DepositModalStark";
import { WithdrawModalStark } from "./modals/stark/WithdrawModalStark";
import { BasePosition, usePositionState } from "./common/BasePosition";
import { SegmentedAction } from "./common/SegmentedActionBar";
import { useModal } from "~~/hooks/useModal";
import { PositionManager } from "~~/utils/position";
import { useExternalYields, isPTToken } from "~~/hooks/useExternalYields";

// SupplyPositionProps extends ProtocolPosition but can add supply-specific props
type ExtraStat = {
  label: string;
  value: ReactNode;
};

// Module-level empty array to avoid recreating on each render
const EMPTY_EXTRA_STATS: ExtraStat[] = [];

export type SupplyPositionProps = ProtocolPosition & {
  protocolName: string;
  afterInfoContent?: ReactNode;
  renderName?: (name: string) => ReactNode;
  networkType: "evm" | "starknet";
  chainId?: number;
  position?: PositionManager;
  disableMove?: boolean;
  containerClassName?: string;
  /** ADL protection status - lights up left border when active */
  adlActive?: boolean;
  hideBalanceColumn?: boolean;
  subtitle?: ReactNode;
  infoButton?: ReactNode;
  availableActions?: {
    deposit?: boolean;
    withdraw?: boolean;
    move?: boolean;
    swap?: boolean;
  };
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onMove?: () => void;
  onSwap?: () => void;
  controlledExpanded?: boolean;
  onToggleExpanded?: () => void;
  showQuickDepositButton?: boolean;
  showInfoDropdown?: boolean;
  extraActions?: ReactNode;
  suppressDisabledMessage?: boolean;
  extraStats?: ExtraStat[];
  showExpandIndicator?: boolean;
  defaultExpanded?: boolean;
};

export const SupplyPosition: FC<SupplyPositionProps> = ({
  icon,
  name,
  tokenBalance,
  currentRate,
  protocolName,
  tokenAddress,
  tokenPrice,
  tokenDecimals,
  afterInfoContent,
  renderName,
  networkType,
  chainId,
  position,
  disableMove = false,
  vesuContext,
  protocolContext,
  actionsDisabled = false,
  actionsDisabledReason,
  containerClassName,
  hideBalanceColumn = false,
  subtitle,
  infoButton,
  availableActions,
  onDeposit,
  onWithdraw,
  onMove,
  onSwap,
  controlledExpanded,
  onToggleExpanded,
  showQuickDepositButton = false,
  showInfoDropdown = false,
  extraActions,
  suppressDisabledMessage = false,
  extraStats = EMPTY_EXTRA_STATS,
  showExpandIndicator = true,
  defaultExpanded = false,
  adlActive = false,
}) => {
  const moveModal = useModal();
  const depositModal = useModal();
  const withdrawModal = useModal();

  // For PT tokens, use Pendle's price to ensure consistency with displayed APY
  const { findYield } = useExternalYields(chainId);
  const effectiveTokenPrice = useMemo(() => {
    if (isPTToken(name)) {
      const ptYield = findYield(tokenAddress, name);
      if (ptYield?.metadata?.ptPriceUsd && ptYield.metadata.ptPriceUsd > 0) {
        // Convert USD price to 8 decimals (bigint format used by FiatBalance)
        return BigInt(Math.round(ptYield.metadata.ptPriceUsd * 1e8));
      }
    }
    return tokenPrice;
  }, [name, tokenAddress, tokenPrice, findYield]);

  const usdPrice = effectiveTokenPrice ? Number(effectiveTokenPrice) / 1e8 : 0;

  // Memoize the token object to avoid recreating it multiple times
  const tokenInfo = useMemo(
    () => ({
      name,
      icon,
      address: tokenAddress,
      currentRate,
      usdPrice,
      decimals: tokenDecimals || 18,
    }),
    [name, icon, tokenAddress, currentRate, usdPrice, tokenDecimals],
  );

  // Normalized balance as bigint for modals
  const normalizedBalance = typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0);

  // Memoize the token object for MoveSupplyModal to avoid inline object creation
  const moveSupplyToken = useMemo(
    () => ({
      name,
      icon,
      address: tokenAddress,
      currentRate,
      rawBalance: normalizedBalance,
      decimals: tokenDecimals,
      price: effectiveTokenPrice,
    }),
    [name, icon, tokenAddress, currentRate, normalizedBalance, tokenDecimals, effectiveTokenPrice],
  );

  // Use shared position state hook
  const { isWalletConnected, hasBalance, disabledMessage } = usePositionState({
    networkType,
    tokenBalance,
    actionsDisabled,
    actionsDisabledReason,
  });

  const actionConfig = {
    deposit: availableActions?.deposit !== false,
    withdraw: availableActions?.withdraw !== false,
    move: availableActions?.move !== false,
    swap: availableActions?.swap !== false,
  };

  const showDepositButton = actionConfig.deposit;
  const showWithdrawButton = actionConfig.withdraw;
  const showMoveButton = actionConfig.move && !disableMove;
  const showSwapButton = Boolean(onSwap) && actionConfig.swap;

  const handleDepositClick = onDeposit ?? depositModal.open;
  const handleWithdrawClick = onWithdraw ?? withdrawModal.open;
  const handleMoveClick = onMove ?? moveModal.open;
  const handleSwapClick = onSwap;

  // Memoized event handlers to avoid inline functions in JSX
  const handleStopPropagation = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const handleQuickDepositClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!actionsDisabled) {
        handleDepositClick();
      }
    },
    [actionsDisabled, handleDepositClick],
  );

  // Build actions array for SegmentedActionBar (memoized to avoid recreating on each render)
  const actions = useMemo(() => {
    const result: SegmentedAction[] = [];

    if (showDepositButton) {
      result.push({
        key: "deposit",
        label: "Deposit",
        icon: <PlusIcon className="size-4" />,
        onClick: handleDepositClick,
        disabled: !isWalletConnected || actionsDisabled,
        title: !isWalletConnected
          ? "Connect wallet to deposit"
          : actionsDisabled
            ? disabledMessage
            : "Deposit tokens",
        variant: "ghost",
      });
    }

    if (showWithdrawButton) {
      result.push({
        key: "withdraw",
        label: "Withdraw",
        icon: <MinusIcon className="size-4" />,
        onClick: handleWithdrawClick,
        disabled: !isWalletConnected || !hasBalance || actionsDisabled,
        title: !isWalletConnected
          ? "Connect wallet to withdraw"
          : actionsDisabled
            ? disabledMessage
            : !hasBalance
              ? "No balance to withdraw"
              : "Withdraw tokens",
        variant: "ghost",
      });
    }

    if (showMoveButton) {
      result.push({
        key: "move",
        label: "Move",
        icon: <ArrowRightIcon className="size-4" />,
        onClick: handleMoveClick,
        disabled: !isWalletConnected || !hasBalance || actionsDisabled,
        title: !isWalletConnected
          ? "Connect wallet to move supply"
          : actionsDisabled
            ? disabledMessage
            : !hasBalance
              ? "No balance to move"
              : "Move supply to another protocol",
        variant: "ghost",
        compactOnHover: true,
      });
    }

    if (showSwapButton && handleSwapClick) {
      result.push({
        key: "swap",
        label: "Swap",
        icon: <ArrowPathIcon className="size-4" />,
        onClick: handleSwapClick,
        disabled: !isWalletConnected || actionsDisabled || !hasBalance,
        title: !isWalletConnected
          ? "Connect wallet to swap collateral"
          : actionsDisabled
            ? disabledMessage
            : !hasBalance
              ? "No collateral to swap"
              : "Switch collateral token",
        variant: "ghost",
        compactOnHover: true,
      });
    }

    return result;
  }, [
    showDepositButton,
    showWithdrawButton,
    showMoveButton,
    showSwapButton,
    handleDepositClick,
    handleWithdrawClick,
    handleMoveClick,
    handleSwapClick,
    isWalletConnected,
    hasBalance,
    actionsDisabled,
    disabledMessage,
  ]);

  // Quick deposit button rendered outside BasePosition
  const quickDepositButton = showQuickDepositButton ? (
    <div className="mt-2" onClick={handleStopPropagation}>
      <button
        className="border-base-300 text-primary hover:border-primary/70 hover:text-primary flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-sm"
        onClick={handleQuickDepositClick}
        disabled={!isWalletConnected || actionsDisabled}
        title={
          !isWalletConnected
            ? "Connect wallet to deposit"
            : actionsDisabled
              ? disabledMessage
              : "Deposit more collateral"
        }
      >
        <PlusIcon className="size-4" />
        <span>Deposit</span>
      </button>
    </div>
  ) : null;

  return (
    <>
      <BasePosition
        // Token info
        icon={icon}
        name={name}
        tokenAddress={tokenAddress}
        tokenPrice={effectiveTokenPrice}
        tokenDecimals={tokenDecimals}
        tokenBalance={normalizedBalance}
        // Protocol info
        protocolName={protocolName}
        networkType={networkType}
        currentRate={currentRate}
        // Position type
        positionType="supply"
        rateLabel="APY"
        // UI customization
        containerClassName={containerClassName}
        hideBalanceColumn={hideBalanceColumn}
        subtitle={subtitle}
        infoButton={infoButton}
        afterInfoContent={afterInfoContent}
        renderName={renderName}
        showInfoDropdown={showInfoDropdown}
        showExpandIndicator={showExpandIndicator}
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
        // Extra stats
        extraStats={extraStats}
        // Balance display
        balanceClassName="text-success"
        isNegativeBalance={false}
        // ADL status
        adlActive={adlActive}
      />

      {quickDepositButton}

      {/* Modals */}
      {networkType === "starknet" ? (
        <>
          <DepositModalStark
            isOpen={depositModal.isOpen}
            onClose={depositModal.close}
            token={tokenInfo}
            protocolName={protocolName}
            position={position}
            vesuContext={vesuContext?.deposit}
          />
          <WithdrawModalStark
            isOpen={withdrawModal.isOpen}
            onClose={withdrawModal.close}
            token={tokenInfo}
            protocolName={protocolName}
            supplyBalance={normalizedBalance}
            position={position}
            vesuContext={vesuContext?.withdraw}
          />
        </>
      ) : (
        <>
          <DepositModal
            isOpen={depositModal.isOpen}
            onClose={depositModal.close}
            token={tokenInfo}
            protocolName={protocolName}
            position={position}
            chainId={chainId}
            context={protocolContext}
          />
          <WithdrawModal
            isOpen={withdrawModal.isOpen}
            onClose={withdrawModal.close}
            token={tokenInfo}
            protocolName={protocolName}
            supplyBalance={normalizedBalance}
            position={position}
            chainId={chainId}
            context={protocolContext}
          />
        </>
      )}

      {!disableMove && (
        <MoveSupplyModal
          isOpen={moveModal.isOpen}
          onClose={moveModal.close}
          token={moveSupplyToken}
          fromProtocol={protocolName}
          chainId={chainId}
        />
      )}
    </>
  );
};
