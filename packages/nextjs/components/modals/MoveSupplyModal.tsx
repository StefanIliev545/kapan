import { ChangeEvent, FC, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { base, linea } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { ArrowRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import { BaseModal } from "./BaseModal";
import { FiatBalance } from "~~/components/FiatBalance";
import { LoadingSpinner } from "~~/components/common/Loading";
import { ProtocolLogo, ProtocolDropdownItem, formatProtocolName } from "~~/components/common";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useBatchingPreference } from "~~/hooks/useBatchingPreference";
import { useNetworkSwitch } from "~~/hooks/common";
import { useProtocolRates } from "~~/hooks/kapan/useProtocolRates";
import formatPercentage from "~~/utils/formatPercentage";
import { notification } from "~~/utils/scaffold-eth";
import { createCheckboxHandler } from "~~/utils/handlers";

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

enum MoveStatus {
  Initial,
  Executing,
  Success,
  Error,
}

export const MoveSupplyModal: FC<MoveSupplyModalProps> = ({ isOpen, onClose, token, fromProtocol, chainId }) => {
  const [status, setStatus] = useState<MoveStatus>(MoveStatus.Initial);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<string>("");
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [transferAmount, setTransferAmount] = useState<bigint>(token.rawBalance);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusingRef = useRef<boolean>(false);
  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Auto-switch network when modal opens
  useNetworkSwitch(isOpen, chainId);

  const { createMoveBuilder, executeFlowBatchedIfPossible } = useKapanRouterV2();
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = useBatchingPreference();
  const { data: rates, isLoading: ratesLoading } = useProtocolRates(token.address);

  // Update transferAmount when token balance changes
  useEffect(() => {
    setTransferAmount(token.rawBalance);
  }, [token.rawBalance]);

  // Utility functions
  const normalizeProtocolName = (protocol: string): string =>
    protocol.toLowerCase().replace(/\s+/g, "").replace(/v\d+/i, "");

  const formatRate = (rate: number): string => `${formatPercentage(rate)}%`;

  const formatInputValue = (value: bigint): string => {
    const decimals = token.decimals || 18;
    return formatUnits(value, decimals);
  };

  // Set input value when entering edit mode and handle focusing
  useEffect(() => {
    if (isEditingAmount) {
      setInputValue(formatInputValue(transferAmount));

      // Only try to focus once when we first enter edit mode
      if (isFocusingRef.current && inputRef.current) {
        isFocusingRef.current = false;

        // Focus immediately and also with a small delay as backup
        inputRef.current.focus();
        // Also set selection range immediately
        const valueLength = inputRef.current.value.length;
        inputRef.current.setSelectionRange(valueLength, valueLength);

        // And add a backup focus after a small delay
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const valueLength = inputRef.current.value.length;
            inputRef.current.setSelectionRange(valueLength, valueLength);
          }
        });
      }
    }
  }, [isEditingAmount, transferAmount, formatInputValue]);

  // Move these handlers out of the render function and memoize them
  const handleAmountChangeCallback = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    // Allow free text editing without validation
    const value = e.target.value;

    // Only allow numbers and a single decimal point
    if (!/^[0-9]*\.?[0-9]*$/.test(value)) return;

    // Update the input value without re-focusing
    setInputValue(value);
  }, []);

  const handleSetMaxAmountCallback = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setInputValue(formatInputValue(token.rawBalance));
      setTransferAmount(token.rawBalance);
    },
    [token.rawBalance, formatInputValue],
  );

  const handleFinishEditingCallback = useCallback(() => {
    try {
      // Only now parse and validate the amount
      if (inputValue) {
        const decimals = token.decimals || 18;
        const parsedValue = parseUnits(inputValue, decimals);

        // Check if value exceeds balance
        if (parsedValue > token.rawBalance) {
          setTransferAmount(token.rawBalance);
          // No need to update input value as we're exiting edit mode
        } else {
          setTransferAmount(parsedValue);
        }
      } else {
        // If empty input, set to zero
        setTransferAmount(0n);
      }
    } catch (error) {
      console.error("Error parsing amount:", error);
      // If parsing fails, revert to previous amount
      setInputValue(formatInputValue(transferAmount));
    }

    setIsEditingAmount(false);
  }, [inputValue, token.decimals, token.rawBalance, transferAmount, formatInputValue]);

  const handleKeyPressCallback = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleFinishEditingCallback();
    },
    [handleFinishEditingCallback],
  );

  const calculateAnnualYield = (): {
    newYield: string;
    currentYield: string;
    isImprovement: boolean;
  } => {
    try {
      if (!transferAmount || transferAmount === 0n) {
        return { newYield: "$0.00", currentYield: "$0.00", isImprovement: false };
      }
      const decimals = token.decimals || 18;
      let balanceInUsd = 0;
      if (token.price) {
        const numerator = transferAmount * token.price;
        const denominator = BigInt(10) ** BigInt(decimals) * 100000000n;
        balanceInUsd = Number(numerator / denominator);
      } else {
        balanceInUsd = Number(transferAmount) / 10 ** decimals;
      }
      const newAnnualYield = balanceInUsd * (selectedRate / 100);
      const currentAnnualYield = balanceInUsd * (token.currentRate / 100);
      return {
        newYield: `$${newAnnualYield.toFixed(2)}`,
        currentYield: `$${currentAnnualYield.toFixed(2)}`,
        isImprovement: newAnnualYield > currentAnnualYield,
      };
    } catch (error) {
      console.error("Error calculating yield:", error);
      return { newYield: "$0.00", currentYield: "$0.00", isImprovement: false };
    }
  };

  const handleMove = async () => {
    if (!selectedProtocol || !address) return;
    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          notification.error("Please switch to the selected network to proceed");
          return;
        }
      }
      setStatus(MoveStatus.Executing);
      
      // Create move builder
      const builder = createMoveBuilder();
      
      // Normalize protocol names
      const normalizedFromProtocol = normalizeProtocolName(fromProtocol);
      const normalizedToProtocol = normalizeProtocolName(selectedProtocol);
      
      // For Compound, set the market (token address = market for supply positions)
      if (normalizedFromProtocol === "compound" || normalizedToProtocol === "compound") {
        builder.setCompoundMarket(token.address as `0x${string}`);
      }
      
      // Check if moving max amount
      const isMax = transferAmount === token.rawBalance;
      const decimals = token.decimals || 18;
      
      // Build move collateral instruction (withdraw from source, deposit to target)
      builder.buildMoveCollateral({
        fromProtocol: fromProtocol,
        toProtocol: selectedProtocol,
        collateralToken: token.address as `0x${string}`,
        withdraw: isMax ? { max: true } : { amount: formatUnits(transferAmount, decimals) },
        collateralDecimals: decimals,
      });
      
      // Execute the flow with automatic approvals (batched when supported)
      const result = await executeFlowBatchedIfPossible(builder.build(), preferBatching);
      
      // Extract hash/id from result (batch id or tx hash)
      const txHash = result?.kind === "tx" ? result.hash : result?.kind === "batch" ? result.id : undefined;
      setTransactionHash(txHash ? txHash : null);
      setStatus(MoveStatus.Success);
      notification.success("Position moved successfully!");
    } catch (error) {
      console.error("Error moving position:", error);
      setStatus(MoveStatus.Error);
      notification.error(`Failed to move position: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const resetModal = () => {
    setStatus(MoveStatus.Initial);
    setTransactionHash(null);
    setSelectedProtocol("");
    setIsEditingAmount(false);
    setTransferAmount(token.rawBalance);
    setInputValue("");
    onClose();
  };

  // Filter and sort protocols (exclude current)
  const isZerolendSupported = useMemo(() => chainId === base.id || chainId === linea.id, [chainId]);

  const protocols =
    rates
      ?.filter(rate => normalizeProtocolName(rate.protocol) !== normalizeProtocolName(fromProtocol))
      .filter(rate => (normalizeProtocolName(rate.protocol) === "zerolend" ? isZerolendSupported : true))
      .sort((a, b) => b.supplyRate - a.supplyRate) || [];

  useEffect(() => {
    if (protocols.length === 0) return;
    const hasSelection = protocols.some(p => p.protocol === selectedProtocol);
    if (!selectedProtocol || !hasSelection) {
      setSelectedProtocol(protocols[0].protocol);
    }
  }, [protocols, selectedProtocol]);

  const selectedRate = protocols.find(p => p.protocol === selectedProtocol)?.supplyRate || 0;
  const rateDifference = selectedRate - token.currentRate;
  const isRateImprovement = rateDifference > 0;

  // --- Create proper memoized component functions ---

  const AmountInputComponent = useCallback(() => {
    const startEditing = () => {
      if (!isEditingAmount) {
        isFocusingRef.current = true;
        setIsEditingAmount(true);
      }
    };

    return (
      <div
        className={`border-base-300/60 bg-base-100/80 rounded-2xl border p-4 shadow-sm transition-colors ${
          !isEditingAmount ? "hover:border-primary/40 hover:bg-base-100" : "ring-primary/20 ring-1"
        }`}
        onClick={startEditing}
      >
        {isEditingAmount ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-base-content/90 text-sm font-semibold">Transfer amount</span>
              <div className="text-base-content/70 min-w-[80px] text-right text-xs">
                <FiatBalance
                  tokenAddress={token.address}
                  rawValue={transferAmount}
                  decimals={token.decimals || 18}
                  price={token.price || BigInt(100000000)}
                  showCurrencySymbol={true}
                  showRawOnHover={false}
                />
              </div>
            </div>

            <div className="bg-base-100 focus-within:border-primary focus-within:ring-primary/20 flex h-12 w-full items-center overflow-hidden rounded-xl border focus-within:ring-2">
              <input
                ref={inputRef}
                type="text"
                className="h-full flex-grow border-none bg-transparent px-4 text-lg outline-none focus:outline-none"
                value={inputValue}
                onChange={handleAmountChangeCallback}
                onBlur={handleFinishEditingCallback}
                onKeyDown={handleKeyPressCallback}
                placeholder="0.0"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <div className="flex-shrink-0 px-3">
                <button
                  className="btn btn-xs btn-primary h-8 min-h-0 px-3"
                  onClick={handleSetMaxAmountCallback}
                  type="button"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[60px] items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-base-content/70 text-sm">Amount to move</span>
              <span className="text-base-content/50 text-xs">Click to edit</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-semibold">
                <FiatBalance
                  tokenAddress={token.address}
                  rawValue={transferAmount}
                  decimals={token.decimals || 18}
                  tokenSymbol={token.name}
                  price={token.price || BigInt(100000000)}
                  className="text-base-content"
                  showRawOnHover={true}
                  minimumFractionDigits={2}
                  maximumFractionDigits={2}
                />
              </span>
              <div className="text-base-content/60 text-xs">
                {transferAmount < token.rawBalance
                  ? `${((Number(transferAmount) / Number(token.rawBalance)) * 100).toFixed(0)}% of balance`
                  : "Using full balance"}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }, [
    isEditingAmount,
    token.address,
    token.name,
    token.decimals,
    token.price,
    token.rawBalance,
    transferAmount,
    inputValue,
    handleAmountChangeCallback,
    handleFinishEditingCallback,
    handleKeyPressCallback,
    handleSetMaxAmountCallback,
  ]);

  const ProtocolSelectorComponent = useCallback(
    () => (
      <div className="border-base-300/60 bg-base-100/80 w-full flex-1 rounded-2xl border p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-base-content/80 text-sm font-semibold">Destination protocol</div>
          {selectedProtocol && (
            <span className="badge badge-sm bg-primary/10 text-primary border-0">
              {isRateImprovement ? "Better APY" : rateDifference === 0 ? "Same APY" : "Lower APY"}
            </span>
          )}
        </div>
        {ratesLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="dropdown dropdown-bottom w-full">
            <div
              tabIndex={0}
              role="button"
              className="border-base-300/60 hover:border-primary/40 flex w-full cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-base-200 relative size-12 overflow-hidden rounded-full">
                  {selectedProtocol ? (
                    <ProtocolLogo protocolName={selectedProtocol} size="lg" rounded="full" />
                  ) : (
                    <div className="text-base-content/50 flex size-full items-center justify-center text-sm">
                      Pick
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {selectedProtocol ? formatProtocolName(selectedProtocol) : "Select protocol"}
                  </span>
                  <span className="text-base-content/60 text-xs">
                    {selectedProtocol ? `${formatRate(selectedRate)} APY` : "Choose where to move your supply"}
                  </span>
                </div>
              </div>
              <ArrowRightIcon className="text-base-content/50 size-5" />
            </div>
            <div tabIndex={0} className="dropdown-content menu bg-base-100 border-base-200 z-50 w-full overflow-hidden rounded-2xl border p-0 shadow-xl">
              {protocols.length === 0 ? (
                <div className="text-base-content/50 px-4 py-3">No protocols available</div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                  {protocols.map(({ protocol, supplyRate, isOptimal }) => {
                    const isRateWorse = supplyRate < token.currentRate;
                    const isRateBetter = supplyRate > token.currentRate;
                    return (
                      <ProtocolDropdownItem
                        key={protocol}
                        protocolName={protocol}
                        displayName={formatProtocolName(protocol)}
                        rate={supplyRate}
                        isOptimal={isOptimal}
                        isRateWorse={isRateWorse}
                        isRateBetter={isRateBetter}
                        isSelected={protocol === selectedProtocol}
                        onClick={() => setSelectedProtocol(protocol)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    ),
    [
      ratesLoading,
      selectedProtocol,
      protocols,
      token.currentRate,
      isRateImprovement,
      rateDifference,
      formatRate,
      selectedRate,
    ],
  );

  const StatusContent = () => {
    if (status === MoveStatus.Success) {
      return (
        <div className="border-base-300/60 bg-base-100/80 flex flex-col items-center justify-center rounded-2xl border py-6">
          <div className="bg-success/15 mb-4 flex size-16 items-center justify-center rounded-full">
            <CheckIcon className="text-success size-10" />
          </div>
          <h3 className="mb-2 text-2xl font-bold">Position Moved Successfully</h3>
          <p className="text-base-content/70 mb-4 text-center">
            Your {token.name} position has been moved from {fromProtocol} to {formatProtocolName(selectedProtocol)}.
          </p>
          {transactionHash && (
            <div className="bg-base-200/60 border-base-300/60 mb-4 w-full rounded-md border p-3">
              <p className="text-base-content/70 mb-1 text-sm">Transaction Hash:</p>
              <p className="truncate font-mono text-xs">{transactionHash}</p>
            </div>
          )}
          <button className="btn btn-primary w-full" onClick={resetModal}>
            Close
          </button>
        </div>
      );
    }
    if (status === MoveStatus.Error) {
      return (
        <div className="border-base-300/60 bg-base-100/80 flex flex-col items-center justify-center rounded-2xl border py-6">
          <div className="bg-error/15 mb-4 flex size-16 items-center justify-center rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="text-error size-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="mb-2 text-2xl font-bold">Transaction Failed</h3>
          <p className="text-base-content/70 mb-4 text-center">
            There was an error moving your position. Please try again.
          </p>
          <div className="flex w-full gap-3">
            <button className="btn btn-outline flex-1" onClick={resetModal}>
              Cancel
            </button>
            <button className="btn btn-primary flex-1" onClick={() => setStatus(MoveStatus.Initial)}>
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (status === MoveStatus.Success || status === MoveStatus.Error) {
      return <StatusContent />;
    }
    const isLoading = status === MoveStatus.Executing;
    const yieldData = calculateAnnualYield();

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="border-base-300/60 relative size-10 overflow-hidden rounded-full border">
              <Image src={token.icon} alt={token.name} fill className="object-cover" />
            </div>
            <div>
              <p className="text-base-content/50 text-xs uppercase tracking-[0.08em]">Moving supply</p>
              <h3 className="text-base-content text-lg font-semibold">{token.name}</h3>
            </div>
          </div>
          <div className="bg-base-200/80 border-base-300/60 flex items-center gap-2 rounded-xl border px-3 py-2">
            <span className="text-base-content/60 text-xs">Current APY</span>
            <span className="font-semibold">{formatRate(token.currentRate)}</span>
          </div>
        </div>

        <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="border-base-300/60 bg-base-100/80 rounded-2xl border p-4 shadow-sm">
            <div className="text-base-content/80 mb-2 text-sm font-semibold">From protocol</div>
            <div className="flex items-center gap-3">
              <ProtocolLogo protocolName={fromProtocol} size="lg" rounded="full" className="bg-base-200" />
              <div>
                <div className="font-semibold">{formatProtocolName(fromProtocol)}</div>
                <div className="text-base-content/60 text-xs">{formatRate(token.currentRate)} APY</div>
              </div>
            </div>
          </div>
          <div className="hidden items-center justify-center md:flex">
            <div className="bg-primary shadow-primary/20 rounded-full p-2 shadow-lg">
              <ArrowRightIcon className="size-6 text-white" />
            </div>
          </div>
          <div className="flex items-center justify-center md:hidden">
            <div className="bg-primary shadow-primary/20 rotate-90 rounded-full p-2 shadow-lg">
              <ArrowRightIcon className="size-5 text-white" />
            </div>
          </div>
          <ProtocolSelectorComponent />
        </div>

        <AmountInputComponent />

        {selectedProtocol && (
          <div className="border-base-300/60 bg-base-100/80 rounded-2xl border p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-base-content/80 text-sm font-semibold">Rate comparison</div>
              <span
                className={`badge badge-sm border-0 ${
                  rateDifference > 0
                    ? "bg-success/15 text-success"
                    : rateDifference < 0
                      ? "bg-error/15 text-error"
                      : "bg-base-200 text-base-content/70"
                }`}
              >
                {rateDifference > 0 ? "Improved" : rateDifference < 0 ? "Reduced" : "Unchanged"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="border-base-200/70 rounded-xl border p-3">
                <span className="text-base-content/60 text-xs">Rate change</span>
                <div
                  className={`text-lg font-semibold ${
                    rateDifference > 0 ? "text-success" : rateDifference < 0 ? "text-error" : ""
                  }`}
                >
                  {rateDifference > 0 ? "+" : ""}
                  {formatRate(rateDifference)}
                </div>
              </div>
              <div className="border-base-200/70 rounded-xl border p-3">
                <span className="text-base-content/60 text-xs">Estimated annual yield</span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className={yieldData.isImprovement ? "text-success font-semibold" : "text-error font-semibold"}>
                    {yieldData.newYield}
                  </span>
                  <span className="text-base-content/60 text-xs">Current: {yieldData.currentYield}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            className="btn btn-primary w-full"
            onClick={handleMove}
            disabled={!selectedProtocol || isLoading || !address}
          >
            {isLoading ? (
              <LoadingSpinner size="sm" label="Moving position..." />
            ) : (
              "Move position"
            )}
          </button>
          {isPreferenceLoaded && (
            <div className="border-base-300/60 bg-base-100/80 flex items-center gap-3 rounded-2xl border px-4 py-3">
              <input
                type="checkbox"
                checked={preferBatching}
                onChange={createCheckboxHandler(setPreferBatching)}
                className="checkbox checkbox-sm"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Batch transactions with Smart Account</span>
                <span className="text-base-content/60 text-xs">
                  Reduce signing steps when batching is supported on this chain.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={status === MoveStatus.Initial ? onClose : resetModal}
      maxWidthClass="max-w-2xl"
      title="Move Supply Position"
    >
      <div className="p-6">{renderContent()}</div>
    </BaseModal>
  );
};
