import { FC, ReactNode } from "react";
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

// SupplyPositionProps extends ProtocolPosition but can add supply-specific props
type ExtraStat = {
  label: string;
  value: ReactNode;
};

export type SupplyPositionProps = ProtocolPosition & {
  protocolName: string;
  afterInfoContent?: ReactNode;
  renderName?: (name: string) => ReactNode;
  networkType: "evm" | "starknet";
  chainId?: number;
  position?: PositionManager;
  disableMove?: boolean;
  containerClassName?: string;
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
  extraStats = [],
  showExpandIndicator = true,
  defaultExpanded = false,
}) => {
  const moveModal = useModal();
  const depositModal = useModal();
  const withdrawModal = useModal();

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;

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

  // Build actions array for SegmentedActionBar
  const actions: SegmentedAction[] = [];

  if (showDepositButton) {
    actions.push({
      key: "deposit",
      label: "Deposit",
      icon: <PlusIcon className="w-4 h-4" />,
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
    actions.push({
      key: "withdraw",
      label: "Withdraw",
      icon: <MinusIcon className="w-4 h-4" />,
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
    actions.push({
      key: "move",
      label: "Move",
      icon: <ArrowRightIcon className="w-4 h-4" />,
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

  if (showSwapButton) {
    actions.push({
      key: "swap",
      label: "Swap",
      icon: <ArrowPathIcon className="w-4 h-4" />,
      onClick: handleSwapClick ?? (() => { return; }),
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

  // Quick deposit button rendered outside BasePosition
  const quickDepositButton = showQuickDepositButton ? (
    <div className="mt-2" onClick={e => e.stopPropagation()}>
      <button
        className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-base-300 rounded-md text-sm text-primary hover:border-primary/70 hover:text-primary"
        onClick={event => {
          event.stopPropagation();
          if (!actionsDisabled) {
            handleDepositClick();
          }
        }}
        disabled={!isWalletConnected || actionsDisabled}
        title={
          !isWalletConnected
            ? "Connect wallet to deposit"
            : actionsDisabled
              ? disabledMessage
              : "Deposit more collateral"
        }
      >
        <PlusIcon className="w-4 h-4" />
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
        tokenPrice={tokenPrice}
        tokenDecimals={tokenDecimals}
        tokenBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
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
      />

      {quickDepositButton}

      {/* Modals */}
      {networkType === "starknet" ? (
        <>
          <DepositModalStark
            isOpen={depositModal.isOpen}
            onClose={depositModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            position={position}
            vesuContext={vesuContext?.deposit}
          />
          <WithdrawModalStark
            isOpen={withdrawModal.isOpen}
            onClose={withdrawModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            supplyBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
            position={position}
            vesuContext={vesuContext?.withdraw}
          />
        </>
      ) : (
        <>
          <DepositModal
            isOpen={depositModal.isOpen}
            onClose={depositModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            position={position}
            chainId={chainId}
            context={protocolContext}
          />
          <WithdrawModal
            isOpen={withdrawModal.isOpen}
            onClose={withdrawModal.close}
            token={{
              name,
              icon,
              address: tokenAddress,
              currentRate,
              usdPrice,
              decimals: tokenDecimals || 18,
            }}
            protocolName={protocolName}
            supplyBalance={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
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
          token={{
            name,
            icon,
            address: tokenAddress,
            currentRate,
            rawBalance: typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0),
            decimals: tokenDecimals,
            price: tokenPrice,
          }}
          fromProtocol={protocolName}
          chainId={chainId}
        />
      )}
    </>
  );
};
