import { FC, ReactNode } from "react";
import Image from "next/image";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { DepositModal } from "./modals/DepositModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";
import { DepositModalStark } from "./modals/stark/DepositModalStark";
import { WithdrawModalStark } from "./modals/stark/WithdrawModalStark";
import { FiChevronDown, FiChevronUp, FiInfo, FiPlus, FiMinus, FiRepeat, FiArrowRight } from "react-icons/fi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { SegmentedActionBar } from "./common/SegmentedActionBar";

// SupplyPositionProps extends ProtocolPosition but can add supply-specific props
export type SupplyPositionProps = ProtocolPosition & {
  protocolName: string;
  afterInfoContent?: ReactNode;
  renderName?: (name: string) => ReactNode;
  networkType: "evm" | "starknet";
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
  showQuickDepositButton?: boolean;
  showInfoDropdown?: boolean;
  extraActions?: ReactNode;
};

export const SupplyPosition: FC<SupplyPositionProps> = ({
  icon,
  name,
  balance,
  tokenBalance,
  currentRate,
  protocolName,
  tokenAddress,
  tokenPrice,
  tokenDecimals,
  afterInfoContent,
  renderName,
  networkType,
  position,
  disableMove = false,
  vesuContext,
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
  showQuickDepositButton = false,
  showInfoDropdown = false,
  extraActions,
}) => {
  const moveModal = useModal();
  const depositModal = useModal();
  const withdrawModal = useModal();
  const expanded = useToggle();
  const isExpanded = expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  const supplyAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;

  // Get wallet connection status for both networks
  const { evm, starknet } = useWalletConnection();
  const isWalletConnected = networkType === "evm" ? evm.isConnected : starknet.isConnected;

  // Check if position has a balance
  const hasBalance = tokenBalance > 0;

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

  const formatNumber = (num: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));

  const getProtocolLogo = (protocol: string) => tokenNameToLogo(protocol);

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

  const visibleActionCount = [showDepositButton, showWithdrawButton, showMoveButton, showSwapButton].filter(Boolean).length;
  const hasAnyActions = visibleActionCount > 0;

  const actionGridClass =
    visibleActionCount === 1 ? "grid-cols-1" : visibleActionCount === 2 ? "grid-cols-2" : "grid-cols-3";

  const handleDepositClick = onDeposit ?? depositModal.open;
  const handleWithdrawClick = onWithdraw ?? withdrawModal.open;
  const handleMoveClick = onMove ?? moveModal.open;
  const handleSwapClick = onSwap;

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

  const defaultInfoButton = (
    <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
      <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
        <FiInfo className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors" aria-hidden="true" />
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
            <p className="capitalize">Supply Position</p>
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
        className={`w-full p-3 rounded-md ${
          isExpanded ? "bg-base-300" : "bg-base-200"
        } ${hasAnyActions ? "cursor-pointer hover:bg-primary/10 hover:shadow-md" : "cursor-default"} transition-all duration-200 ${
          containerClassName ?? ""
        }`}
        onClick={toggleExpanded}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 relative">
          {/* Header: Icon and Title */}
          <div className="order-1 lg:order-none lg:col-span-3 flex items-center min-w-0">
            <div className="w-7 h-7 relative min-w-[28px] min-h-[28px]">
              <Image src={icon} alt={`${name} icon`} layout="fill" className="rounded-full" />
            </div>
            <div className="ml-2 flex items-center gap-1 min-w-0">
              <div className="flex flex-col min-w-0">
                {renderName ? (
                  <>{renderName(name)}</>
                ) : (
                  <>
                    <span className="font-semibold text-lg truncate leading-tight">{name}</span>
                    {subtitle ? (
                      <span className="text-xs text-base-content/60 truncate leading-tight">{subtitle}</span>
                    ) : null}
                  </>
                )}
              </div>
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
          </div>

          {/* Expand Indicator */}
          <div className="order-3 lg:order-none lg:col-span-3 flex items-center justify-end">
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
          <div className="mt-3 pt-3 border-t border-base-300" onClick={e => e.stopPropagation()}>
            {/* Unified segmented bar - centered */}
            <div className="flex justify-center">
              <SegmentedActionBar
                actions={[
                  ...(showDepositButton
                    ? [{ key: "deposit", label: "Deposit", icon: <FiPlus className="w-4 h-4" />, onClick: handleDepositClick, disabled: !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to deposit" : actionsDisabled ? disabledMessage : "Deposit tokens", variant: "ghost" as const }]
                    : []),
                  ...(showWithdrawButton
                    ? [{ key: "withdraw", label: "Withdraw", icon: <FiMinus className="w-4 h-4" />, onClick: handleWithdrawClick, disabled: !isWalletConnected || !hasBalance || actionsDisabled, title: !isWalletConnected ? "Connect wallet to withdraw" : actionsDisabled ? disabledMessage : !hasBalance ? "No balance to withdraw" : "Withdraw tokens", variant: "ghost" as const }]
                    : []),
                  ...(showMoveButton
                    ? [{ key: "move", label: "Move", icon: <FiArrowRight className="w-4 h-4" />, onClick: handleMoveClick, disabled: !isWalletConnected || !hasBalance || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move supply" : actionsDisabled ? disabledMessage : !hasBalance ? "No balance to move" : "Move supply to another protocol", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showSwapButton
                    ? [{ key: "swap", label: "Swap", icon: <FiRepeat className="w-4 h-4" />, onClick: handleSwapClick!, disabled: !isWalletConnected || actionsDisabled || !hasBalance, title: !isWalletConnected ? "Connect wallet to swap collateral" : actionsDisabled ? disabledMessage : !hasBalance ? "No collateral to swap" : "Switch collateral token", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                ]}
              />
            </div>
          </div>
        )}

        {isExpanded && actionsDisabled && (
          <div className="mt-3 text-sm text-base-content/70" onClick={e => e.stopPropagation()}>
            {disabledMessage}
          </div>
        )}

        {isExpanded && extraActions && <div className="mt-3" onClick={e => e.stopPropagation()}>{extraActions}</div>}
      </div>

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
