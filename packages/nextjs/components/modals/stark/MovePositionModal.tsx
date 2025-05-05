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
import { useAccount } from "@starknet-react/core";
import { useDeployedContractInfo, useScaffoldMultiWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-stark";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { getProtocolLogo } from "~~/utils/protocol";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256, num } from "starknet";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { feltToString } from "~~/utils/protocols";
import { useReadContract } from "@starknet-react/core";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";

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

export const MovePositionModal: FC<MovePositionModalProps> = ({ isOpen, onClose, fromProtocol, position }) => {
  const { address: userAddress } = useAccount();
  const protocols = [
    { name: "Nostra" },
    { name: "Vesu" },
  ];

  const [selectedProtocol, setSelectedProtocol] = useState(protocols.find(p => p.name !== fromProtocol)?.name || "");
  const [amount, setAmount] = useState("");
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] = useState<CollateralWithAmount[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Get the RouterGateway contract
  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");

  // Use the new hook to get all collateral info
  const { collaterals: collateralsForSelector, isLoading: isLoadingCollaterals } = useCollateral({
    protocolName: selectedProtocol as "Vesu" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen,
  });

  // Construct instruction based on current state
  const instruction = useMemo(() => {
    if (!amount || !userAddress || !routerGateway) return null;

    const parsedAmount = parseUnits(amount, 18); // Assuming 18 decimals for StarkNet tokens
    const lowerProtocolName = fromProtocol.toLowerCase();

    // Create the appropriate lending instruction based on position type
    let lendingInstruction;
    if (position.type === "borrow") {
      // For borrow positions, we need to create a repay instruction for the source protocol
      // and a borrow instruction for the destination protocol
      lendingInstruction = new CairoCustomEnum({
        Repay: {
          basic: {
            token: position.tokenAddress,
            amount: uint256.bnToUint256(parsedAmount),
            user: userAddress,
          },
          context: new CairoOption<bigint[]>(CairoOptionVariant.None),
        },
        Deposit: undefined,
        Borrow: undefined,
        Withdraw: undefined,
      });
    } else {
      // For supply positions, we need to create a withdraw instruction for the source protocol
      // and a deposit instruction for the destination protocol
      lendingInstruction = new CairoCustomEnum({
        Withdraw: {
          basic: {
            token: position.tokenAddress,
            amount: uint256.bnToUint256(parsedAmount),
            user: userAddress,
          },
          context: new CairoOption<bigint[]>(CairoOptionVariant.None),
        },
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
      });
    }

    return CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [lendingInstruction],
        },
      ],
    });
  }, [amount, userAddress, fromProtocol, position, routerGateway]);

  // Get authorizations for the instructions
  const { data: protocolInstructions } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "get_authorizations_for_instructions",
    args: [instruction],
    enabled: !!instruction,
    refetchInterval: 5000,
  });

  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!instruction) return [];

    const authorizations = [];
    if (protocolInstructions) {
      for (const instruction of protocolInstructions) {
        const address = num.toHexString(instruction[0]);
        const entrypoint = feltToString(instruction[1]);
        authorizations.push({
          contractName: "RouterGateway" as const,
          functionName: "process_protocol_instructions" as const,
          args: {
            contractAddress: address,
            entrypoint: entrypoint,
            calldata: (instruction[2] as bigint[]).map(f => num.toHexString(f)),
          },
        });
      }
    }

    return [
      ...authorizations,
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: instruction,
      },
    ];
  }, [instruction, protocolInstructions]);

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
        <div className="p-6 space-y-6">
          {/* Protocol Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* From Protocol */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-base-content/80">From Protocol</label>
              <div className="bg-base-200/60 py-3 px-4 rounded-lg flex items-center justify-between h-[52px]">
                <div className="flex items-center gap-3 truncate">
                  <Image
                    src={getProtocolLogo(fromProtocol)}
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
                          src={getProtocolLogo(selectedProtocol)}
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
                            src={getProtocolLogo(protocol.name)}
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
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-base-content/80 flex items-center gap-1">
                Amount
                {position.type === "supply" && <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />}
              </label>
              <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                <span className="text-base-content/70">Available:</span>
                <span className="font-medium ml-1">
                  {formatDisplayNumber(position.balance)} {position.name}
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                className="input input-bordered w-full pr-20 h-14 text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={loading || step !== "idle"}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm btn-outline h-8"
                onClick={() => setAmount(position.balance.toString())}
                disabled={loading || step !== "idle"}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Collateral Selection */}
          {position.type === "borrow" && (
            <CollateralSelector
              collaterals={collateralsForSelector}
              isLoading={isLoadingCollaterals}
              selectedProtocol={selectedProtocol}
              onCollateralSelectionChange={handleCollateralSelectionChange}
              marketToken={position.tokenAddress}
            />
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
                    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
                    step !== "idle";

                  return (
                    <button
                      className={`btn ${getActionButtonClass()} btn-lg w-full h-14 transition-all duration-300 shadow-md ${loading ? "animate-pulse" : ""}`}
                      onClick={handleMovePosition}
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