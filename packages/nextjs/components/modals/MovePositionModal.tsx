import { FC, useState, useMemo } from "react";
import Image from "next/image";
import { SelectableCollateralView } from "../specific/collateral/SelectableCollateralView";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useMoveDebtScaffold } from "~~/hooks/kapan/moveDebt";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
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

// Define the type for our flash loan providers.
type FlashLoanProvider = {
  name: "Balancer V2" | "Balancer V3";
  icon: string;
  version: "v2" | "v3";
};

const FLASH_LOAN_PROVIDERS: FlashLoanProvider[] = [
  { name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2" },
  { name: "Balancer V3", icon: "/logos/balancer.svg", version: "v3" },
] as const;

export const MovePositionModal: FC<MovePositionModalProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
}) => {
  const { address: userAddress } = useAccount();
  const protocols = [
    { name: "Aave V3", icon: "/logos/aave.svg" },
    { name: "Compound V3", icon: "/logos/compound.svg" },
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(
    protocols.find(p => p.name !== fromProtocol)?.name || ""
  );
  // Use text input for full precision.
  const [amount, setAmount] = useState("");
  const [selectedCollaterals, setSelectedCollaterals] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedFlashLoanProvider, setSelectedFlashLoanProvider] = useState<FlashLoanProvider>(
    FLASH_LOAN_PROVIDERS[0]
  );
  const [isRepayingAll, setIsRepayingAll] = useState(false);

  // Fetch collaterals from the contract.
  const { collaterals: fetchedCollaterals, isLoading: isLoadingCollaterals } = useCollaterals(
    position.tokenAddress,
    fromProtocol,
    userAddress || "0x0000000000000000000000000000000000000000"
  );

  // Map fetched collaterals to the format expected by SelectableCollateralView.
  const collaterals = fetchedCollaterals.map(
    (collateral: { symbol: string; balance: number; address: string; decimals: number }) => ({
      ...collateral,
      selected: selectedCollaterals.has(collateral.symbol),
    })
  );

  const handleCollateralToggle = (symbol: string) => {
    setSelectedCollaterals(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Import the moveDebt hook that handles approvals and the moveDebt transaction.
  const { moveDebt, error } = useMoveDebtScaffold();

  // Read on-chain borrow balance (raw BigInt).
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

  // Use useMemo so that formattedTokenBalance is only recalculated when tokenBalance or decimals changes.
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !decimals) return "0";
    return formatUnits(tokenBalance, decimals as number);
  }, [tokenBalance, decimals]);

  // When the user clicks "Max", set the input value to the full formatted balance
  // and mark that we're repaying all
  const handleSetMaxAmount = () => {
    console.log("Setting max amount:", {
      rawTokenBalance: tokenBalance?.toString(),
      formatted: formattedTokenBalance,
    });
    setAmount(formattedTokenBalance);
    setIsRepayingAll(true);
  };

  // When the user manually changes the amount, they're no longer repaying all
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("Amount input changed:", {
      newValue: e.target.value,
      maxAllowed: formattedTokenBalance,
    });
    setAmount(e.target.value);
    setIsRepayingAll(false);
  };

  const handleMoveDebt = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      if (!decimals) throw new Error("Token decimals not loaded");
      setLoading(true);

      // Determine the debt amount:
      // If the user has selected "max", we'll let the contract fetch the current amount
      let computedDebtAmount: bigint;
      if (isRepayingAll) {
        computedDebtAmount = tokenBalance as bigint;
      } else {
        computedDebtAmount = parseUnits(amount, decimals as number);
      }

      // Build collateral array from selected collaterals
      const selectedCollateralArray = collaterals
        .filter(c => selectedCollaterals.has(c.symbol))
        .map(c => {
          const collateralAmount = parseUnits(c.balance.toString(), c.decimals);
          console.log(`Collateral ${c.symbol}:`, {
            balance: c.balance,
            decimals: c.decimals,
            parsedAmount: collateralAmount.toString(),
          });
          return {
            token: c.address,
            amount: collateralAmount,
          };
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
          repayAll: isRepayingAll, // Pass the repayAll flag
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
                  </div>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </label>
                <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full">
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
              <label className="text-sm text-base-content/70 mb-2 block">Select Collateral to Move</label>
              {isLoadingCollaterals ? (
                <div className="flex items-center justify-center py-4">
                  <span className="loading loading-spinner loading-md"></span>
                </div>
              ) : collaterals.length > 0 ? (
                <SelectableCollateralView collaterals={collaterals} onCollateralToggle={handleCollateralToggle} />
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
              // Compare using BigInt conversion to avoid precision issues.
              (parseUnits(amount, decimals as number) > (tokenBalance as bigint)) ||
              (position.type === "borrow" && selectedCollaterals.size === 0)
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
