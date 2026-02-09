"use client";

import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@vercel/analytics";
import { formatUnits } from "viem";
import { useAccount as useEvmAccount } from "wagmi";
import { BaseModal } from "./BaseModal";
import { BatchingPreference } from "./common/BatchingPreference";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { TokenPill } from "../common/TokenDisplay";
import { PercentInput } from "./TokenActionModal";
import type { TokenInfo } from "./TokenActionModal";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useTokenPricesByAddress } from "~~/hooks/useTokenPrice";
import { PositionManager } from "~~/utils/position";
import formatPercentage from "~~/utils/formatPercentage";
import { parseAmount, canSubmitForm } from "~~/utils/validation";

interface DepositAndBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  /** The collateral token to deposit */
  collateralToken: TokenInfo;
  /** The debt token to borrow */
  debtToken: TokenInfo;
  /** Pre-encoded protocol context (same context works for both deposit + borrow) */
  context: string;
  /** Max LTV in bps (for slider/validation) */
  maxLtvBps?: number;
  /** Liquidation LTV in bps (for danger zone display) */
  lltvBps?: number;
}

/** LTV color based on utilization of liquidation threshold */
function ltvColor(ltvPercent: number, lltvPercent: number): string {
  if (lltvPercent <= 0) return "text-success";
  const ratio = ltvPercent / lltvPercent;
  if (ratio > 0.7) return "text-error";
  if (ratio > 0.5) return "text-warning";
  return "text-success";
}

export const DepositAndBorrowModal: FC<DepositAndBorrowModalProps> = ({
  isOpen,
  onClose,
  protocolName,
  chainId,
  collateralToken,
  debtToken,
  context,
  maxLtvBps = 7500,
  lltvBps = 8500,
}) => {
  const { buildDepositAndBorrowFlow } = useKapanRouterV2();
  const { address: evmAddress, chain } = useEvmAccount();
  const normalizedProtocolName = protocolName.toLowerCase();

  // Collateral balance — don't pass decimals hint so useTokenBalance always
  // fetches actual decimals from the contract (callers may pass incorrect defaults)
  const { balance: collateralBalance, decimals: collateralDecimalsFetched } = useTokenBalance(
    collateralToken.address,
    "evm",
    chainId,
  );
  const collateralDecimals = collateralDecimalsFetched ?? collateralToken.decimals ?? 18;

  // Fetch prices via API when caller doesn't provide them (usdPrice = 0)
  const priceAddresses = useMemo(
    () => [collateralToken.address, debtToken.address].filter(Boolean),
    [collateralToken.address, debtToken.address],
  );
  const { prices: fetchedPrices } = useTokenPricesByAddress(chainId, priceAddresses, { enabled: isOpen });

  // Input state
  const [collateralAmount, setCollateralAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const wasOpenRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setCollateralAmount("");
      setBorrowAmount("");
      setTxState("idle");
      track("deposit_and_borrow_modal_open", {
        protocol: protocolName,
        collateral: collateralToken.name,
        debt: debtToken.name,
      });
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, protocolName, collateralToken.name, debtToken.name]);

  // Parsed values
  const parsedCollateral = parseFloat(collateralAmount || "0");
  const parsedBorrow = parseFloat(borrowAmount || "0");
  // Price API returns lowercase address keys
  const collateralPrice = collateralToken.usdPrice || fetchedPrices[collateralToken.address.toLowerCase()] || 0;
  const debtPrice = debtToken.usdPrice || fetchedPrices[debtToken.address.toLowerCase()] || 0;
  const debtDecimals = debtToken.decimals || 18;

  // USD values
  const collateralUsd = parsedCollateral * collateralPrice;
  const borrowUsd = parsedBorrow * debtPrice;

  // LTV calculation
  const projectedLtv = collateralUsd > 0 ? (borrowUsd / collateralUsd) * 100 : 0;
  const maxLtvPercent = maxLtvBps / 100;
  const lltvPercent = lltvBps / 100;

  // Position manager for projected state
  const projectedPosition = useMemo(
    () => new PositionManager(collateralUsd, borrowUsd, maxLtvBps),
    [collateralUsd, borrowUsd, maxLtvBps],
  );
  const projectedHf = projectedPosition.healthFactor();

  // Max borrow based on collateral and max LTV
  const maxBorrowUsd = (collateralUsd * maxLtvBps) / 10000;
  const maxBorrowTokens = debtPrice > 0 ? maxBorrowUsd / debtPrice : 0;
  const maxBorrowBigInt = useMemo(() => {
    if (maxBorrowTokens <= 0) return 0n;
    return BigInt(Math.floor(maxBorrowTokens * 10 ** debtDecimals));
  }, [maxBorrowTokens, debtDecimals]);

  // Validation
  const parsedCollateralResult = useMemo(
    () => parseAmount(collateralAmount, collateralDecimals),
    [collateralAmount, collateralDecimals],
  );
  const insufficientCollateral = useMemo(() => {
    if (!parsedCollateralResult.isPositive) return false;
    return (parsedCollateralResult.value ?? 0n) > collateralBalance;
  }, [parsedCollateralResult, collateralBalance]);

  const exceedsMaxLtv = projectedLtv > maxLtvPercent && parsedBorrow > 0;

  const isCorrectChain = !chainId || chain?.id === chainId;
  const isWalletConnected = Boolean(evmAddress);
  const canSubmit = canSubmitForm({
    isAmountPositive: parsedCollateral > 0 && parsedBorrow > 0,
    hasSufficientFunds: !insufficientCollateral,
    isWalletConnected,
    isCorrectChain,
  }) && !exceedsMaxLtv;

  const isConfirmDisabled = txState === "pending" || (txState !== "success" && !canSubmit);

  // Build combined flow: deposit collateral + borrow debt
  // Uses buildDepositAndBorrowFlow which has correct UTXO indices (PushToken references
  // the borrow output at index 2, not index 0 which is the consumed PullToken output)
  const buildFlow = useCallback(
    (/* amount — unused, we use dual-input internal state */) => {
      return buildDepositAndBorrowFlow(
        normalizedProtocolName,
        collateralToken.address,
        collateralAmount,
        collateralDecimals,
        debtToken.address,
        borrowAmount,
        debtDecimals,
        context,
      );
    },
    [
      buildDepositAndBorrowFlow,
      normalizedProtocolName,
      collateralToken.address,
      collateralAmount,
      collateralDecimals,
      debtToken.address,
      borrowAmount,
      debtDecimals,
      context,
    ],
  );

  const { handleConfirm: executeFlow, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Deposit & borrow transaction sent",
    emptyFlowErrorMessage: "Failed to build deposit & borrow instructions",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  const handleClose = useCallback(() => {
    setCollateralAmount("");
    setBorrowAmount("");
    setTxState("idle");
    onClose();
  }, [onClose]);

  const handleCollateralChange = useCallback((val: string) => {
    setCollateralAmount(val);
  }, []);

  const handleBorrowChange = useCallback((val: string) => {
    setBorrowAmount(val);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (txState === "success") {
      handleClose();
      return;
    }
    try {
      setTxState("pending");
      // executeFlow expects (amount, isMax) but we use internal state
      await executeFlow(collateralAmount, false);
      setTxState("success");
    } catch (e) {
      console.error(e);
      setTxState("error");
    }
  }, [txState, handleClose, executeFlow, collateralAmount]);

  // LTV bar width (clamped to 100%)
  const ltvBarWidth = Math.min(100, projectedLtv);
  const ltvBarStyle = useMemo(() => ({ width: `${ltvBarWidth}%` }), [ltvBarWidth]);
  const maxLtvMarkerStyle = useMemo(() => ({ left: `${Math.min(100, maxLtvPercent)}%` }), [maxLtvPercent]);
  const lltvMarkerStyle = useMemo(() => ({ left: `${Math.min(100, lltvPercent)}%` }), [lltvPercent]);

  const actionBarActions = useMemo(
    () => [
      {
        key: txState === "success" ? "close" : "confirm",
        label:
          txState === "pending"
            ? "Submitting..."
            : txState === "success"
              ? "Close"
              : txState === "error"
                ? "Retry"
                : "Deposit & Borrow",
        icon: txState === "pending" ? <span className="loading loading-spinner loading-xs" /> : undefined,
        onClick: handleConfirm,
        disabled: isConfirmDisabled,
        variant: "ghost" as const,
      },
    ],
    [txState, handleConfirm, isConfirmDisabled],
  );

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={`Open Position · ${protocolName}`} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Collateral Section */}
        <div className="bg-base-200/50 rounded-lg p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src={collateralToken.icon} alt={collateralToken.name} width={20} height={20} className="rounded-full" />
              <span className="text-sm font-medium">Deposit {collateralToken.name}</span>
            </div>
            <span className="text-base-content/50 text-xs">
              Balance: {Number(formatUnits(collateralBalance, collateralDecimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })}
            </span>
          </div>
          <PercentInput
            balance={collateralBalance}
            decimals={collateralDecimals}
            price={collateralPrice}
            onChange={handleCollateralChange}
            resetTrigger={isOpen}
            insufficientFunds={insufficientCollateral}
          />
        </div>

        {/* Borrow Section */}
        <div className="bg-base-200/50 rounded-lg p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src={debtToken.icon} alt={debtToken.name} width={20} height={20} className="rounded-full" />
              <span className="text-sm font-medium">Borrow {debtToken.name}</span>
            </div>
            <span className="text-base-content/50 text-xs">
              APR {formatPercentage(debtToken.currentRate)}%
            </span>
          </div>
          <PercentInput
            balance={maxBorrowBigInt}
            decimals={debtDecimals}
            price={debtPrice}
            onChange={handleBorrowChange}
            percentBase={maxBorrowBigInt}
            max={maxBorrowBigInt}
            resetTrigger={isOpen}
          />
          {exceedsMaxLtv && (
            <div className="mt-1 text-center text-error text-xs">
              Exceeds max LTV ({formatPercentage(maxLtvPercent)}%)
            </div>
          )}
        </div>

        {/* LTV Bar */}
        <div className="space-y-1 px-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50">Loan To Value</span>
            <span className={`font-mono font-semibold ${ltvColor(projectedLtv, lltvPercent)}`}>
              {formatPercentage(projectedLtv)}%
            </span>
          </div>
          <div className="relative">
            <div className="bg-base-300 h-2 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all ${ltvColor(projectedLtv, lltvPercent).replace("text-", "bg-")}`}
                style={ltvBarStyle}
              />
            </div>
            {/* Max LTV marker */}
            <div className="absolute top-0 h-2 w-0.5 bg-warning/60" style={maxLtvMarkerStyle} title={`Max LTV: ${formatPercentage(maxLtvPercent)}%`} />
            {/* LLTV marker */}
            <div className="absolute top-0 h-2 w-0.5 bg-error/60" style={lltvMarkerStyle} title={`Liquidation: ${formatPercentage(lltvPercent)}%`} />
          </div>
          <div className="flex justify-between text-[10px] text-base-content/40">
            <span>0%</span>
            <span>Max {formatPercentage(maxLtvPercent)}%</span>
            <span>Liq {formatPercentage(lltvPercent)}%</span>
          </div>
        </div>

        {/* Projected Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="text-base-content/50">Health Factor</div>
            <div className={`font-mono font-semibold ${
              !Number.isFinite(projectedHf) || projectedHf >= 4 ? "text-success" :
              projectedHf > 2 ? "text-warning" : "text-error"
            }`}>
              {parsedBorrow > 0 ? (Number.isFinite(projectedHf) ? projectedHf.toFixed(2) : "\u221e") : "\u221e"}
            </div>
          </div>
          <div className="border-base-300 border-l">
            <div className="text-base-content/50">Collateral</div>
            <TokenPill value={parsedCollateral} icon={collateralToken.icon} name={collateralToken.name} />
          </div>
          <div className="border-base-300 border-l">
            <div className="text-base-content/50">Debt</div>
            <TokenPill value={parsedBorrow} icon={debtToken.icon} name={debtToken.name} />
          </div>
        </div>

        {/* Batching Preference */}
        <BatchingPreference enabled={preferBatching} setEnabled={setPreferBatching} isLoaded={isPreferenceLoaded} />

        {/* Confirm */}
        <SegmentedActionBar className="w-full" autoCompact actions={actionBarActions} />
      </div>
    </BaseModal>
  );
};
