import React, { FC, ReactNode } from "react";
import Image from "next/image";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { DepositModal } from "./modals/DepositModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";
import { DepositModalStark } from "./modals/stark/DepositModalStark";
import { WithdrawModalStark } from "./modals/stark/WithdrawModalStark";
import { FiPlus } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import {
  PositionActionButton,
  PositionActionButtons,
  PositionCard,
  PositionInfoDropdown,
  PositionToggleIndicator,
} from "./positions/PositionCard";

// SupplyPositionProps extends ProtocolPosition but can add supply-specific props
export type SupplyPositionProps = ProtocolPosition & {
  protocolName: string;
  afterInfoContent?: React.ReactNode;
  networkType: "evm" | "starknet";
  position?: PositionManager;
  disableMove?: boolean;
  containerClassName?: string;
  hideBalanceColumn?: boolean;
  subtitle?: ReactNode;
  availableActions?: {
    deposit?: boolean;
    withdraw?: boolean;
    move?: boolean;
  };
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onMove?: () => void;
  showQuickDepositButton?: boolean;
  showInfoDropdown?: boolean;
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
  networkType,
  position,
  disableMove = false,
  vesuContext,
  actionsDisabled = false,
  actionsDisabledReason,
  containerClassName,
  hideBalanceColumn = false,
  subtitle,
  availableActions,
  onDeposit,
  onWithdraw,
  onMove,
  showQuickDepositButton = false,
  showInfoDropdown = true,
}) => {
  const moveModal = useModal();
  const depositModal = useModal();
  const withdrawModal = useModal();
  const expanded = useToggle();
  const isExpanded = expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  // Get wallet connection status for both networks
  const { evm, starknet } = useWalletConnection();
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;

  // Check if position has a balance
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
    type: "supply",
  });

  const hasOptimalProtocol = Boolean(optimalProtocol);
  const displayedOptimalProtocol = hasOptimalProtocol ? optimalProtocol : protocolName;
  const displayedOptimalRate = hasOptimalProtocol ? optimalRateDisplay : currentRate;

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  const actionConfig = {
    deposit: availableActions?.deposit !== false,
    withdraw: availableActions?.withdraw !== false,
    move: availableActions?.move !== false,
  };

  const showDepositButton = actionConfig.deposit;
  const showWithdrawButton = actionConfig.withdraw;
  const showMoveButton = actionConfig.move && !disableMove;

  const hasAnyActions = showDepositButton || showWithdrawButton || showMoveButton;

  const handleDepositClick = onDeposit ?? depositModal.open;
  const handleWithdrawClick = onWithdraw ?? withdrawModal.open;
  const handleMoveClick = onMove ?? moveModal.open;

  // Toggle expanded state
  const toggleExpanded = (e: React.MouseEvent) => {
    // Don't expand if clicking on the info button or its dropdown
    if ((e.target as HTMLElement).closest(".dropdown")) {
      return;
    }
    if (!hasAnyActions) {
      return;
    }
    expanded.toggle();
  };

  const actionButtons: PositionActionButton[] = [];

  if (showDepositButton) {
    actionButtons.push({
      key: "deposit",
      label: "Deposit",
      onClick: handleDepositClick,
      disabled: !isWalletConnected || actionsDisabled,
      className: "btn-primary",
      title:
        !isWalletConnected
          ? "Connect wallet to deposit"
          : actionsDisabled
            ? disabledMessage
            : "Deposit tokens",
    });
  }

  if (showWithdrawButton) {
    actionButtons.push({
      key: "withdraw",
      label: "Withdraw",
      onClick: handleWithdrawClick,
      disabled: !isWalletConnected || !hasBalance || actionsDisabled,
      className: "btn-outline",
      title:
        !isWalletConnected
          ? "Connect wallet to withdraw"
          : actionsDisabled
            ? disabledMessage
            : !hasBalance
              ? "No balance to withdraw"
              : "Withdraw tokens",
    });
  }

  if (showMoveButton) {
    actionButtons.push({
      key: "move",
      label: "Move",
      onClick: handleMoveClick,
      disabled: !isWalletConnected || !hasBalance || actionsDisabled,
      className: "btn-outline",
      title:
        !isWalletConnected
          ? "Connect wallet to move supply"
          : actionsDisabled
            ? disabledMessage
            : !hasBalance
              ? "No balance to move"
              : "Move supply to another protocol",
    });
  }

  const actionSection =
    isExpanded && hasAnyActions
      ? (
          <div className="mt-3 pt-3 border-t border-base-300" onClick={e => e.stopPropagation()}>
            <PositionActionButtons actions={actionButtons} />
            {actionsDisabled && (
              <div className="mt-3 text-sm text-base-content/70">{disabledMessage}</div>
            )}
          </div>
        )
      : null;

  const headerContent = (
    <>
      <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
        <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
      </div>
      <div className="ml-2 flex flex-col min-w-0">
        <span className="font-semibold text-lg truncate leading-tight">{name}</span>
        {subtitle ? (
          <span className="text-xs text-base-content/60 truncate leading-tight">{subtitle}</span>
        ) : null}
      </div>
      {showInfoDropdown && (
        <PositionInfoDropdown
          name={name}
          protocolName={protocolName}
          tokenAddress={tokenAddress}
          typeLabel="Supply Position"
        />
      )}
      {afterInfoContent && <div onClick={e => e.stopPropagation()}>{afterInfoContent}</div>}
    </>
  );

  const statsContent = (
    <>
      {!hideBalanceColumn && (
        <div className="px-2 border-r border-base-300">
          <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
          <div className="text-sm font-medium h-6 line-clamp-1">
            <FiatBalance
              tokenAddress={tokenAddress}
              rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
              price={tokenPrice}
              decimals={tokenDecimals}
              tokenSymbol={name}
              className="text-green-500"
            />
          </div>
        </div>
      )}
      <div className="px-2 border-r border-base-300">
        <div className="text-sm text-base-content/70 overflow-hidden h-6 flex items-center">APY</div>
        <div className="font-medium tabular-nums whitespace-nowrap text-ellipsis h-6 line-clamp-1">
          {formatPercentage(currentRate)}%
        </div>
      </div>
      <div className="px-2">
        <div className="text-sm text-base-content/70 overflow-hidden h-6">Best APY</div>
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
    </>
  );

  const indicatorContent = hasAnyActions ? <PositionToggleIndicator isExpanded={isExpanded} /> : null;

  return (
    <>
      <PositionCard
        isExpanded={isExpanded}
        canToggle={hasAnyActions}
        onToggle={toggleExpanded}
        containerClassName={containerClassName}
        header={headerContent}
        headerClassName="min-w-0"
        stats={statsContent}
        statsClassName={hideBalanceColumn ? "grid-cols-2" : "grid-cols-3"}
        indicator={indicatorContent}
        actionSection={actionSection}
      />

      {showQuickDepositButton && (
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
            <FiPlus className="w-4 h-4" />
            <span>Deposit</span>
          </button>
        </div>
      )}

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
        />
      )}
    </>
  );
};
