import { FC, ReactNode } from "react";
import Image from "next/image";
import clsx from "clsx";
import { FiatBalance } from "./FiatBalance";
import { ProtocolPosition } from "./ProtocolView";
import { DepositModal } from "./modals/DepositModal";
import { WithdrawModal } from "./modals/WithdrawModal";
import { MoveSupplyModal } from "./modals/MoveSupplyModal";
import { DepositModalStark } from "./modals/stark/DepositModalStark";
import { WithdrawModalStark } from "./modals/stark/WithdrawModalStark";
import { ChevronDownIcon, ChevronUpIcon, InformationCircleIcon, PlusIcon, MinusIcon, ArrowPathIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { getProtocolLogo as getProtocolLogoUtil } from "~~/utils/protocol";
import { useModal, useToggle } from "~~/hooks/useModal";
import { useOptimalRate } from "~~/hooks/useOptimalRate";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import formatPercentage from "~~/utils/formatPercentage";
import { PositionManager } from "~~/utils/position";
import { SegmentedActionBar } from "./common/SegmentedActionBar";

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
  const expanded = useToggle(defaultExpanded);
  const isExpanded = controlledExpanded ?? expanded.isOpen;

  const usdPrice = tokenPrice ? Number(tokenPrice) / 1e8 : 0;
  // const supplyAmount = tokenBalance ? Number(tokenBalance) / 10 ** (tokenDecimals || 18) : 0;

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

  // const formatNumber = (num: number) =>
  //   new Intl.NumberFormat("en-US", {
  //     minimumFractionDigits: 2,
  //     maximumFractionDigits: 2,
  //   }).format(Math.abs(num));

  // Use shared resolver to support keys like "vesu_v2"
  const getProtocolLogo = (protocol: string) => getProtocolLogoUtil(protocol);

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

  // const actionGridClass =
  //   visibleActionCount === 1 ? "grid-cols-1" : visibleActionCount === 2 ? "grid-cols-2" : "grid-cols-3";

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
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      expanded.toggle();
    }
  };

  const defaultInfoButton = (
    <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0">
      <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
        <InformationCircleIcon className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors" aria-hidden="true" />
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

  const baseStatColumns = hideBalanceColumn ? 2 : 3;
  const totalStatColumns = baseStatColumns + extraStats.length;
  const statColumnClassMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  const statGridClass = statColumnClassMap[totalStatColumns] ?? "grid-cols-3";

  const statColumns: Array<{ key: string; content: ReactNode; hasBorder?: boolean }> = [];

  if (!hideBalanceColumn) {
    statColumns.push({
      key: "balance",
      hasBorder: true,
      content: (
        <>
          <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Balance</div>
          <div className="text-xs font-mono font-semibold tabular-nums">
            <FiatBalance
              tokenAddress={tokenAddress}
              rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
              price={tokenPrice}
              decimals={tokenDecimals}
              tokenSymbol={name}
              className="text-success"
            />
          </div>
        </>
      ),
    });
  }

  statColumns.push({
    key: "apy",
    hasBorder: true,
    content: (
      <>
        <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">APY</div>
        <div className="text-xs font-mono font-semibold tabular-nums text-base-content">
          {formatPercentage(currentRate)}%
        </div>
      </>
    ),
  });

  statColumns.push({
    key: "best-apy",
    content: (
      <>
        <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">Best APY</div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-semibold tabular-nums text-success">
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
      </>
    ),
  });

  extraStats.forEach((stat, index) => {
    const isLast = index === extraStats.length - 1;
    statColumns.push({
      key: `extra-${index}`,
      hasBorder: !isLast,
      content: (
        <>
          <div className="text-[10px] uppercase tracking-widest text-base-content/40 font-medium mb-0.5">{stat.label}</div>
          <div className="text-xs font-mono font-semibold tabular-nums">{stat.value}</div>
        </>
      ),
    });
  });

  return (
    <>
      {/* Container */}
      <div
        className={clsx(
          "w-full bg-base-200/30 border border-base-300/40 transition-colors duration-200",
          isExpanded && hasAnyActions ? "px-4 sm:px-5 pt-4 pb-0" : "p-4 sm:p-5",
          hasAnyActions ? "cursor-pointer hover:bg-base-200/50" : "cursor-default",
          // Only apply rounded-xl if containerClassName doesn't override it
          !containerClassName?.includes("rounded") && "rounded-xl",
          containerClassName
        )}
        onClick={toggleExpanded}
      >
        {/* Mobile Layout (< md) - single row, spread out */}
        <div className="md:hidden flex items-center gap-2 sm:gap-3">
          {/* Token icon + name */}
          <div className="flex items-center gap-1.5 flex-shrink-0" title={name}>
            <div className="w-7 h-7 relative rounded-lg bg-gradient-to-br from-base-200 to-base-300/50 p-0.5 ring-1 ring-base-300/50 flex-shrink-0">
              <Image src={icon} alt={`${name} icon`} fill className="rounded object-contain" />
            </div>
            <span className="font-bold text-sm tracking-tight leading-none truncate max-w-[100px]" title={name}>
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
                  <FiatBalance
                    tokenAddress={tokenAddress}
                    rawValue={typeof tokenBalance === "bigint" ? tokenBalance : BigInt(tokenBalance || 0)}
                    price={tokenPrice}
                    decimals={tokenDecimals}
                    tokenSymbol={name}
                    className="text-success"
                  />
                </div>
              </div>
            )}
            <div className="flex flex-col items-center text-center">
              <div className="text-[8px] uppercase tracking-widest text-base-content/40 font-medium">APY</div>
              <div className="text-[11px] font-mono font-semibold tabular-nums text-base-content">
                {formatPercentage(currentRate)}%
              </div>
            </div>
            {/* Best APY - hidden on very narrow screens */}
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
          
          {/* Expand indicator */}
          {hasAnyActions && showExpandIndicator && (
            <div
              className={`flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 ${isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                } transition-all duration-200`}
            >
              {isExpanded ? (
                <ChevronUpIcon className="w-3 h-3 text-primary" />
              ) : (
                <ChevronDownIcon className="w-3 h-3 text-base-content/50" />
              )}
            </div>
          )}
        </div>

        {/* Desktop Layout (>= md) */}
        <div className="hidden md:grid md:grid-cols-12 relative gap-0">
          {/* Token */}
          <div className="md:col-span-3 flex items-center min-w-0">
            <div className="w-10 h-10 relative min-w-[40px] min-h-[40px] rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-1.5 ring-1 ring-base-300/50">
              <Image src={icon} alt={`${name} icon`} fill className="rounded-lg object-contain" />
            </div>
            <div className="ml-3 flex items-center gap-1.5 min-w-0">
              <div className="flex flex-col min-w-0">
                {renderName ? (
                  <>{renderName(name)}</>
                ) : (
                  <>
                    <span className="font-bold text-base tracking-tight truncate leading-tight" title={name}>{name}</span>
                    {subtitle ? (
                      <span className="text-[10px] uppercase tracking-wider text-base-content/40 truncate leading-tight">{subtitle}</span>
                    ) : null}
                  </>
                )}
              </div>
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
            className={`md:col-span-8 grid gap-0 items-center ${statGridClass}`}
          >
            {statColumns.map((column, index) => {
              const isLast = index === statColumns.length - 1;
              const borderClass = !isLast && column.hasBorder !== false ? "border-r border-base-300/50" : "";
              return (
                <div key={column.key} className={`px-3 ${borderClass}`}>
                  {column.content}
                </div>
              );
            })}
          </div>

          {/* Expand Indicator */}
          <div className="md:col-span-1 flex items-center justify-end">
            {hasAnyActions && showExpandIndicator && (
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-lg ${isExpanded ? "bg-primary/20 ring-1 ring-primary/30" : "bg-base-300/30"
                  } transition-all duration-200`}
              >
                {isExpanded ? (
                  <ChevronUpIcon className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-base-content/50" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Only visible when expanded */}
        {isExpanded && hasAnyActions && (
          <div className="-mx-4 mt-3 pt-2 border-t border-base-300/50" onClick={e => e.stopPropagation()}>
            {/* Unified segmented bar - centered */}
            <div className="flex justify-center w-full pb-0">
              <SegmentedActionBar
                autoCompact
                className="w-full"
                actions={[
                  ...(showDepositButton
                    ? [{ key: "deposit", label: "Deposit", icon: <PlusIcon className="w-4 h-4" />, onClick: handleDepositClick, disabled: !isWalletConnected || actionsDisabled, title: !isWalletConnected ? "Connect wallet to deposit" : actionsDisabled ? disabledMessage : "Deposit tokens", variant: "ghost" as const }]
                    : []),
                  ...(showWithdrawButton
                    ? [{ key: "withdraw", label: "Withdraw", icon: <MinusIcon className="w-4 h-4" />, onClick: handleWithdrawClick, disabled: !isWalletConnected || !hasBalance || actionsDisabled, title: !isWalletConnected ? "Connect wallet to withdraw" : actionsDisabled ? disabledMessage : !hasBalance ? "No balance to withdraw" : "Withdraw tokens", variant: "ghost" as const }]
                    : []),
                  ...(showMoveButton
                    ? [{ key: "move", label: "Move", icon: <ArrowRightIcon className="w-4 h-4" />, onClick: handleMoveClick, disabled: !isWalletConnected || !hasBalance || actionsDisabled, title: !isWalletConnected ? "Connect wallet to move supply" : actionsDisabled ? disabledMessage : !hasBalance ? "No balance to move" : "Move supply to another protocol", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                  ...(showSwapButton
                    ? [{ key: "swap", label: "Swap", icon: <ArrowPathIcon className="w-4 h-4" />, onClick: handleSwapClick ?? (() => { return; }), disabled: !isWalletConnected || actionsDisabled || !hasBalance, title: !isWalletConnected ? "Connect wallet to swap collateral" : actionsDisabled ? disabledMessage : !hasBalance ? "No collateral to swap" : "Switch collateral token", variant: "ghost" as const, compactOnHover: true }]
                    : []),
                ]}
              />
            </div>
          </div>
        )}

        {isExpanded && actionsDisabled && !suppressDisabledMessage && (
          <div className="mt-3 text-sm text-base-content/50" onClick={e => e.stopPropagation()}>
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
            <PlusIcon className="w-4 h-4" />
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
