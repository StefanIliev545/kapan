import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { ArrowRightIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { SegmentedActionBar } from "../common/SegmentedActionBar";
import { ProtocolLogo, formatProtocolName } from "~~/components/common";
import { PercentInput } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useBatchingPreference } from "~~/hooks/useBatchingPreference";
import { useNetworkSwitch } from "~~/hooks/common";
import { useProtocolRates } from "~~/hooks/kapan/useProtocolRates";
import formatPercentage from "~~/utils/formatPercentage";
import { notification } from "~~/utils/scaffold-eth";

interface MoveSupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    rawBalance: bigint;
    currentRate: number;
    address: string;
    decimals?: number;
    price?: bigint;
  };
  fromProtocol: string;
  chainId?: number;
}

type TxState = "idle" | "pending" | "success" | "error";

export const MoveSupplyModal: FC<MoveSupplyModalProps> = ({
  isOpen,
  onClose,
  token,
  fromProtocol,
  chainId,
}) => {
  const [txState, setTxState] = useState<TxState>("idle");
  const [selectedProtocol, setSelectedProtocol] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const wasOpenRef = useRef(false);

  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Auto-switch network when modal opens
  useNetworkSwitch(isOpen, chainId);

  const { createMoveBuilder, executeFlowBatchedIfPossible } = useKapanRouterV2();
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = useBatchingPreference();
  const { data: rates, isLoading: ratesLoading } = useProtocolRates(token.address);

  const decimals = token.decimals || 18;

  // Utility functions
  const normalizeProtocolName = (protocol: string): string =>
    protocol.toLowerCase().replace(/\s+/g, "").replace(/v\d+/i, "");

  // Filter and sort protocols (exclude current)
  const protocols = useMemo(() =>
    rates
      ?.filter(rate => normalizeProtocolName(rate.protocol) !== normalizeProtocolName(fromProtocol))
      .filter(rate => normalizeProtocolName(rate.protocol) !== "zerolend")
      .sort((a, b) => b.supplyRate - a.supplyRate) || [],
    [rates, fromProtocol]
  );

  // Auto-select best protocol
  useEffect(() => {
    if (protocols.length === 0) return;
    const hasSelection = protocols.some(p => p.protocol === selectedProtocol);
    if (!selectedProtocol || !hasSelection) {
      setSelectedProtocol(protocols[0].protocol);
    }
  }, [protocols, selectedProtocol]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setTxState("idle");
      setAmount("");
      setIsMax(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const selectedRate = protocols.find(p => p.protocol === selectedProtocol)?.supplyRate || 0;
  const rateDifference = selectedRate - token.currentRate;
  const isRateImprovement = rateDifference > 0;

  // Calculate USD value
  const parsedAmount = parseFloat(amount || "0");
  const usdValue = useMemo(() => {
    if (!token.price || parsedAmount <= 0) return 0;
    return parsedAmount * Number(formatUnits(token.price, 8));
  }, [token.price, parsedAmount]);

  // Calculate annual yield difference
  const annualYieldDiff = useMemo(() => {
    if (parsedAmount <= 0) return 0;
    const currentYield = usdValue * (token.currentRate / 100);
    const newYield = usdValue * (selectedRate / 100);
    return newYield - currentYield;
  }, [usdValue, token.currentRate, selectedRate, parsedAmount]);

  const handlePercentChange = useCallback((val: string, maxed: boolean) => {
    setAmount(val);
    setIsMax(maxed);
  }, []);

  const handleMove = useCallback(async () => {
    if (txState === "success") {
      onClose();
      return;
    }

    if (!selectedProtocol || !address) return;

    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }

      setTxState("pending");

      const builder = createMoveBuilder();
      const normalizedFromProtocol = normalizeProtocolName(fromProtocol);
      const normalizedToProtocol = normalizeProtocolName(selectedProtocol);

      // For Compound, set the market
      if (normalizedFromProtocol === "compound" || normalizedToProtocol === "compound") {
        builder.setCompoundMarket(token.address as `0x${string}`);
      }

      // Build move instruction
      builder.buildMoveCollateral({
        fromProtocol: fromProtocol,
        toProtocol: selectedProtocol,
        collateralToken: token.address as `0x${string}`,
        withdraw: isMax ? { max: true } : { amount },
        collateralDecimals: decimals,
      });

      await executeFlowBatchedIfPossible(builder.build(), preferBatching);

      setTxState("success");
      notification.success("Position moved successfully!");
    } catch (error) {
      console.error("Error moving position:", error);
      setTxState("error");
      notification.error(`Failed to move position: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    txState,
    selectedProtocol,
    address,
    chainId,
    chain?.id,
    switchChain,
    createMoveBuilder,
    fromProtocol,
    token.address,
    isMax,
    amount,
    decimals,
    executeFlowBatchedIfPossible,
    preferBatching,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    setAmount("");
    setIsMax(false);
    setTxState("idle");
    onClose();
  }, [onClose]);

  // Validation
  const canSubmit = useMemo(() => {
    if (!selectedProtocol || !address) return false;
    if (parsedAmount <= 0) return false;
    return true;
  }, [selectedProtocol, address, parsedAmount]);

  const isConfirmDisabled = txState === "pending" || (txState !== "success" && !canSubmit);

  // Action bar
  const actionBarActions = useMemo(() => {
    const pendingIcon = <span className="loading loading-spinner loading-xs" />;
    return [
      {
        key: txState === "success" ? "close" : "move",
        label: txState === "pending" ? "Moving..." : txState === "success" ? "Close" : txState === "error" ? "Retry" : "Move Supply",
        icon: txState === "pending" ? pendingIcon : undefined,
        onClick: handleMove,
        disabled: isConfirmDisabled,
        variant: "ghost" as const,
      },
    ];
  }, [txState, handleMove, isConfirmDisabled]);

  // Success/Error content
  if (txState === "success" || txState === "error") {
    const isSuccess = txState === "success";
    return (
      <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
        <div className="modal-box bg-base-100 border-base-300/50 relative max-w-md rounded-xl border p-6">
          <div className="flex flex-col items-center text-center">
            <div className={`mb-4 rounded-full p-3 ${isSuccess ? "bg-success/15" : "bg-error/15"}`}>
              {isSuccess ? (
                <CheckCircleIcon className="text-success size-12" />
              ) : (
                <XCircleIcon className="text-error size-12" />
              )}
            </div>
            <h3 className="text-lg font-semibold">
              {isSuccess ? "Position Moved Successfully" : "Transaction Failed"}
            </h3>
            <p className="text-base-content/70 mt-2 text-sm">
              {isSuccess
                ? `Your ${token.name} has been moved from ${formatProtocolName(fromProtocol)} to ${formatProtocolName(selectedProtocol)}.`
                : "There was an error moving your position. Please try again."}
            </p>
            <div className="mt-6 flex w-full gap-3">
              {!isSuccess && (
                <button className="btn btn-outline flex-1" onClick={handleClose}>
                  Cancel
                </button>
              )}
              <button
                className={`btn flex-1 ${isSuccess ? "btn-primary" : "btn-primary"}`}
                onClick={isSuccess ? handleClose : handleMove}
              >
                {isSuccess ? "Close" : "Try Again"}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    );
  }

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="modal-box bg-base-100 border-base-300/50 relative max-w-lg rounded-xl border p-5">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src={token.icon} alt={token.name} width={28} height={28} className="rounded-full" />
            <div>
              <h3 className="text-base-content text-lg font-semibold">Move {token.name}</h3>
              <div className="text-base-content/50 text-xs">
                From {formatProtocolName(fromProtocol)} · {formatPercentage(token.currentRate)}% APY
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-base-content/40 hover:text-base-content rounded p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Amount Input */}
          <div>
            <div className="text-base-content/70 mb-2 flex items-center justify-between text-xs">
              <span>Amount to move</span>
              <span>
                Balance: {Number(formatUnits(token.rawBalance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </span>
            </div>
            <PercentInput
              balance={token.rawBalance}
              decimals={decimals}
              price={token.price ? Number(formatUnits(token.price, 8)) : 0}
              onChange={handlePercentChange}
              resetTrigger={isOpen}
            />
          </div>

          {/* Destination Protocol */}
          <div>
            <div className="text-base-content/70 mb-2 flex items-center justify-between text-xs">
              <span>Move to</span>
              {selectedProtocol && (
                <span className={`badge badge-sm ${isRateImprovement ? "badge-success" : rateDifference < 0 ? "badge-error" : "badge-ghost"}`}>
                  {isRateImprovement ? `+${formatPercentage(rateDifference)}%` : rateDifference < 0 ? `${formatPercentage(rateDifference)}%` : "Same rate"}
                </span>
              )}
            </div>
            {ratesLoading ? (
              <div className="bg-base-200/50 flex h-14 items-center justify-center rounded-lg">
                <span className="loading loading-spinner loading-sm" />
              </div>
            ) : (
              <div className="bg-base-200/50 border-base-300/50 grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-3">
                {protocols.map(({ protocol, supplyRate, isOptimal }) => {
                  const isSelected = protocol === selectedProtocol;
                  const isBetter = supplyRate > token.currentRate;
                  return (
                    <button
                      key={protocol}
                      type="button"
                      onClick={() => setSelectedProtocol(protocol)}
                      className={`flex items-center gap-2 rounded-lg p-2 transition-colors ${
                        isSelected
                          ? "bg-primary/15 border-primary border"
                          : "hover:bg-base-300/50 border border-transparent"
                      }`}
                    >
                      <ProtocolLogo protocolName={protocol} size="sm" rounded="full" />
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate text-xs font-medium">{formatProtocolName(protocol)}</div>
                        <div className={`text-xs ${isBetter ? "text-success" : "text-base-content/60"}`}>
                          {formatPercentage(supplyRate)}%
                          {isOptimal && <span className="ml-1">★</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rate Comparison */}
          {selectedProtocol && parsedAmount > 0 && (
            <div className="bg-base-200/30 border-base-300/50 rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base-content/70">{formatPercentage(token.currentRate)}%</span>
                  <ArrowRightIcon className="text-base-content/40 size-4" />
                  <span className={isRateImprovement ? "text-success font-medium" : "text-base-content"}>
                    {formatPercentage(selectedRate)}%
                  </span>
                </div>
                <div className={`text-xs ${annualYieldDiff >= 0 ? "text-success" : "text-error"}`}>
                  {annualYieldDiff >= 0 ? "+" : ""}${annualYieldDiff.toFixed(2)}/year
                </div>
              </div>
            </div>
          )}

          {/* Batching Option */}
          {isPreferenceLoaded && (
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={preferBatching}
                onChange={e => setPreferBatching(e.target.checked)}
                className="checkbox checkbox-sm checkbox-primary"
              />
              <div className="flex flex-col">
                <span className="text-sm">Batch with Smart Account</span>
                <span className="text-base-content/50 text-xs">Reduce signing steps when supported</span>
              </div>
            </label>
          )}

          {/* Action Button */}
          <SegmentedActionBar
            className="w-full"
            autoCompact
            actions={actionBarActions}
          />
        </div>
      </div>
    </dialog>
  );
};
