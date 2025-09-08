import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiArrowRightCircle,
  FiCheck,
  FiDollarSign,
  FiLock,
  FiMinusCircle,
  FiPlusCircle,
  FiTrendingUp,
} from "react-icons/fi";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI, tokenNameToLogo } from "~~/contracts/externalContracts";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { getProtocolLogo } from "~~/utils/protocol";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { CollateralAmounts } from "~~/components/specific/collateral/CollateralAmounts";

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
    decimals: number;
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

// Extend the collateral type with rawBalance
type CollateralType = {
  symbol: string;
  balance: number;
  address: string;
  decimals: number;
  rawBalance: bigint; // Not optional - rawBalance is always provided by useCollaterals
  selected: boolean;
  supported: boolean;
};

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position }) => {
  const { address: userAddress } = useAccount();
  const protocols = [
    { name: "Aave V3" },
    { name: "Compound V3" },
    { name: "Venus" },
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] = useState<CollateralWithAmount[]>([]);
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

  // Combine fetched collaterals with support status.
  const collateralsForSelector = useMemo(() => {
    return fetchedCollaterals.map(
      (collateral: { symbol: string; balance: number; address: string; decimals: number; rawBalance: bigint }) => {
        return {
          ...collateral,
          supported: supportedCollaterals[collateral.address] === true,
        };
      },
    );
  }, [fetchedCollaterals, supportedCollaterals]);

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
      setSelectedCollateralsWithAmounts([]);
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

      const selectedCollateralArray = selectedCollateralsWithAmounts.map(c => {
        return { token: c.token, amount: c.amount };
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
    return protocols.find(p => p.name === selectedProtocol)?.name || "";
  };

  // Handler for collateral selection and amount changes
  const handleCollateralSelectionChange = (collaterals: CollateralWithAmount[]) => {
    setSelectedCollateralsWithAmounts(collaterals);
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 w-full max-w-5xl p-0 overflow-hidden">
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
                {position.type === "borrow" ? (
                  <FiArrowRightCircle className="text-primary w-6 h-6" />
                ) : (
                  <FiTrendingUp className="text-emerald-500 w-6 h-6" />
                )}
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <span
                  className={`font-extrabold bg-gradient-to-r ${
                    position.type === "borrow"
                      ? "from-purple-500 via-primary to-blue-500 bg-clip-text text-transparent dark:from-purple-300 dark:via-primary-300 dark:to-blue-300"
                      : "from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-300 dark:to-cyan-300"
                  }`}
                >
                  Move {position.type === "supply" ? "Supply" : "Debt"}
                </span>
                <span className="text-base-content">{position.name}</span>
              </h3>
              <div className="text-sm opacity-70 flex items-center gap-1">
                {position.type === "borrow" ? (
                  <>
                    <FiMinusCircle className="w-4 h-4 text-primary" />
                    <span>Moving debt from {fromProtocol} to another protocol</span>
                  </>
                ) : (
                  <>
                    <FiPlusCircle className="w-4 h-4 text-emerald-500" />
                    <span>Moving supply from {fromProtocol} to another protocol</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* FROM SECTION */}
          <div className="space-y-3 md:col-span-3">
            <div>
              <label className="text-sm font-medium text-base-content/80">From</label>
              <div className="flex items-center gap-3 h-14 border-b-2 border-base-300 px-1">
                <Image
                  src={getProtocolLogo(fromProtocol)}
                  alt={fromProtocol}
                  width={32}
                  height={32}
                  className="rounded-full min-w-[32px]"
                />
                <span className="truncate font-semibold text-lg">{fromProtocol}</span>
              </div>
            </div>
            {position.type === "borrow" && (
              <CollateralSelector
                collaterals={collateralsForSelector}
                isLoading={isLoadingCollaterals || isLoadingCollateralSupport}
                selectedProtocol={selectedProtocol}
                onCollateralSelectionChange={handleCollateralSelectionChange}
                marketToken={position.tokenAddress}
                hideAmounts
              />
            )}
          </div>

          {/* AMOUNTS SECTION */}
          <div className="space-y-3 md:col-span-6">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-base-content/80 flex items-center gap-1">
                  Debt Amount
                  {position.type === "supply" && <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />}
                </label>
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
            {position.type === "borrow" && (
              <CollateralAmounts
                collaterals={selectedCollateralsWithAmounts}
                onChange={setSelectedCollateralsWithAmounts}
                selectedProtocol={selectedProtocol}
              />
            )}
          </div>

          {/* TO SECTION */}
          <div className="space-y-3 md:col-span-3">
            <div>
              <label className="text-sm font-medium text-base-content/80">To</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="border-b-2 border-base-300 py-3 px-1 flex items-center justify-between cursor-pointer h-14"
                >
                  <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                    {selectedProtocol ? (
                      <>
                        <Image
                          src={getProtocolLogo(selectedProtocol)}
                          alt={selectedProtocol}
                          width={32}
                          height={32}
                          className="rounded-full min-w-[32px]"
                        />
                        <span className="truncate font-semibold text-lg">{selectedProtocol}</span>
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
                            src={getProtocolLogo(protocol.name)}
                            alt={protocol.name}
                            width={32}
                            height={32}
                            className="rounded-full min-w-[32px]"
                          />
                          <span className="truncate text-lg">{protocol.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-base-content/80">Flash Loan Provider</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="border-b-2 border-base-300 py-3 px-1 flex items-center justify-between cursor-pointer h-14"
                >
                  <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                    <Image
                      src={selectedFlashLoanProvider.icon}
                      alt={selectedFlashLoanProvider.name}
                      width={32}
                      height={32}
                      className="rounded-full min-w-[32px]"
                    />
                    <span className="truncate font-semibold text-lg">{selectedFlashLoanProvider.name}</span>
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
                          width={32}
                          height={32}
                          className="rounded-full min-w-[32px]"
                        />
                        <span className="truncate text-lg">{provider.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

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
          </div>
        </div>

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
                    !!(tokenBalance && decimals && parseFloat(amount) > parseFloat(formattedTokenBalance)) ||
                    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
                    hasProviderSufficientBalance === false ||
                    step !== "idle";

                  return (
                    <button
                      className={`btn ${getActionButtonClass()} btn-lg w-full h-14 transition-all duration-300 shadow-md ${loading ? "animate-pulse" : ""}`}
                      onClick={handleMoveDebt}
                      disabled={isDisabled}
                    >
                      {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
                      {getActionButtonText()}
                      {!loading &&
                        step === "idle" &&
                        (position.type === "supply" ? (
                          <FiTrendingUp className="w-5 h-5 ml-1" />
                        ) : (
                          <FiArrowRight className="w-5 h-5 ml-1" />
                        ))}
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
