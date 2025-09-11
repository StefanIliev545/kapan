import { FC, ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useReadContract } from "@starknet-react/core";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiDollarSign } from "react-icons/fi";
import {
  BigNumberish,
  ByteArray,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  RpcProvider,
  byteArray,
  num,
  uint256,
} from "starknet";
import { WalletAccount, wallet } from "starknet";
import { formatUnits, parseUnits } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";
import {
  useDeployedContractInfo,
  useScaffoldMultiWriteContract,
  useScaffoldReadContract,
} from "~~/hooks/scaffold-stark";
import { useAccount } from "~~/hooks/useAccount";
import { universalErc20Abi } from "~~/utils/Constants";
import formatPercentage from "~~/utils/formatPercentage";
import { feltToString } from "~~/utils/protocols";

// Helper to convert a string to its felt representation
const stringToFelt = (s: string): string => {
  return BigInt("0x" + Buffer.from(s, "utf8").toString("hex")).toString();
};

// Common token shape used across modals
export interface TokenInfo {
  name: string;
  icon: string;
  currentRate: number;
  address: string;
  protocolAmount?: bigint; // Add protocol balance/debt amount for withdraw/repay actions
  usdPrice?: number;
}

export interface VesuContext {
  pool_id: bigint;
  counterpart_token: string;
}

// Different action types supported
export type TokenActionType = "borrow" | "deposit" | "repay" | "withdraw";

// Step tracking for all token action flows
export type ActionStep = "idle" | "approving" | "approved" | "executing" | "done";

export interface BaseTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  actionType: TokenActionType;
  vesuContext?: VesuContext;
  actionLabel?: string;
  children?: ReactNode;
}

export const BaseTokenModal: FC<BaseTokenModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  actionType,
  actionLabel,
  vesuContext,
  children,
}) => {
  const { address: userAddress } = useAccount();
  const [amount, setAmount] = useState("");
  const [isMaxAmount, setIsMaxAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ActionStep>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [walletAccount, setWalletAccount] = useState<WalletAccount | null>(null);

  // Get the RouterGateway contract
  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: universalErc20Abi,
    args: [],
    functionName: "decimals",
    enabled: isOpen,
  });

  // Read token balance from wallet - used for deposit and repay operations
  const { data: walletBalance } = useReadContract({
    address: token.address as `0x${string}`,
    functionName: "balance_of",
    abi: universalErc20Abi,
    args: [userAddress as `0x${string}`],
    blockIdentifier: "pending",
    enabled: isOpen && (actionType === "deposit" || actionType === "repay"),
  });

  // Determine which balance to use based on action type
  const effectiveBalance = useMemo(() => {
    // For withdraw, use protocol balance if provided
    if (actionType === "withdraw" && token.protocolAmount !== undefined) {
      return token.protocolAmount;
    }
    // For repay, use the minimum of wallet balance and protocol amount (debt)
    // This ensures users can't attempt to repay more than they have in their wallet
    if (actionType === "repay" && token.protocolAmount !== undefined) {
      const walletBal = (walletBalance as bigint) || BigInt(0);
      return walletBal < token.protocolAmount ? walletBal : token.protocolAmount;
    }
    // Otherwise, fall back to wallet balance
    return (walletBalance as bigint) || BigInt(0);
  }, [actionType, token.protocolAmount, walletBalance]);

  const formattedBalance = effectiveBalance && decimals ? formatUnits(effectiveBalance, Number(decimals)) : "0";

  // Construct instruction based on current state
  const { fullInstruction, authInstruction } = useMemo(() => {
    if (!amount || !userAddress || !decimals) return { fullInstruction: null, authInstruction: null };

    // If max amount is selected, add 1% to account for potential calculation discrepancies
    let adjustedAmount = amount;
    if (isMaxAmount && actionType !== "deposit") {
      const amountNum = parseFloat(amount);
      adjustedAmount = (amountNum * 1.01).toString();
    }
    const parsedAmount = parseUnits(adjustedAmount, Number(decimals));
    const lowerProtocolName = protocolName.toLowerCase();

    let context = new CairoOption<BigNumberish[]>(CairoOptionVariant.None);
    if (vesuContext) {
      context = new CairoOption<BigNumberish[]>(CairoOptionVariant.Some, [
        vesuContext.pool_id,
        vesuContext.counterpart_token,
      ]);
    }

    // Create the appropriate lending instruction based on action type
    let lendingInstruction;
    console.log(`actionType: ${actionType}`);
    switch (actionType) {
      case "deposit":
        console.log(`deposit`);
        lendingInstruction = new CairoCustomEnum({
          Deposit: {
            basic: {
              token: token.address,
              amount: uint256.bnToUint256(parsedAmount),
              user: userAddress,
            },
            context: context,
          },
          Repay: undefined,
          Borrow: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });
        break;
      case "withdraw":
        console.log(`withdraw`);
        lendingInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: {
            basic: {
              token: token.address,
              amount: uint256.bnToUint256(parsedAmount),
              user: userAddress,
            },
            withdraw_all: isMaxAmount,
            context: context,
          },
          Redeposit: undefined,
          Reborrow: undefined,
        });
        break;
      case "borrow":
        lendingInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: {
            basic: {
              token: token.address,
              amount: uint256.bnToUint256(parsedAmount),
              user: userAddress,
            },
            context: context,
          },
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });
        break;
      case "repay":
        lendingInstruction = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: {
            basic: {
              token: token.address,
              amount: uint256.bnToUint256(parsedAmount),
              user: userAddress,
            },
            repay_all:
              isMaxAmount &&
              (!token.protocolAmount || (walletBalance && BigInt(walletBalance.toString()) >= token.protocolAmount)),
            context: context,
          },
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });
        break;
    }

    // Both instructions use the same lending instruction
    const fullInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [lendingInstruction],
        },
      ],
    });

    // Auth instruction is the same but includes the rawSelectors: false flag
    const authInstructionData = CallData.compile({
      instructions: [
        {
          protocol_name: lowerProtocolName,
          instructions: [lendingInstruction],
        },
      ],
      rawSelectors: false,
    });

    return {
      fullInstruction: fullInstructionData,
      authInstruction: authInstructionData,
    };
  }, [amount, userAddress, decimals, protocolName, vesuContext, actionType, token.address, isMaxAmount]);

  const { data: protocolInstructions, error: protocolInstructionsError } = useScaffoldReadContract({
    contractName: "RouterGateway" as const,
    functionName: "get_authorizations_for_instructions" as const,
    args: [authInstruction],
    enabled: !!authInstruction && isOpen,
    refetchInterval: 5000,
  } as any);

  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!fullInstruction) return [];

    const authorizations = [];
    if (protocolInstructions) {
      const instructionsArray = protocolInstructions as unknown as [bigint, bigint, bigint[]][];
      for (const instruction of instructionsArray) {
        const address = num.toHexString(instruction[0]);
        console.log(`address: ${address}`);
        const entrypoint = feltToString(instruction[1]);
        console.log(`entrypoint: ${entrypoint}`);
        console.log(`instruction[2]: ${instruction[2]}`);
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
        functionName: "process_protocol_instructions" as const,
        args: fullInstruction,
      },
    ];
  }, [fullInstruction, protocolInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  // Calculate USD value using token price if available
  const getUsdValue = () => {
    if (!amount || isNaN(Number(amount))) return "0.00";
    const price = token.usdPrice ?? 0;
    return formatDisplayNumber(Number(amount) * price);
  };

  // Reset the state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setError(null);
      setStep("idle");
      setIsLoading(false);
      setIsMaxAmount(false);
    }
  }, [isOpen]);

  // Add a useEffect to reset isMaxAmount when amount changes manually
  useEffect(() => {
    if (amount !== formattedBalance) {
      setIsMaxAmount(false);
    }
  }, [amount, formattedBalance]);

  // Execute the token action
  const handleAction = async () => {
    const missingDeps = [];
    if (!routerGateway) missingDeps.push("router gateway");
    if (!decimals) missingDeps.push("token decimals");
    if (!userAddress) missingDeps.push("user address");

    if (missingDeps.length > 0) {
      setError(`Missing required dependencies: ${missingDeps.join(", ")}`);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setStep("approving");
      setStep("executing");
      // Execute the transaction
      const tx = await sendAsync();
      console.log(`${actionType} tx sent:`, tx);
      console.log(`${actionType} tx confirmed`);

      setStep("done");

      // Close modal after a short delay on success
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error(`${actionType} error:`, err);
      setError(err.message || `${actionType} failed`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get action button text based on current step
  const getActionButtonText = () => {
    if (isLoading) {
      switch (step) {
        case "approving":
          return "Approving...";
        case "executing":
          return `${actionLabel || actionType}ing...`;
        default:
          return "Processing...";
      }
    }

    if (step === "approved") {
      return `Confirm ${actionLabel || actionType}`;
    }

    if (step === "done") {
      return "Done!";
    }

    return actionLabel || actionType;
  };

  // Get action button class based on current step
  const getActionButtonClass = () => {
    if (step === "done") {
      return "btn-success";
    }
    return actionType === "borrow" ? "btn-secondary" : "btn-primary";
  };

  // Get proper action color with gradients
  const getActionColor = () => {
    switch (actionType) {
      case "borrow":
        return "font-extrabold bg-gradient-to-r from-purple-500 via-secondary to-blue-500 bg-clip-text text-transparent dark:from-purple-300 dark:via-pink-400 dark:to-blue-300";
      case "deposit":
        return "font-extrabold bg-gradient-to-r from-primary via-cyan-500 to-sky-500 bg-clip-text text-transparent dark:from-blue-300 dark:via-cyan-300 dark:to-teal-300";
      case "repay":
        return "font-extrabold bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500 bg-clip-text text-transparent dark:from-teal-300 dark:via-emerald-300 dark:to-green-300";
      default:
        return "font-extrabold bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent dark:from-blue-300 dark:via-indigo-300 dark:to-violet-300";
    }
  };

  // Format number with thousands separators for display
  const formatDisplayNumber = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-lg p-0 overflow-hidden">
        {/* Header with gradient background */}
        <div className="relative p-6 bg-gradient-to-r from-base-200 to-base-300">
          <div className="absolute top-4 right-4">
            <button
              className="btn btn-sm btn-circle btn-ghost"
              onClick={onClose}
              disabled={isLoading && step !== "done"}
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="avatar">
              <div className="w-14 h-14 rounded-full ring-2 ring-base-content/5 p-1 bg-base-100 shadow-md">
                <Image src={token.icon} alt={token.name} width={48} height={48} className="rounded-full" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                <span className={getActionColor()}>{actionLabel || actionType}</span>
                <span className="text-base-content">{token.name}</span>
              </h3>
              <div className="text-sm opacity-70">{protocolName}</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="p-6 space-y-6">
          {/* Amount input section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-base-content/80">Amount</label>
                <div className="badge badge-sm badge-neutral flex items-center gap-1">
                  <FiDollarSign className="w-3 h-3" />
                  <span>{getUsdValue()}</span>
                </div>
              </div>
              {(actionType === "deposit" || actionType === "repay" || actionType === "withdraw") && (
                <div className="text-sm text-base-content/70">
                  Balance:{" "}
                  <span className="font-medium">
                    {formatDisplayNumber(formattedBalance)} {token.name}
                  </span>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="number"
                className="input input-bordered w-full pr-20 h-14 text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isLoading || step !== "idle"}
                max={actionType === "borrow" ? undefined : formattedBalance}
              />

              {(actionType === "deposit" || actionType === "repay" || actionType === "withdraw") && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm btn-outline h-8"
                  onClick={() => {
                    setAmount(formattedBalance);
                    setIsMaxAmount(true);
                  }}
                  disabled={isLoading || step !== "idle"}
                >
                  MAX
                </button>
              )}
            </div>
          </div>

          {/* Interest rate info */}
          <div className="p-4 bg-base-200 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-base-content/70">{actionType === "deposit" ? "Supply" : "Borrow"} APY:</span>
              <span className="font-bold text-lg">{formatPercentage(token.currentRate)}%</span>
            </div>
            <div className="mt-1 text-xs text-base-content/60">
              {actionType === "deposit"
                ? "The estimated annual yield based on current market conditions."
                : "The estimated annual cost of borrowing based on current market conditions."}
            </div>
          </div>

          {/* Custom children content */}
          {children}

          {/* Transaction Flow Visual Steps */}
          <div className="flex items-center w-full relative py-5">
            {/* Step 1: Approve */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
                step === "idle"
                  ? "bg-base-300 text-base-content/50"
                  : step === "approving"
                    ? "bg-primary animate-pulse text-primary-content"
                    : "bg-success text-success-content"
              }`}
            >
              {step === "idle" ? "1" : step === "approving" ? "1" : <FiCheck className="w-5 h-5" />}
            </div>

            {/* Connecting Line */}
            <div
              className={`flex-1 h-1 transition-all duration-500 ${
                step === "idle" ? "bg-base-300" : step === "approving" ? "bg-primary/40" : "bg-success"
              }`}
            ></div>

            {/* Step 2: Execute Action */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
                step === "idle" || step === "approving"
                  ? "bg-base-300 text-base-content/50"
                  : step === "executing"
                    ? "bg-primary animate-pulse text-primary-content"
                    : step === "done"
                      ? "bg-success text-success-content"
                      : "bg-primary text-primary-content"
              }`}
            >
              {step === "idle" || step === "approving" ? (
                "2"
              ) : step === "executing" ? (
                "2"
              ) : step === "done" ? (
                <FiCheck className="w-5 h-5" />
              ) : (
                "2"
              )}
            </div>
          </div>

          {/* Step labels */}
          <div className="flex justify-between text-sm px-1">
            <div className="text-center max-w-[120px]">
              <p className="font-medium">Approve</p>
              <p className="text-xs text-base-content/70">Allow the contract to interact with your {token.name}</p>
            </div>
            <div className="text-center max-w-[120px]">
              <p className="font-medium">{actionLabel || actionType}</p>
              <p className="text-xs text-base-content/70">
                {actionType === "deposit"
                  ? `Supply ${token.name} to ${protocolName}`
                  : actionType === "borrow"
                    ? `Borrow ${token.name} from ${protocolName}`
                    : `Repay ${token.name} to ${protocolName}`}
              </p>
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
          <div className="pt-4 flex flex-col gap-3">
            {step === "done" ? (
              <button className="btn btn-success btn-lg w-full gap-2 h-14" onClick={onClose}>
                <FiCheck className="w-5 h-5" /> Transaction Complete
              </button>
            ) : (
              <button
                className={`btn ${getActionButtonClass()} btn-lg w-full h-14 transition-all duration-300 ${isLoading ? "animate-pulse" : ""}`}
                onClick={handleAction}
                disabled={
                  isLoading ||
                  !amount ||
                  !userAddress ||
                  Number(amount) <= 0 ||
                  (step !== "idle" && step !== "approved")
                }
              >
                {isLoading && <span className="loading loading-spinner loading-sm mr-2"></span>}
                {getActionButtonText()}
                {!isLoading && step === "idle" && <FiArrowRight className="w-5 h-5 ml-1" />}
              </button>
            )}

            {step !== "done" && (
              <button className="btn btn-ghost btn-sm w-full" onClick={onClose} disabled={isLoading}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <form
        method="dialog"
        className="modal-backdrop backdrop-blur-sm bg-black/20"
        onClick={isLoading ? undefined : onClose}
      >
        <button disabled={isLoading}>close</button>
      </form>
    </dialog>
  );
};
