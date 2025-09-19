import React, { FC } from "react";
import Image from "next/image";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { BorrowModal } from "./modals/BorrowModal";
import { MovePositionModal } from "./modals/MovePositionModal";
import { RepayModal } from "./modals/RepayModal";
import type { TokenInfo } from "./modals/TokenActionModal";
import { BorrowModalStark } from "./modals/stark/BorrowModalStark";
import { MovePositionModal as MovePositionModalStark } from "./modals/stark/MovePositionModal";
import { RepayModalStark } from "./modals/stark/RepayModalStark";
import { FiMinus, FiPlus, FiRepeat } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { normalizeProtocolName } from "~~/utils/protocol";
import {
  PositionActionButton,
  PositionActionButtons,
  PositionCard,
  PositionInfoDropdown,
  PositionToggleIndicator,
} from "./positions/PositionCard";

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
  };
  onBorrow?: () => void;
  borrowCtaLabel?: string;
  showNoDebtLabel?: boolean;
  showInfoDropdown?: boolean;
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
  onBorrow,
  borrowCtaLabel,
  showNoDebtLabel = false,
  showInfoDropdown = true,
}) => {
  const moveModal = useModal();
  const repayModal = useModal();
  const borrowModal = useModal();
  const expanded = useToggle();
  const isExpanded = expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  const debtAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;
  const debtBalanceBigInt =
    typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance ?? 0);

  const tokenInfo: TokenInfo = {
    name,
    icon,
    address: tokenAddress,
    currentRate,
    usdPrice,
    decimals: tokenDecimals || 18,
  };

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

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

  const actionConfig = {
    borrow: availableActions?.borrow !== false,
    repay: availableActions?.repay !== false,
    move: availableActions?.move !== false,
  };

  const canInitiateBorrow =
    networkType === "evm" ? true : Boolean(vesuContext?.borrow || onBorrow);

  const showBorrowButton = actionConfig.borrow || (showNoDebtLabel && canInitiateBorrow);
  const showRepayButton = actionConfig.repay;
  const showMoveButton = actionConfig.move && hasBalance;

  const hasAnyActions = showRepayButton || showMoveButton || showBorrowButton;

  const handleBorrowClick = onBorrow ?? borrowModal.open;

  const movePoolId = vesuContext?.borrow?.poolId ?? vesuContext?.repay?.poolId;

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

  // Get the collateral view with isVisible prop
  const collateralViewWithVisibility = collateralView
    ? React.cloneElement(collateralView as React.ReactElement, {
        isVisible: isExpanded,
        initialShowAll: false,
      })
    : null;

  const actionButtons: PositionActionButton[] = [];

  if (showRepayButton) {
    actionButtons.push({
      key: "repay",
      label: "Repay",
      icon: <FiMinus className="w-4 h-4" />,
      onClick: repayModal.open,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      className: "btn-primary",
      ariaLabel: "Repay",
      title:
        !isWalletConnected
          ? "Connect wallet to repay"
          : actionsDisabled
            ? disabledMessage
            : "Repay debt",
    });
  }

  if (showMoveButton) {
    actionButtons.push({
      key: "move",
      label: "Move",
      icon: <FiRepeat className="w-4 h-4" />,
      onClick: moveModal.open,
      disabled: !hasBalance || !isWalletConnected || actionsDisabled,
      className: hasBetterRate ? "btn-secondary" : "btn-outline",
      ariaLabel: "Move",
      title:
        !isWalletConnected
          ? "Connect wallet to move debt"
          : actionsDisabled
            ? disabledMessage
            : "Move debt to another protocol",
    });
  }

  if (showBorrowButton) {
    actionButtons.push({
      key: "borrow",
      label: borrowCtaLabel ?? "Borrow",
      icon: <FiPlus className="w-4 h-4" />,
      onClick: handleBorrowClick,
      disabled: !isWalletConnected || actionsDisabled,
      className: "btn-primary",
      ariaLabel: "Borrow",
      title:
        !isWalletConnected
          ? "Connect wallet to borrow"
          : actionsDisabled
            ? disabledMessage
            : "Borrow more tokens",
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
      <span className="ml-2 font-semibold text-lg truncate">{name}</span>
      {showInfoDropdown && (
        <PositionInfoDropdown
          name={name}
          protocolName={protocolName}
          tokenAddress={tokenAddress}
          typeLabel="Borrow Position"
          extraDetails=
            {collateralValue
              ? (
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
                )
              : null}
        />
      )}
    </>
  );

  const statsContent = (
    <>
      {!hideBalanceColumn && (
        <div className="px-2 border-r border-base-300">
          <div className="text-sm text-base-content/70 overflow-hidden h-6">Balance</div>
          <div className="text-sm font-medium h-6 line-clamp-1">
            {showNoDebtLabel ? (
              <span className="text-base-content/70">No debt</span>
            ) : (
              <FiatBalance
                tokenAddress={tokenAddress}
                rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
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
    </>
  );

  const indicatorContent = (
    <>
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
      {hasAnyActions ? <PositionToggleIndicator isExpanded={isExpanded} /> : null}
    </>
  );

  const footer =
    collateralView && isExpanded ? (
      <div className="overflow-hidden transition-all duration-300 mt-2">
        <div className="py-2">{collateralViewWithVisibility}</div>
      </div>
    ) : null;

  const commonBorrowModalProps = {
    isOpen: borrowModal.isOpen,
    onClose: borrowModal.close,
    token: tokenInfo,
    protocolName,
    currentDebt: debtAmount,
    position,
  };

  const commonRepayModalProps = {
    isOpen: repayModal.isOpen,
    onClose: repayModal.close,
    token: tokenInfo,
    protocolName,
    debtBalance: debtBalanceBigInt,
    position,
  };

  const moveModalElement =
    networkType === "starknet" ? (
      <MovePositionModalStark
        isOpen={moveModal.isOpen}
        onClose={moveModal.close}
        fromProtocol={protocolName}
        position={{
          name,
          balance: debtBalanceBigInt,
          type: "borrow",
          tokenAddress,
          decimals: tokenDecimals ?? 18,
          poolId: movePoolId,
        }}
        preSelectedCollaterals={moveSupport?.preselectedCollaterals}
        disableCollateralSelection={moveSupport?.disableCollateralSelection}
      />
    ) : (
      <MovePositionModal
        isOpen={moveModal.isOpen}
        onClose={moveModal.close}
        fromProtocol={protocolName}
        position={{
          name,
          balance: balance ?? 0,
          type: "borrow",
          tokenAddress,
          decimals: tokenDecimals || 18,
        }}
      />
    );

  const modals =
    networkType === "starknet" ? (
      <>
        <BorrowModalStark {...commonBorrowModalProps} vesuContext={vesuContext?.borrow} />
        <RepayModalStark {...commonRepayModalProps} vesuContext={vesuContext?.repay} />
        {moveModalElement}
      </>
    ) : (
      <>
        <BorrowModal {...commonBorrowModalProps} />
        <RepayModal {...commonRepayModalProps} />
        {moveModalElement}
      </>
    );

  return (
    <>
      <PositionCard
        isExpanded={isExpanded}
        canToggle={hasAnyActions}
        onToggle={toggleExpanded}
        containerClassName={containerClassName}
        header={headerContent}
        stats={statsContent}
        statsClassName={hideBalanceColumn ? "grid-cols-2" : "grid-cols-3"}
        indicator={indicatorContent}
        actionSection={actionSection}
        footer={footer}
      />

      {/* Modals */}
      {modals}
    </>
  );
};
