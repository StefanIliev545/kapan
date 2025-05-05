import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useAccount } from "@starknet-react/core";
import { useReadContract } from "@starknet-react/core";
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
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, num, uint256 } from "starknet";
import { formatUnits, parseUnits } from "viem";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import {
  useDeployedContractInfo,
  useScaffoldMultiWriteContract,
  useScaffoldReadContract,
} from "~~/hooks/scaffold-stark";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import { getProtocolLogo } from "~~/utils/protocol";
import { feltToString } from "~~/utils/protocols";

// Format number with thousands separators for display
const formatDisplayNumber = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(num);
};

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
  preSelectedCollaterals?: CollateralWithAmount[];
  disableCollateralSelection?: boolean;
}

type VesuContext = {
  pool_id: bigint;
  counterpart_token: string;
}

type FlashLoanProvider = {
  name: "Vesu";
  icon: string;
  version: "v1";
};

const FLASH_LOAN_PROVIDER: FlashLoanProvider = {
  name: "Vesu",
  icon: "/logos/vesu.svg",
  version: "v1",
} as const;

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position, preSelectedCollaterals, disableCollateralSelection }) => {
  const { address: userAddress } = useAccount();
  const protocols = [{ name: "Nostra" }, { name: "Vesu" }];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] = useState<CollateralWithAmount[]>(
    preSelectedCollaterals || []
  );
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Get the RouterGateway contract
  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");

  // For source protocol, use preselected collaterals for Vesu or fetch from useCollateral
  const { collaterals: sourceCollaterals, isLoading: isLoadingSourceCollaterals } = useCollateral({
    protocolName: fromProtocol as "Vesu" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !(disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu"), // Skip for preselected Vesu
  });

  // For target protocol, always fetch collaterals to determine compatibility
  const { collaterals: targetCollaterals, isLoading: isLoadingTargetCollaterals } = useCollateral({
    protocolName: selectedProtocol as "Vesu" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !!selectedProtocol,
  });

  // Only show collaterals with balance > 0
  const collateralsForSelector = useMemo(() => {
    // For Vesu with preselected collaterals, use those directly
    if (disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu") {
      // Convert preSelectedCollaterals to CollateralToken format
      return preSelectedCollaterals.map(collateral => ({
        symbol: collateral.symbol,
        balance: Number(collateral.inputValue || collateral.amount.toString()),
        address: collateral.token,
        decimals: collateral.decimals,
        rawBalance: collateral.amount,
        supported: true
      }));
    }

    // Otherwise use filtered source collaterals
    const filtered = sourceCollaterals.filter(c => c.balance > 0);
    
    // Check which collaterals are supported by the target protocol
    if (targetCollaterals.length > 0) {
      return filtered.map(collateral => {
        const isSupported = targetCollaterals.some(
          tc => tc.address.toLowerCase() === collateral.address.toLowerCase()
        );
        return {
          ...collateral,
          supported: isSupported
        };
      });
    }
    
    return filtered;
  }, [sourceCollaterals, targetCollaterals, preSelectedCollaterals, disableCollateralSelection, fromProtocol]);

  // Track loading state for all collaterals
  const isLoadingCollaterals = isLoadingSourceCollaterals || isLoadingTargetCollaterals;

  // Construct instruction based on current state
  const { fullInstruction, authInstruction } = useMemo(() => {
    if (!amount || !userAddress || !routerGateway) return { fullInstruction: null, authInstruction: null };

    const parsedAmount = parseUnits(amount, 18); // Assuming 18 decimals for StarkNet tokens
    const lowerProtocolName = fromProtocol.toLowerCase();
    const destProtocolName = selectedProtocol.toLowerCase();

    let repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    if (fromProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 0) {
        repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
            0n,
            BigInt(selectedCollateralsWithAmounts[0].token),
        ]);
        withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
            0n,
            BigInt(position.tokenAddress),
        ]);
    }

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: userAddress,
        },
        context: repayInstructionContext,
      },
      Withdraw: undefined,
    });
    
    // Auth instructions only need withdraw and borrow
    const withdrawInstructions = selectedCollateralsWithAmounts.map(collateral => {
      const amount = uint256.bnToUint256(parseUnits(collateral.amount.toString(), 18));
      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: {
          basic: {
            token: collateral.token,
            amount: amount,
            user: userAddress,
          },
          context: withdrawInstructionContext,
        },
      });
    });

    const depositInstructions = selectedCollateralsWithAmounts.map(collateral => {
      const amount = uint256.bnToUint256(parseUnits(collateral.amount.toString(), 18));
      return new CairoCustomEnum({
        Deposit: {
          basic: {
            token: collateral.token,
            amount: amount,
            user: userAddress,
          },
          context: new CairoOption<bigint[]>(CairoOptionVariant.None),
        },
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
      });
    });
    
    const borrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: userAddress,
        },
        context: new CairoOption<bigint[]>(CairoOptionVariant.None),
      },
      Repay: undefined,
      Withdraw: undefined,
    });

    // Complete set of instructions for execution
    const fullInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [repayInstruction, ...withdrawInstructions],
        },
        {
          protocol_name: destProtocolName,
          instructions: [...depositInstructions, borrowInstruction],
        },
      ],
    });

    // Only withdraw and borrow instructions for authorization
    const authInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [...withdrawInstructions],
        },
        {
          protocol_name: destProtocolName,
          instructions: [borrowInstruction],
        },
      ],
    });

    return { 
      fullInstruction: fullInstructionData, 
      authInstruction: authInstructionData 
    };
  }, [amount, userAddress, fromProtocol, selectedProtocol, position, routerGateway, selectedCollateralsWithAmounts]);

  // Get authorizations for the instructions
  const { data: protocolInstructions } = useScaffoldReadContract({
    contractName: "RouterGateway" as const,
    functionName: "get_authorizations_for_instructions" as const,
    args: authInstruction ? [authInstruction] : undefined,
    enabled: !!authInstruction,
    refetchInterval: 5000,
  } as any);

  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!fullInstruction) return [];

    const authorizations = [];
    if (protocolInstructions) {
      // Use explicit type for instruction
      const instructionsArray = protocolInstructions as unknown as [bigint, bigint, bigint[]][];
      for (const instruction of instructionsArray) {
        const address = num.toHexString(instruction[0]);
        const entrypoint = feltToString(instruction[1]);
        authorizations.push({
          contractAddress: address,
          entrypoint: entrypoint,
          calldata: (instruction[2] as bigint[]).map(f => num.toHexString(f)),
        });
      }
    }

    return [
      ...(authorizations as any),
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: fullInstruction,
      },
    ];
  }, [fullInstruction, protocolInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  // Reset the state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setError(null);
      setStep("idle");
      setLoading(false);
      setSelectedCollateralsWithAmounts([]);
    }
  }, [isOpen]);

  const handleMovePosition = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setStep("executing");

      // Execute the transaction
      const tx = await sendAsync();
      console.log("Move position tx sent:", tx);
      console.log("Move position tx confirmed");

      setStep("done");
      // Close modal after a short delay on success
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error("Move position failed:", err);
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

  // Handler for collateral selection and amount changes
  const handleCollateralSelectionChange = (collaterals: CollateralWithAmount[]) => {
    setSelectedCollateralsWithAmounts(collaterals);
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-2xl max-h-[100vh] h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header with gradient background, reduced height */}
        <div className="relative p-3 bg-gradient-to-r from-base-200 to-base-300">
          <div className="absolute top-2 right-2">
            <button className="btn btn-xs btn-circle btn-ghost" onClick={onClose} disabled={loading && step !== "done"}>
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="avatar">
                <div className="w-10 h-10 rounded-full ring-2 ring-base-content/5 p-1 bg-base-100 shadow-md">
                  <Image
                    src={tokenNameToLogo(position.name)}
                    alt={position.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                </div>
              </div>
              <div className="absolute -right-1 -bottom-1 bg-base-100 rounded-full p-0.5 shadow-md">
                {position.type === "borrow" ? (
                  <FiArrowRightCircle className="text-primary w-5 h-5" />
                ) : (
                  <FiTrendingUp className="text-emerald-500 w-5 h-5" />
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
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
              <div className="text-xs opacity-70 flex items-center gap-1">
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

        {/* Main content area - scrollable with NO button inside */}
        <div className="p-2 space-y-3 flex-1 overflow-y-auto">
          {/* Protocol Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* From Protocol */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-base-content/80">From Protocol</label>
              <div className="bg-base-200/60 py-2 px-3 rounded-lg flex items-center justify-between h-[40px]">
                <div className="flex items-center gap-2 truncate">
                  <Image
                    src={getProtocolLogo(fromProtocol)}
                    alt={fromProtocol}
                    width={20}
                    height={20}
                    className="rounded-full min-w-[20px]"
                  />
                  <span className="truncate font-medium text-sm">{fromProtocol}</span>
                </div>
              </div>
            </div>

            {/* To Protocol */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-base-content/80">To Protocol</label>
              <div className="dropdown w-full">
                <div
                  tabIndex={0}
                  className="bg-base-200/60 hover:bg-base-200 transition-colors py-2 px-3 rounded-lg flex items-center justify-between cursor-pointer h-[40px]"
                >
                  <div className="flex items-center gap-2 w-[calc(100%-24px)] overflow-hidden">
                    {selectedProtocol ? (
                      <>
                        <Image
                          src={getProtocolLogo(selectedProtocol)}
                          alt={selectedProtocol}
                          width={20}
                          height={20}
                          className="rounded-full min-w-[20px]"
                        />
                        <span className="truncate font-medium text-sm">{selectedProtocol}</span>
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
                          className="flex items-center gap-2 py-1"
                          onClick={() => setSelectedProtocol(protocol.name)}
                        >
                          <Image
                            src={getProtocolLogo(protocol.name)}
                            alt={protocol.name}
                            width={20}
                            height={20}
                            className="rounded-full min-w-[20px]"
                          />
                          <span className="truncate text-sm">{protocol.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-1">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-medium text-base-content/80 flex items-center gap-1">
                Amount
                {position.type === "supply" && <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />}
              </label>
              <div className="text-xs bg-base-200/60 py-1 px-2 rounded-lg flex items-center">
                <span className="text-base-content/70">Available:</span>
                <span className="font-medium ml-1">
                  {formatDisplayNumber(Math.abs(position.balance))} {position.name}
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                className="input input-bordered w-full pr-20 h-10 text-base focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={loading || step !== "idle"}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-xs btn-outline h-7"
                onClick={() => {
                  const maxValue = Math.abs(position.balance);
                  if (!isNaN(maxValue) && isFinite(maxValue)) {
                    setAmount(maxValue.toString());
                  } else {
                    setAmount("0");
                    console.error("Invalid position balance:", position.balance);
                  }
                }}
                disabled={loading || step !== "idle"}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Loading state for collaterals */}
          {position.type === "borrow" && isLoadingCollaterals ? (
            <div className="flex flex-col items-center justify-center min-h-[30vh] py-8">
              <span className="loading loading-spinner loading-md mb-3"></span>
              <span className="text-base-content/70">Loading collaterals...</span>
            </div>
          ) : position.type === "borrow" && collateralsForSelector.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-1">
                <CollateralSelector
                  collaterals={collateralsForSelector}
                  isLoading={false}
                  selectedProtocol={selectedProtocol}
                  onCollateralSelectionChange={handleCollateralSelectionChange}
                  marketToken={position.tokenAddress}
                />
                
                {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
                  <div className="text-xs text-base-content/70 mt-2 p-2 bg-info/10 rounded">
                    <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this collateral cannot be changed.
                  </div>
                )}
              </div>
            </div>
          ) : position.type === "borrow" ? (
            <div className="alert alert-info shadow-sm">
              <div className="text-sm">No collaterals available with balance greater than 0.</div>
            </div>
          ) : null}

          {/* Error message */}
          {error && (
            <div className="alert alert-error shadow-lg">
              <FiAlertTriangle className="w-6 h-6" />
              <div className="text-sm flex-1">{error}</div>
            </div>
          )}
        </div>

        {/* Button positioned at the bottom of the modal, outside the scrollable area */}
        <div className="p-4 border-t border-base-200 bg-base-100">
          <button
            className={`btn ${getActionButtonClass()} btn-md w-full h-12 transition-all duration-300 shadow-md ${loading ? "animate-pulse" : ""}`}
            onClick={handleMovePosition}
            disabled={
              loading ||
              !selectedProtocol ||
              !amount ||
              !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
              step !== "idle"
            }
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
