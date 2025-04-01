import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FiAlertTriangle, FiArrowRight, FiArrowRightCircle, FiCheck, FiDollarSign } from "react-icons/fi";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI, tokenNameToLogo } from "~~/contracts/externalContracts";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";

// Define the step type for tracking the move flow
type MoveStep = "idle" | "executing" | "done";

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: {
    name: string;
    balance: number; // USD value (display only)
    type: "supply" | "borrow";
    tokenAddress: string;
  };
}

type FlashLoanProvider = {
  name: "Balancer V2" | "Balancer V3";
  icon: string;
  version: "v2" | "v3";
};

const FLASH_LOAN_PROVIDERS: FlashLoanProvider[] = [
  { name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2" },
  { name: "Balancer V3", icon: "/logos/balancer.svg", version: "v3" },
] as const;

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position }) => {
  const { address: userAddress } = useAccount();
  const protocols = [
    { name: "Aave V3", icon: "/logos/aave.svg" },
    { name: "Compound V3", icon: "/logos/compound.svg" },
    { name: "Venus", icon: "/logos/venus.svg" },
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollaterals, setSelectedCollaterals] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedFlashLoanProvider, setSelectedFlashLoanProvider] = useState<FlashLoanProvider>(
    FLASH_LOAN_PROVIDERS[0],
  );
  const [isRepayingAll, setIsRepayingAll] = useState(false);
  const [hasProviderSufficientBalance, setHasProviderSufficientBalance] = useState<boolean | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Fetch collaterals from the contract.
  const { collaterals: fetchedCollaterals, isLoading: isLoadingCollaterals } = useCollaterals(
    position.tokenAddress,
    fromProtocol,
    userAddress || "0x0000000000000000000000000000000000000000",
    isOpen,
  );

  // Memoize the collateral addresses to prevent recreation on every render.
  const collateralAddresses = useMemo(
    () => fetchedCollaterals.map((collateral: any) => collateral.address),
    // Stable dependency - stringify the addresses to avoid reference comparisons
    [JSON.stringify(fetchedCollaterals.map((c: any) => c.address))],
  );

  // Use the hook to check collateral support.
  const { isLoading: isLoadingCollateralSupport, supportedCollaterals } = useCollateralSupport(
    selectedProtocol,
    position.tokenAddress,
    collateralAddresses,
    isOpen,
  );

  // Combine fetched collaterals with selected state and support status.
  const collaterals = useMemo(() => {
    return fetchedCollaterals.map(
      (collateral: { symbol: string; balance: number; address: string; decimals: number }) => {
        // Use the address for selection status instead of symbol
        return {
          ...collateral,
          // Check if the address is in the selectedCollaterals set
          selected: selectedCollaterals.has(collateral.address),
          supported: supportedCollaterals[collateral.address] === true,
        };
      },
    );
  }, [fetchedCollaterals, selectedCollaterals, supportedCollaterals]);

  // Modified to use address instead of symbol
  const handleCollateralToggle = (address: string) => {
    const collateral = collaterals.find(c => c.address === address);
    if (collateral && !collateral.supported) return;
    setSelectedCollaterals(prev => {
      const next = new Set(prev);
      next.has(address) ? next.delete(address) : next.add(address);
      return next;
    });
  };

  // Move debt hook.
  const { moveDebt } = useMoveDebtScaffold();

  // Read on-chain borrow balance.
  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getBorrowBalance",
    args: [
      fromProtocol.toLowerCase(),
      position.tokenAddress,
      userAddress || "0x0000000000000000000000000000000000000000",
    ],
    query: {
      enabled: isOpen,
    },
  });

  // Read token decimals.
  const { data: decimals } = useReadContract({
    address: position.tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
    query: {
      enabled: isOpen,
    },
  });

  // Check flash loan provider balance.
  const { data: flashLoanProviderBalance } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getFlashLoanProviderBalance",
    args: [position.tokenAddress, selectedFlashLoanProvider.version],
    query: {
      enabled: isOpen,
    },
  });

  // Reset the state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setError(null);
      setStep("idle");
      setLoading(false);
      setIsRepayingAll(false);
    }
  }, [isOpen]);

  // Effect for checking provider balance.
  useEffect(() => {
    // Early return if dependencies are missing
    if (!flashLoanProviderBalance || !decimals || !amount || !tokenBalance) {
      setHasProviderSufficientBalance(null);
      return;
    }

    // Using state updater function to avoid closure over stale state
    setIsCheckingBalance(true);

    // Create a stable reference to the current values
    const currentFlashLoanProviderBalance = flashLoanProviderBalance;
    const currentAmount = amount;
    const currentDecimals = decimals;
    const currentTokenBalance = tokenBalance;
    const currentIsRepayingAll = isRepayingAll;

    const checkBalanceTimeout = setTimeout(() => {
      try {
        const requestedAmount = currentIsRepayingAll
          ? (currentTokenBalance as bigint)
          : parseUnits(currentAmount, currentDecimals as number);
        setHasProviderSufficientBalance(currentFlashLoanProviderBalance >= requestedAmount);
      } catch (error) {
        console.error("Error checking provider balance:", error);
        setHasProviderSufficientBalance(null);
      } finally {
        setIsCheckingBalance(false);
      }
    }, 300);

    return () => clearTimeout(checkBalanceTimeout);
    // Explicit dependencies, without isCheckingBalance which would cause a loop
  }, [flashLoanProviderBalance, amount, decimals, isRepayingAll, tokenBalance]);

  // Memoize formatted token balance.
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !decimals) return "0";
    return formatUnits(tokenBalance, decimals as number);
  }, [tokenBalance, decimals]);

  // Format number with thousands separators for display
  const formatDisplayNumber = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  const handleSetMaxAmount = () => {
    setAmount(formattedTokenBalance);
    setIsRepayingAll(true);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setIsRepayingAll(false);
  };

  const handleMoveDebt = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      if (!decimals) throw new Error("Token decimals not loaded");
      setLoading(true);
      setError(null);
      setStep("executing");

      let computedDebtAmount: bigint;
      if (isRepayingAll) {
        computedDebtAmount = tokenBalance as bigint;
      } else {
        computedDebtAmount = parseUnits(amount, decimals as number);
      }

      const selectedCollateralArray = collaterals
        .filter(c => selectedCollaterals.has(c.address))
        .map(c => {
          const collateralAmount = parseUnits(c.balance.toString(), c.decimals);
          return { token: c.address, amount: collateralAmount };
        });

      if (position.type === "borrow") {
        await moveDebt({
          user: userAddress,
          debtToken: position.tokenAddress,
          debtAmount: computedDebtAmount,
          collaterals: selectedCollateralArray,
          fromProtocol: fromProtocol.toLowerCase(),
          toProtocol: selectedProtocol.toLowerCase(),
          flashLoanVersion: selectedFlashLoanProvider.version,
          repayAll: isRepayingAll,
        });

        setStep("done");
        // Close modal after a short delay on success
        setTimeout(() => onClose(), 2000);
      } else {
        setError("Supply move not implemented in this hook");
        console.log("Supply move not implemented in this hook");
      }
    } catch (err: any) {
      console.error("Move debt failed:", err);
      setError(err.message || "Move position failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  // Get action button text based on current step
  const getActionButtonText = () => {
    if (loading) {
      switch (step) {
        case "executing":
          return "Moving...";
        default:
          return "Processing...";
      }
    }

    if (step === "done") {
      return "Done!";
    }

    return "Move Position";
  };

  // Get action button class based on current step
  const getActionButtonClass = () => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
  };

  // Get the selected protocol icon
  const getSelectedProtocolIcon = () => {
    return protocols.find(p => p.name === selectedProtocol)?.icon || "";
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-2xl p-0 overflow-hidden">
        {/* Header with gradient background */}
        <div className="relative p-6 bg-gradient-to-r from-base-200 to-base-300">
          <div className="absolute top-4 right-4">
            <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose} disabled={loading && step !== "done"}>
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="avatar">
                <div className="w-14 h-14 rounded-full ring-2 ring-base-content/5 p-1 bg-base-100 shadow-md">
                  <Image
                    src={tokenNameToLogo(position.name)}
                    alt={position.name}
                    width={48}
                    height={48}
                    className="rounded-full"
                  />
                </div>
              </div>
              <div className="absolute -right-2 -bottom-2 bg-base-100 rounded-full p-0.5 shadow-md">
                <FiArrowRightCircle className="text-primary w-6 h-6" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <span className="font-extrabold bg-gradient-to-r from-purple-500 via-primary to-blue-500 bg-clip-text text-transparent dark:from-purple-300 dark:via-primary-300 dark:to-blue-300">
                  Move {position.type === "supply" ? "Supply" : "Debt"}
                </span>
                <span className="text-base-content">{position.name}</span>
              </h3>
              <div className="text-sm opacity-70">
                {position.type === "borrow"
                  ? `Moving debt from ${fromProtocol} to another protocol`
                  : `Moving supply from ${fromProtocol} to another protocol`}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="p-6 space-y-6">
          {/* Protocol Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* From Protocol */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-base-content/80">From Protocol</label>
              <div className="bg-base-200/60 py-3 px-4 rounded-lg flex items-center justify-between h-[52px]">
                <div className="flex items-center gap-3 truncate">
                  <Image
                    src={protocols.find(p => p.name === fromProtocol)?.icon || ""}
                    alt={fromProtocol}
                    width={24}
                    height={24}
                    className="rounded-full min-w-[24px]"
                  />
                  <span className="truncate font-medium">{fromProtocol}</span>
                </div>
              </div>
            </div>

            {/* To Protocol */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-base-content/80">To Protocol</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="bg-base-200/60 hover:bg-base-200 transition-colors py-3 px-4 rounded-lg flex items-center justify-between cursor-pointer h-[52px]"
                >
                  <div className="flex items-center gap-3 w-[calc(100%-24px)] overflow-hidden">
                    {selectedProtocol ? (
                      <>
                        <Image
                          src={getSelectedProtocolIcon()}
                          alt={selectedProtocol}
                          width={24}
                          height={24}
                          className="rounded-full min-w-[24px]"
                        />
                        <span className="truncate font-medium">{selectedProtocol}</span>
                      </>
                    ) : (
                      <span className="text-base-content/50">Select protocol</span>
                    )}
                  </div>
                  <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                >
                  {protocols
                    .filter(p => p.name !== fromProtocol)
                    .map(protocol => (
                      <li key={protocol.name}>
                        <button
                          className="flex items-center gap-3 py-2"
                          onClick={() => setSelectedProtocol(protocol.name)}
                        >
                          <Image
                            src={protocol.icon}
                            alt={protocol.name}
                            width={24}
                            height={24}
                            className="rounded-full min-w-[24px]"
                          />
                          <span className="truncate">{protocol.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* Flash Loan Provider */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-base-content/80">Flash Loan Provider</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="bg-base-200/60 hover:bg-base-200 transition-colors py-3 px-4 rounded-lg flex items-center justify-between cursor-pointer h-[52px]"
                >
                  <div className="flex items-center gap-3 w-[calc(100%-24px)] overflow-hidden">
                    <Image
                      src={selectedFlashLoanProvider.icon}
                      alt={selectedFlashLoanProvider.name}
                      width={24}
                      height={24}
                      className="rounded-full min-w-[24px]"
                    />
                    <span className="truncate font-medium">{selectedFlashLoanProvider.name}</span>
                    {isCheckingBalance && <span className="loading loading-spinner loading-xs ml-2"></span>}
                  </div>
                  <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                >
                  {FLASH_LOAN_PROVIDERS.map(provider => (
                    <li key={provider.name}>
                      <button
                        className="flex items-center gap-3 py-2"
                        onClick={() => setSelectedFlashLoanProvider(provider)}
                      >
                        <Image
                          src={provider.icon}
                          alt={provider.name}
                          width={24}
                          height={24}
                          className="rounded-full min-w-[24px]"
                        />
                        <span className="truncate">{provider.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Flash Loan Provider Status */}
          {hasProviderSufficientBalance !== null && amount && (
            <div
              className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
                hasProviderSufficientBalance ? "bg-success/10 text-success" : "bg-error/10 text-error"
              }`}
            >
              {hasProviderSufficientBalance ? (
                <>
                  <FiCheck className="w-5 h-5" /> Flash loan provider has sufficient {position.name} for this
                  transaction.
                </>
              ) : (
                <>
                  <FiAlertTriangle className="w-5 h-5" /> This provider does not have enough {position.name} for your
                  flash loan.
                </>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-base-content/80">Amount</label>
              <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                <span className="text-base-content/70">Available:</span>
                <span className="font-medium ml-1">
                  {formatDisplayNumber(formattedTokenBalance)} {position.name}
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                className="input input-bordered w-full pr-20 h-14 text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={loading || step !== "idle"}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm btn-outline h-8"
                onClick={handleSetMaxAmount}
                disabled={loading || step !== "idle"}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Collateral Selection */}
          {position.type === "borrow" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-base-content/80">Select Collateral to Move</label>
                {selectedProtocol && (
                  <span className="text-xs bg-base-200/60 py-1 px-2 rounded-md text-base-content/60">
                    Grayed out = not supported in {selectedProtocol}
                  </span>
                )}
              </div>

              {isLoadingCollaterals || isLoadingCollateralSupport ? (
                <div className="flex items-center justify-center py-6 bg-base-200/50 rounded-lg">
                  <span className="loading loading-spinner loading-md"></span>
                  <span className="ml-2 text-base-content/70">Checking collateral support...</span>
                </div>
              ) : collaterals.length > 0 ? (
                <div className="bg-base-200/30 p-4 rounded-lg">
                  <div className="flex flex-wrap gap-2">
                    {collaterals.map(collateral => (
                      <button
                        key={collateral.address}
                        onClick={() => handleCollateralToggle(collateral.address)}
                        className={`
                          btn h-auto py-2 px-3 normal-case flex items-center gap-2
                          ${collateral.selected ? "btn-primary" : "btn-outline bg-base-100"}
                          ${!collateral.supported ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                        disabled={!collateral.supported}
                      >
                        <div className="w-6 h-6 relative flex-shrink-0">
                          <Image
                            src={tokenNameToLogo(collateral.symbol)}
                            alt={collateral.symbol}
                            fill
                            className="rounded-full object-contain"
                          />
                        </div>
                        <span className="truncate font-medium">{collateral.symbol}</span>
                        <span className="opacity-70 tabular-nums">
                          {collateral.balance.toFixed(collateral.decimals > 6 ? 4 : collateral.decimals)}
                        </span>
                        {!collateral.supported && <span className="text-xs px-1 bg-base-300 rounded-full ml-1">!</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-base-content/70 text-center p-6 bg-base-200/50 rounded-lg">
                  No collateral available to move
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="alert alert-error shadow-lg">
              <FiAlertTriangle className="w-6 h-6" />
              <div className="text-sm flex-1">{error}</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-5 flex flex-col gap-3 mt-2">
            {step === "done" ? (
              <button className="btn btn-success btn-lg w-full gap-2 h-14 shadow-md" onClick={onClose}>
                <FiCheck className="w-5 h-5" /> Position Moved Successfully
              </button>
            ) : (
              <>
                {/* Check if we can move the position */}
                {(() => {
                  const isDisabled =
                    loading ||
                    !selectedProtocol ||
                    !amount ||
                    (tokenBalance && decimals && parseFloat(amount) > parseFloat(formattedTokenBalance)) ||
                    (position.type === "borrow" && selectedCollaterals.size === 0) ||
                    hasProviderSufficientBalance === false ||
                    step !== "idle";

                  return (
                    <button
                      className={`btn ${getActionButtonClass()} btn-lg w-full h-14 transition-all duration-300 shadow-md ${loading ? "animate-pulse" : ""}`}
                      onClick={handleMoveDebt}
                      disabled={isDisabled ? true : false}
                    >
                      {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
                      {getActionButtonText()}
                      {!loading && step === "idle" && <FiArrowRight className="w-5 h-5 ml-1" />}
                    </button>
                  );
                })()}
              </>
            )}

            {step !== "done" && (
              <button className="btn btn-ghost btn-sm w-full hover:bg-base-200" onClick={onClose} disabled={loading}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <form
        method="dialog"
        className="modal-backdrop backdrop-blur-sm bg-black/20"
        onClick={loading ? undefined : onClose}
      >
        <button disabled={loading}>close</button>
      </form>
    </dialog>
  );
};
