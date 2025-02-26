import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI, tokenNameToLogo } from "~~/contracts/externalContracts";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";

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

  // Fetch collaterals from the contract.
  const { collaterals: fetchedCollaterals, isLoading: isLoadingCollaterals } = useCollaterals(
    position.tokenAddress,
    fromProtocol,
    userAddress || "0x0000000000000000000000000000000000000000",
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
  );

  // Combine fetched collaterals with selected state and support status.
  const collaterals = useMemo(() => {
    return fetchedCollaterals.map(
      (collateral: { symbol: string; balance: number; address: string; decimals: number }) => {
        // Directly use the supported status from the hook
        return {
          ...collateral,
          selected: selectedCollaterals.has(collateral.symbol),
          supported: supportedCollaterals[collateral.address] === true,
        };
      },
    );
  }, [fetchedCollaterals, selectedCollaterals, supportedCollaterals]);

  const handleCollateralToggle = (symbol: string) => {
    const collateral = collaterals.find(c => c.symbol === symbol);
    if (collateral && !collateral.supported) return;
    setSelectedCollaterals(prev => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
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
  });

  // Read token decimals.
  const { data: decimals } = useReadContract({
    address: position.tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  // Check flash loan provider balance.
  const { data: flashLoanProviderBalance } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getFlashLoanProviderBalance",
    args: [position.tokenAddress, selectedFlashLoanProvider.version],
  });

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

      let computedDebtAmount: bigint;
      if (isRepayingAll) {
        computedDebtAmount = tokenBalance as bigint;
      } else {
        computedDebtAmount = parseUnits(amount, decimals as number);
      }

      const selectedCollateralArray = collaterals
        .filter(c => selectedCollaterals.has(c.symbol))
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
      } else {
        console.log("Supply move not implemented in this hook");
      }
      onClose();
    } catch (err) {
      console.error("Move debt failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box max-w-2xl">
        <h3 className="font-bold text-lg">
          Move {position.type === "supply" ? "Supply" : "Debt"}: {position.name}
        </h3>

        <div className="py-4 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {/* From Protocol */}
            <div>
              <label className="text-sm text-base-content/70">From Protocol</label>
              <div className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4">
                <div className="flex items-center gap-2 truncate">
                  <Image
                    src={protocols.find(p => p.name === fromProtocol)?.icon || ""}
                    alt={fromProtocol}
                    width={20}
                    height={20}
                    className="rounded-full min-w-[20px]"
                  />
                  <span className="truncate">{fromProtocol}</span>
                </div>
              </div>
            </div>

            {/* To Protocol */}
            <div>
              <label className="text-sm text-base-content/70">To Protocol</label>
              <div className="dropdown w-full">
                <label
                  tabIndex={0}
                  className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    {selectedProtocol && (
                      <>
                        <Image
                          src={protocols.find(p => p.name === selectedProtocol)?.icon || ""}
                          alt={selectedProtocol}
                          width={20}
                          height={20}
                          className="rounded-full min-w-[20px]"
                        />
                        <span className="truncate">{selectedProtocol}</span>
                      </>
                    )}
                  </div>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full">
                  {protocols
                    .filter(p => p.name !== fromProtocol)
                    .map(protocol => (
                      <li key={protocol.name}>
                        <a className="flex items-center gap-2" onClick={() => setSelectedProtocol(protocol.name)}>
                          <Image
                            src={protocol.icon}
                            alt={protocol.name}
                            width={20}
                            height={20}
                            className="rounded-full min-w-[20px]"
                          />
                          <span className="truncate">{protocol.name}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* Flash Loan Provider */}
            <div>
              <label className="text-sm text-base-content/70">Flash Loan Provider</label>
              <div className="dropdown w-full">
                <label
                  tabIndex={0}
                  className="btn btn-outline w-full flex items-center justify-between mt-3 !h-12 px-4"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    <Image
                      src={selectedFlashLoanProvider.icon}
                      alt={selectedFlashLoanProvider.name}
                      width={20}
                      height={20}
                      className="rounded-full min-w-[20px]"
                    />
                    <span className="truncate">{selectedFlashLoanProvider.name}</span>
                    {hasProviderSufficientBalance !== null && amount && (
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                          hasProviderSufficientBalance ? "bg-success/20 text-success" : "bg-error/20 text-error"
                        }`}
                      >
                        {hasProviderSufficientBalance ? "Sufficient" : "Insufficient"}
                      </span>
                    )}
                    {isCheckingBalance && <span className="loading loading-spinner loading-xs ml-2"></span>}
                  </div>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </label>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full z-50 dropdown-bottom"
                >
                  {FLASH_LOAN_PROVIDERS.map(provider => (
                    <li key={provider.name}>
                      <a className="flex items-center gap-2" onClick={() => setSelectedFlashLoanProvider(provider)}>
                        <Image
                          src={provider.icon}
                          alt={provider.name}
                          width={20}
                          height={20}
                          className="rounded-full min-w-[20px]"
                        />
                        <span className="truncate">{provider.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              {hasProviderSufficientBalance === false && amount && (
                <p className="text-xs text-error mt-1">
                  This provider does not have enough {position.name} for your flash loan.
                </p>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div className="max-w-l">
            <label className="text-sm text-base-content/70">
              Amount{" "}
              <span className="float-right">
                Available: {formattedTokenBalance} {position.name}
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                className="input input-bordered w-full pr-16"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
              />
              <span
                className="absolute right-4 top-1/2 -translate-y-1/2 underline cursor-pointer hover:opacity-80 text-sm"
                onClick={handleSetMaxAmount}
              >
                Max
              </span>
            </div>
          </div>

          {/* Collateral Selection */}
          {position.type === "borrow" && (
            <div>
              <label className="text-sm text-base-content/70 mb-2 block">
                Select Collateral to Move{" "}
                {selectedProtocol && (
                  <span className="text-xs ml-2 text-base-content/50">
                    (Grayed out collaterals are not supported in {selectedProtocol})
                  </span>
                )}
              </label>
              {isLoadingCollaterals || isLoadingCollateralSupport ? (
                <div className="flex items-center justify-center py-4">
                  <span className="loading loading-spinner loading-md"></span>
                  <span className="ml-2">Checking collateral support...</span>
                </div>
              ) : collaterals.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {collaterals.map(collateral => (
                    <button
                      key={collateral.symbol}
                      onClick={() => handleCollateralToggle(collateral.symbol)}
                      className={`
                        btn btn-sm normal-case flex items-center gap-2 h-auto py-2
                        ${collateral.selected ? "btn-primary" : "btn-outline"}
                        ${!collateral.supported ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                      disabled={!collateral.supported}
                    >
                      <div className="w-5 h-5 relative flex-shrink-0">
                        <Image
                          src={tokenNameToLogo(collateral.symbol)}
                          alt={collateral.symbol}
                          fill
                          className="rounded-full object-contain"
                        />
                      </div>
                      <span className="truncate">{collateral.symbol}</span>
                      <span className="opacity-70 tabular-nums">
                        {collateral.balance.toFixed(collateral.decimals > 6 ? 4 : collateral.decimals)}
                      </span>
                      {!collateral.supported && <span className="text-xs px-1 bg-base-300 rounded-full ml-1">!</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-base-content/70 text-center p-4 bg-base-200 rounded-lg">
                  No collateral available to move
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMoveDebt}
            disabled={
              loading ||
              !selectedProtocol ||
              !amount ||
              parseUnits(amount, decimals as number) > (tokenBalance as bigint) ||
              (position.type === "borrow" && selectedCollaterals.size === 0) ||
              hasProviderSufficientBalance === false
            }
          >
            {loading ? "Moving..." : "Move Position"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
