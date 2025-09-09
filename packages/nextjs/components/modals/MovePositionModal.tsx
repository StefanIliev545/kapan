import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FiAlertTriangle, FiCheck, FiLock } from "react-icons/fi";
import { FaGasPump } from "react-icons/fa";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI, tokenNameToLogo } from "~~/contracts/externalContracts";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
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

  // Fetch USD prices for debt token and selected collaterals using Starknet helper
  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "starknet",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [[...collateralsForSelector.map(c => c.address), position.tokenAddress]],
    query: { enabled: isOpen },
  });

  const { tokenToPrices } = useMemo(() => {
    if (!tokenPrices) return { tokenToPrices: {} as Record<string, bigint> };
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...collateralsForSelector.map(c => c.address), position.tokenAddress];
    return {
      tokenToPrices: prices.reduce((acc, price, index) => {
        acc[addresses[index].toLowerCase()] = price / 10n ** 10n;
        return acc;
      }, {} as Record<string, bigint>),
    };
  }, [tokenPrices, collateralsForSelector, position.tokenAddress]);

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

  const debtUsdValue = useMemo(() => {
    if (!amount) return 0;
    const price = tokenToPrices[position.tokenAddress.toLowerCase()];
    const usdPerToken = price
      ? Number(formatUnits(price, 8))
      : position.balance / parseFloat(formattedTokenBalance || "1");
    return parseFloat(amount) * usdPerToken;
  }, [amount, tokenToPrices, position.tokenAddress, position.balance, formattedTokenBalance]);

  const totalCollateralUsd = useMemo(
    () =>
      selectedCollateralsWithAmounts.reduce((sum, c) => {
        const price = tokenToPrices[c.token.toLowerCase()];
        const normalized = Number(formatUnits(c.amount, c.decimals));
        const usd = price ? normalized * Number(formatUnits(price, 8)) : 0;
        return sum + usd;
      }, 0),
    [selectedCollateralsWithAmounts, tokenToPrices],
  );

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

    return "Migrate";
  };

  // Get action button class based on current step
  const getActionButtonClass = () => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
  };

  // Handler for collateral selection and amount changes
  const handleCollateralSelectionChange = (collaterals: CollateralWithAmount[]) => {
    setSelectedCollateralsWithAmounts(collaterals);
  };

  const isActionDisabled =
    loading ||
    !selectedProtocol ||
    !amount ||
    !!(tokenBalance && decimals && parseFloat(amount) > parseFloat(formattedTokenBalance)) ||
    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
    hasProviderSufficientBalance === false ||
    step !== "idle";

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-5xl max-h-[90vh] min-h-[560px] p-6 rounded-none flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-full flex-grow">
          {/* FROM SECTION */}
          <div className="space-y-6 md:col-span-3">
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
              <div className="mt-6">
                <CollateralSelector
                  collaterals={collateralsForSelector}
                  isLoading={isLoadingCollaterals || isLoadingCollateralSupport}
                  selectedProtocol={selectedProtocol}
                  onCollateralSelectionChange={handleCollateralSelectionChange}
                  marketToken={position.tokenAddress}
                  hideAmounts
                />
              </div>
            )}
          </div>

          {/* AMOUNTS SECTION */}
          <div className="space-y-6 md:col-span-6">
            <div>
              <div className="text-center mb-2">
                <label className="block text-lg font-semibold flex items-center justify-center gap-1">
                  Debt
                  {position.type === "supply" && (
                    <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />
                  )}
                </label>
                <div className="text-xs text-base-content/60">
                  Available: {formatDisplayNumber(formattedTokenBalance)} {position.name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="w-6 h-6 relative">
                    <Image
                      src={tokenNameToLogo(position.name)}
                      alt={position.name}
                      fill
                      className="rounded-full object-contain"
                    />
                  </div>
                  <span className="truncate font-medium">{position.name}</span>
                </div>
                <input
                  type="text"
                  className="flex-1 border-b-2 border-base-300 focus:border-primary bg-transparent px-2 h-14 text-lg text-right"
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                  disabled={loading || step !== "idle"}
                />
                <button
                  className="text-xs font-medium px-2 py-1"
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

            {error && (
              <div className="alert alert-error shadow-lg">
                <FiAlertTriangle className="w-6 h-6" />
                <div className="text-sm flex-1">{error}</div>
              </div>
            )}

            <div className="flex justify-between text-sm text-base-content/70">
              <span>Debt Value: ${formatDisplayNumber(debtUsdValue)}</span>
              {position.type === "borrow" && (
                <span>Collateral Value: ${formatDisplayNumber(totalCollateralUsd)}</span>
              )}
            </div>

          </div>

          {/* TO SECTION */}
          <div className="space-y-6 md:col-span-3">
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
                      <FiCheck className="w-5 h-5" /> Flash loan provider has sufficient {position.name} for this transaction.
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
        <div className="flex justify-end pt-6">
          <button
            className={`btn ${getActionButtonClass()} btn-lg w-60 h-14 flex justify-between shadow-md ${
              loading ? "animate-pulse" : ""
            }`}
            onClick={step === "done" ? onClose : handleMoveDebt}
            disabled={step === "done" ? false : isActionDisabled}
          >
            <span>
              {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
              {getActionButtonText()}
            </span>
            <span className="flex items-center gap-1 text-xs">
              <FaGasPump className="text-gray-400" />
            </span>
          </button>
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
