import { ChangeEvent, FC, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BaseModal } from "./BaseModal";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ArrowRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import { FiatBalance } from "~~/components/FiatBalance";
import { useMoveSupply } from "~~/hooks/kapan/moveSupply";
import { useProtocolRates } from "~~/hooks/kapan/useProtocolRates";
import { getProtocolLogo } from "~~/utils/protocol";
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
}

enum MoveStatus {
  Initial,
  Approving,
  Moving,
  Success,
  Error,
}

export const MoveSupplyModal: FC<MoveSupplyModalProps> = ({ isOpen, onClose, token, fromProtocol }) => {
  const [status, setStatus] = useState<MoveStatus>(MoveStatus.Initial);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<string>("");
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [transferAmount, setTransferAmount] = useState<bigint>(token.rawBalance);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusingRef = useRef<boolean>(false);
  const { address } = useAccount();

  const { moveSupply } = useMoveSupply();
  const { data: rates, isLoading: ratesLoading } = useProtocolRates(token.address);

  // Debug token balance (can be removed in production)
  useEffect(() => {
    console.debug("Token balance in MoveSupplyModal:", {
      rawBalance: token.rawBalance,
      balanceString: token.rawBalance.toString(),
      decimals: token.decimals,
      price: token.price?.toString() || "undefined",
    });
  }, [token.rawBalance, token.decimals, token.price]);

  // Update transferAmount when token balance changes
  useEffect(() => {
    setTransferAmount(token.rawBalance);
  }, [token.rawBalance]);

  // Utility functions
  const formatProtocolName = (protocolId: string): string => {
    const protocolNameMap: Record<string, string> = {
      aave: "Aave V3",
      compound: "Compound V3",
      venus: "Venus",
    };
    return protocolNameMap[protocolId.toLowerCase()] || protocolId;
  };

  const normalizeProtocolName = (protocol: string): string =>
    protocol.toLowerCase().replace(/\s+/g, "").replace(/v\d+/i, "");

  const formatRate = (rate: number): string => `${rate.toFixed(2)}%`;

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

  const parseInputValue = (value: string): bigint => {
    try {
      const decimals = token.decimals || 18;
      return parseUnits(value || "0", decimals);
    } catch {
      return 0n;
    }
  };

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
      setStatus(MoveStatus.Approving);
      const collaterals = [{ token: token.address, amount: transferAmount }];
      const txHash = await moveSupply({
        user: address,
        debtToken: token.address,
        collaterals,
        fromProtocol: fromProtocol.toLowerCase(),
        toProtocol: selectedProtocol.toLowerCase(),
      });
      setTransactionHash(txHash as string);
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
  const protocols =
    rates
      ?.filter(rate => normalizeProtocolName(rate.protocol) !== normalizeProtocolName(fromProtocol))
      .sort((a, b) => b.supplyRate - a.supplyRate) || [];

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
        className={`p-4 bg-base-200 rounded-lg mb-5 cursor-pointer ${
          !isEditingAmount ? "hover:bg-base-300 transition-colors duration-150" : ""
        }`}
        onClick={startEditing}
      >
        {isEditingAmount ? (
          <div className="flex flex-col" style={{ minHeight: "60px" }}>
            {/* Header row with labels */}
            <div className="flex justify-between items-center" style={{ height: "24px" }}>
              <span className="text-sm font-medium text-base-content/80">Transfer Amount</span>
              <div className="text-xs text-base-content/70 text-right" style={{ minWidth: "60px" }}>
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

            {/* Input container using flex instead of absolute positioning */}
            <div className="flex mt-2 h-10 items-center w-full border rounded-md bg-base-100 overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30">
              <input
                ref={inputRef}
                type="text"
                className="flex-grow h-full px-3 bg-transparent border-none outline-none focus:outline-none"
                value={inputValue}
                onChange={handleAmountChangeCallback}
                onBlur={handleFinishEditingCallback}
                onKeyDown={handleKeyPressCallback}
                placeholder="0.0"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <div className="flex-shrink-0 px-2">
                <button
                  className="btn btn-xs btn-primary h-7 min-h-0 px-3"
                  onClick={handleSetMaxAmountCallback}
                  type="button"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center min-h-[60px]">
            <span className="text-sm">Amount to Move:</span>
            <div className="text-right">
              <span className="font-medium">
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
              {transferAmount < token.rawBalance && (
                <div className="text-xs text-base-content/60">
                  {((Number(transferAmount) / Number(token.rawBalance)) * 100).toFixed(0)}% of balance
                </div>
              )}
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
      <div className="bg-base-200 p-4 rounded-lg flex-1 w-full">
        <div className="text-sm font-medium mb-2">To Protocol</div>
        {ratesLoading ? (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner loading-md"></span>
          </div>
        ) : (
          <div className="dropdown dropdown-bottom w-full">
            <div tabIndex={0} role="button" className="cursor-pointer w-full">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 relative">
                  {selectedProtocol ? (
                    <Image
                      src={getProtocolLogo(selectedProtocol)}
                      alt={selectedProtocol}
                      fill
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-base-300 rounded-full flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-base-content/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium">
                    {selectedProtocol ? (
                      formatProtocolName(selectedProtocol)
                    ) : (
                      <span className="text-base-content/50">Select protocol</span>
                    )}
                  </div>
                  {selectedProtocol && (
                    <div className="text-sm text-base-content/70 flex items-center">
                      <span
                        className={
                          isRateImprovement
                            ? "bg-gradient-to-r from-green-500 to-teal-500 bg-clip-text text-transparent font-medium"
                            : rateDifference < 0
                              ? "text-error font-medium"
                              : ""
                        }
                      >
                        {formatRate(selectedRate)} APY
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div
              tabIndex={0}
              className="dropdown-content z-50 menu shadow-lg bg-base-100 rounded-box w-full overflow-hidden"
              style={{ minWidth: "100%" }}
            >
              {protocols.length === 0 ? (
                <div className="px-4 py-3 text-base-content/50">No protocols available</div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                  {protocols.map(({ protocol, supplyRate, isOptimal }) => {
                    const isRateWorse = supplyRate < token.currentRate;
                    return (
                      <div
                        key={protocol}
                        className="px-4 py-3 hover:bg-base-200 cursor-pointer border-b border-base-200 last:border-b-0"
                        onClick={() => setSelectedProtocol(protocol)}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <Image
                              src={getProtocolLogo(protocol)}
                              alt={protocol}
                              width={24}
                              height={24}
                              className="rounded-full min-w-[24px]"
                            />
                            <span className="font-medium">{formatProtocolName(protocol)}</span>
                          </div>
                          <span
                            className={`font-medium ${isOptimal ? "text-success" : isRateWorse ? "text-error" : ""}`}
                          >
                            {formatRate(supplyRate)}
                          </span>
                        </div>
                      </div>
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
      formatProtocolName,
      isRateImprovement,
      rateDifference,
      formatRate,
      selectedRate,
    ],
  );

  const StatusContent = () => {
    if (status === MoveStatus.Success) {
      return (
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
            <CheckIcon className="w-10 h-10 text-success" />
          </div>
          <h3 className="text-2xl font-bold mb-2">Position Moved Successfully</h3>
          <p className="text-base-content/70 text-center mb-4">
            Your {token.name} position has been moved from {fromProtocol} to {formatProtocolName(selectedProtocol)}.
          </p>
          {transactionHash && (
            <div className="w-full bg-base-300 rounded-md p-3 mb-4">
              <p className="text-sm text-base-content/70 mb-1">Transaction Hash:</p>
              <p className="text-xs font-mono truncate">{transactionHash}</p>
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
        <div className="flex flex-col items-center justify-center py-6">
          <div className="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10 text-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold mb-2">Transaction Failed</h3>
          <p className="text-base-content/70 text-center mb-4">
            There was an error moving your position. Please try again.
          </p>
          <div className="w-full flex gap-3">
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
    const isLoading = status === MoveStatus.Approving || status === MoveStatus.Moving;
    const yieldData = calculateAnnualYield();

    return (
      <>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold">Move Supply Position</h3>
          <div className="flex items-center gap-2">
            <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
            <span className="font-semibold">{token.name}</span>
          </div>
        </div>
        <AmountInputComponent />
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
          <div className="bg-base-200 p-4 rounded-lg flex-1 w-full">
            <div className="text-sm font-medium mb-2">From Protocol</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 relative">
                <Image src={getProtocolLogo(fromProtocol)} alt={fromProtocol} fill className="rounded-full" />
              </div>
              <div>
                <div className="font-medium">{fromProtocol}</div>
                <div className="text-sm text-base-content/70">{formatRate(token.currentRate)} APY</div>
              </div>
            </div>
          </div>
          <div className="hidden md:flex">
            <div className="p-2 bg-primary rounded-full">
              <ArrowRightIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="flex md:hidden">
            <div className="p-2 bg-primary rounded-full transform rotate-90">
              <ArrowRightIcon className="w-5 h-5 text-white" />
            </div>
          </div>
          <ProtocolSelectorComponent />
        </div>
        {selectedProtocol && (
          <div className="p-4 bg-base-200 rounded-lg mb-6">
            <div className="text-sm font-medium mb-2">Rate Comparison</div>
            <div className="flex justify-between mb-2">
              <span>Rate Change:</span>
              <span
                className={
                  rateDifference > 0
                    ? "text-success font-medium"
                    : rateDifference < 0
                      ? "text-error font-medium"
                      : "font-medium"
                }
              >
                {rateDifference > 0 ? "+" : ""}
                {formatRate(rateDifference)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Annual Yield:</span>
              <div className="text-right">
                <span className={yieldData.isImprovement ? "text-success font-medium" : "text-error font-medium"}>
                  {yieldData.newYield}
                </span>
                <div className="text-xs text-base-content/60">Current: {yieldData.currentYield}</div>
              </div>
            </div>
          </div>
        )}
        <button
          className="btn btn-primary w-full"
          onClick={handleMove}
          disabled={!selectedProtocol || isLoading || !address}
        >
          {isLoading ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              {status === MoveStatus.Approving ? "Approving..." : "Moving Position..."}
            </>
          ) : (
            "Move Position"
          )}
        </button>
      </>
    );
  };

  return (
    <BaseModal isOpen={isOpen} onClose={status === MoveStatus.Initial ? onClose : resetModal} maxWidthClass="max-w-2xl">
      <div className="p-6">{renderContent()}</div>
    </BaseModal>
  );
};
