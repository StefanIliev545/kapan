import { FC, ReactNode, useState, useEffect } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient, useWriteContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { FiCheck, FiAlertTriangle, FiArrowRight, FiDollarSign } from "react-icons/fi";

// Common token shape used across modals
export interface TokenInfo {
  name: string;
  icon: string;
  currentRate: number;
  address: string;
  usdPrice?: number;
  protocolAmount?: bigint;
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
  children,
}) => {
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ActionStep>("idle");
  const [isLoading, setIsLoading] = useState(false);

  // Get the RouterGateway contract
  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  // Write hooks
  const { writeContractAsync: writeRouterAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });
  const { writeContractAsync: writeErc20Async } = useWriteContract();

  // Read token balance from wallet for deposit/repay actions
  const { data: balance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [walletClient?.account?.address as `0x${string}`],
    query: {
      enabled: isOpen && actionType !== "withdraw",
      refetchInterval: 5000,
    },
  });

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
    query: {
      enabled: isOpen,
    },
  });

  const formattedBalance = decimals
    ? actionType === "withdraw"
      ? formatUnits((token.protocolAmount || 0n) as bigint, decimals as number)
      : balance
        ? formatUnits(balance as bigint, decimals as number)
        : "0"
    : "0";

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
    }
  }, [isOpen]);

  // Helper for mapping action type to function name
  const getRouterFunctionName = (
    action: TokenActionType,
  ): "borrow" | "supply" | "repay" | "withdraw" => {
    switch (action) {
      case "borrow":
        return "borrow";
      case "deposit":
        return "supply";
      case "repay":
        return "repay";
      case "withdraw":
        return "withdraw";
    }
  };

  // Execute the token action
  const handleAction = async () => {
    if (!walletClient || !routerGateway || !publicClient || !decimals || !userAddress) {
      setError("Missing required dependencies");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const parsedAmount = parseUnits(amount, decimals as number);
      const lowerProtocolName = protocolName.toLowerCase();

      if (actionType === "borrow") {
        setStep("approving");
        try {
          const approvals = await routerGateway.read.getEncodedDebtApproval([
            lowerProtocolName,
            token.address,
            parsedAmount,
            userAddress,
          ]);

          const [targets, data] = approvals;
          for (let i = 0; i < targets.length; i++) {
            const txHash = await walletClient.sendTransaction({
              to: targets[i],
              data: data[i],
            });
            console.log(`Sent approval ${i}: ${txHash}`);
            await publicClient.waitForTransactionReceipt({ hash: txHash });
            console.log(`Approval ${i} confirmed`);
          }
        } catch (err) {
          console.error("Error getting debt approval:", err);
          setError(`Approval failed: ${err instanceof Error ? err.message : "Unknown error"}`);
          setIsLoading(false);
          return;
        }
        setStep("approved");
      } else if (actionType === "deposit" || actionType === "repay") {
        setStep("approving");
        try {
          const approveTx = await writeErc20Async({
            address: token.address as `0x${string}`,
            abi: ERC20ABI,
            functionName: "approve",
            args: [routerGateway.address, parsedAmount],
          });

          console.log("Approve tx sent:", approveTx);
          await publicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
          console.log("Approve tx confirmed");
        } catch (err) {
          console.error("Error approving token transfer:", err);
          setError(`Approval failed: ${err instanceof Error ? err.message : "Unknown error"}`);
          setIsLoading(false);
          return;
        }
        setStep("approved");
      }

      setStep("executing");

      const functionName = getRouterFunctionName(actionType);

      try {
        const actionTx = await writeRouterAsync({
          functionName,
          args: [lowerProtocolName, token.address, userAddress, parsedAmount],
        });

        console.log(`${actionType} tx sent:`, actionTx);
        await publicClient.waitForTransactionReceipt({ hash: actionTx as `0x${string}` });
        console.log(`${actionType} tx confirmed`);

        setStep("done");
        setTimeout(() => onClose(), 2000);
      } catch (err) {
        console.error(`Error executing ${actionType}:`, err);
        setError(`${actionType} failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
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
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
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
            <div> EVM </div>
            <div className="avatar">
              <div className="w-14 h-14 rounded-full ring-2 ring-base-content/5 p-1 bg-base-100 shadow-md">
                <Image 
                  src={token.icon} 
                  alt={token.name} 
                  width={48} 
                  height={48} 
                  className="rounded-full"
                />
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
                  Balance: <span className="font-medium">{formatDisplayNumber(formattedBalance)} {token.name}</span>
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
                  onClick={() => setAmount(formattedBalance)}
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
              <span className="text-base-content/70">
                {(actionType === "deposit" || actionType === "withdraw") ? "Supply" : "Borrow"} APY:
              </span>
              <span className="font-bold text-lg">
                {token.currentRate.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1 text-xs text-base-content/60">
              {actionType === "deposit" || actionType === "withdraw"
                ? "The estimated annual yield based on current market conditions."
                : "The estimated annual cost of borrowing based on current market conditions."}
            </div>
          </div>

          {/* Custom children content */}
          {children}

          {/* Transaction Flow Visual Steps */}
          <div className={`flex items-center w-full relative py-5 ${actionType === "withdraw" ? "justify-center" : ""}`}>
            {actionType !== "withdraw" && (
              <>
                {/* Step 1: Approve */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
                  step === "idle" ? "bg-base-300 text-base-content/50" :
                  step === "approving" ? "bg-primary animate-pulse text-primary-content" :
                  "bg-success text-success-content"
                }`}>
                  {step === "idle" ? "1" : step === "approving" ? "1" : <FiCheck className="w-5 h-5" />}
                </div>

                {/* Connecting Line */}
                <div className={`flex-1 h-1 transition-all duration-500 ${
                  step === "idle" ? "bg-base-300" :
                  step === "approving" ? "bg-primary/40" :
                  "bg-success"
                }`}></div>
              </>
            )}

            {/* Step 2: Execute Action */}
            <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${
              step === "idle" || step === "approving" ? "bg-base-300 text-base-content/50" :
              step === "executing" ? "bg-primary animate-pulse text-primary-content" :
              step === "done" ? "bg-success text-success-content" :
              "bg-primary text-primary-content"
            }`}>
              {step === "idle" || step === "approving" ? "2" :
               step === "executing" ? "2" :
               step === "done" ? <FiCheck className="w-5 h-5" /> : "2"}
            </div>
          </div>

          {/* Step labels */}
          <div className={`text-sm px-1 ${actionType === "withdraw" ? "flex justify-center" : "flex justify-between"}`}>
            {actionType !== "withdraw" && (
              <div className="text-center max-w-[120px]">
                <p className="font-medium">Approve</p>
                <p className="text-xs text-base-content/70">Allow the contract to interact with your {token.name}</p>
              </div>
            )}
            <div className="text-center max-w-[120px]">
              <p className="font-medium">{actionLabel || actionType}</p>
              <p className="text-xs text-base-content/70">
                {actionType === "deposit" ? `Supply ${token.name} to ${protocolName}` :
                 actionType === "borrow" ? `Borrow ${token.name} from ${protocolName}` :
                 actionType === "repay" ? `Repay ${token.name} to ${protocolName}` :
                 `Withdraw ${token.name} from ${protocolName}`}
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
              <button
                className="btn btn-success btn-lg w-full gap-2 h-14"
                onClick={onClose}
              >
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
              <button 
                className="btn btn-ghost btn-sm w-full" 
                onClick={onClose} 
                disabled={isLoading}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
      
      <form method="dialog" className="modal-backdrop backdrop-blur-sm bg-black/20" onClick={isLoading ? undefined : onClose}>
        <button disabled={isLoading}>close</button>
      </form>
    </dialog>
  );
};
