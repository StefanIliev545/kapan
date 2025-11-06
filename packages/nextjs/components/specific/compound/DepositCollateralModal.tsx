import { FC, useEffect, useState } from "react";
import Image from "next/image";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiDollarSign } from "react-icons/fi";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWalletClient, useWriteContract, useSwitchChain } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import formatPercentage from "~~/utils/formatPercentage";
import { notification } from "~~/utils/scaffold-eth";

// Define the step type for tracking the deposit flow
type DepositStep = "idle" | "approving" | "approved" | "executing" | "done";

interface DepositCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
    currentRate?: number; // Optional APY rate
  };
  market: string; // The debt token address (market in Compound)
  chainId?: number;
}

export const DepositCollateralModal: FC<DepositCollateralModalProps> = ({ isOpen, onClose, token, market, chainId }) => {
  const { address: userAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<DepositStep>("idle");
  const [isLoading, setIsLoading] = useState(false);

  // Get CompoundGateway contract
  const { data: compoundGateway } = useScaffoldContract({
    contractName: "CompoundGatewayView",
  });

  // Write functions
  const { writeContractAsync: writeContractAsync } = useScaffoldWriteContract({
    contractName: "CompoundGatewayView",
  });
  const { writeContractAsync: writeErc20Async } = useWriteContract();

  // Read token balance
  const { data: balance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [walletClient?.account?.address as `0x${string}`],
    query: {
      enabled: isOpen,
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

  const formattedBalance = balance && decimals ? formatUnits(balance as bigint, decimals as number) : "0";

  // Reset the state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setError(null);
      setStep("idle");
      setIsLoading(false);
    }
  }, [isOpen]);

  // Ensure wallet is on the correct EVM network when modal opens
  useEffect(() => {
    if (!isOpen || !chainId) return;
    if (chain?.id !== chainId) {
      try {
        switchChain?.({ chainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }
  }, [isOpen, chainId, chain?.id, switchChain]);

  // Format number with thousands separators for display
  const formatDisplayNumber = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0.00";
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(num);
  };

  const handleDeposit = async () => {
    if (!walletClient || !compoundGateway || !publicClient || !userAddress) {
      setError("Missing required dependencies");
      return;
    }

    try {
      if (chainId && chain?.id !== chainId) {
        try {
          await switchChain?.({ chainId });
        } catch (e) {
          setError("Please switch to the selected network to proceed");
          return;
        }
      }
      setIsLoading(true);
      setError(null);
      setStep("approving");

      // Parse deposit amount
      const depositAmount = parseUnits(amount, decimals as number);

      const spenderAddress = compoundGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;

      console.log(`Market: ${market}`);
      console.log(`Collateral token: ${token.name} (${token.address})`);
      console.log(`Amount: ${amount}`);

      // Approve CompoundGateway to spend tokens
      try {
        const approveTx = await writeErc20Async({
          address: contractAddress,
          abi: ERC20ABI,
          functionName: "approve",
          args: [spenderAddress, depositAmount],
        });
        console.log("Approve tx sent:", approveTx);

        await publicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
        console.log("Approve tx confirmed");
        setStep("approved");
      } catch (err) {
        console.error("Error approving token transfer:", err);
        setError(`Approval failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        setIsLoading(false);
        return;
      }

      setStep("executing");

      // Now deposit collateral
      try {
        const depositTx = await writeContractAsync({
          functionName: "depositCollateral",
          args: [market, token.address, depositAmount, userAddress],
        });
        console.log("Deposit tx sent:", depositTx);

        await publicClient.waitForTransactionReceipt({ hash: depositTx as `0x${string}` });
        console.log("Deposit tx confirmed");

        setStep("done");
        notification.success("Collateral deposited successfully!");

        // Close modal after a short delay on success
        setTimeout(() => onClose(), 2000);
      } catch (err) {
        console.error("Deposit failed:", err);
        setError(`Deposit failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Deposit error:", error);
      setError(error.message || "Deposit failed");
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
          return "Depositing...";
        default:
          return "Processing...";
      }
    }

    if (step === "approved") {
      return "Confirm Deposit";
    }

    if (step === "done") {
      return "Done!";
    }

    return "Deposit";
  };

  // Get action button class based on current step
  const getActionButtonClass = () => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
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
                <span className="font-extrabold bg-gradient-to-r from-primary via-cyan-500 to-sky-500 bg-clip-text text-transparent dark:from-blue-300 dark:via-cyan-300 dark:to-teal-300">
                  Deposit
                </span>
                <span className="text-base-content">{token.name}</span>
              </h3>
              <div className="text-sm opacity-70">as Collateral</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="p-6 space-y-6">
          {/* Amount input section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-base-content/80">Amount</label>
                {token.currentRate && (
                  <div className="badge badge-sm badge-neutral flex items-center gap-1">
                    <FiDollarSign className="w-3 h-3" />
                    <span>{formatPercentage(token.currentRate || 0)}% APY</span>
                  </div>
                )}
              </div>
              <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                <span className="text-base-content/70">Balance:</span>
                <span className="font-medium ml-1">
                  {formatDisplayNumber(formattedBalance)} {token.name}
                </span>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                className="input input-bordered w-full pr-20 h-14 text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isLoading || step !== "idle"}
                max={formattedBalance}
              />

              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm btn-outline h-8"
                onClick={() => setAmount(formattedBalance)}
                disabled={isLoading || step !== "idle"}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Collateral info */}
          <div className="p-5 bg-base-200 rounded-lg flex items-center min-h-[80px]">
            <div className="text-sm text-base-content/80">
              <p>
                This will deposit {token.name} as collateral for your Compound position.
                {token.currentRate && (
                  <span> You&apos;ll earn {formatPercentage(token.currentRate || 0)}% APY on your deposit.</span>
                )}
              </p>
            </div>
          </div>

          {/* Transaction Flow Visual Steps */}
          <div className="flex items-center w-full relative py-5 mt-2">
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
          <div className="flex justify-between text-sm px-1 -mt-1">
            <div className="text-center max-w-[120px]">
              <p className="font-medium">Approve</p>
              <p className="text-xs text-base-content/70">Allow the contract to access your {token.name}</p>
            </div>
            <div className="text-center max-w-[120px]">
              <p className="font-medium">Deposit</p>
              <p className="text-xs text-base-content/70">Deposit {token.name} as collateral</p>
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
                <FiCheck className="w-5 h-5" /> Transaction Complete
              </button>
            ) : (
              <button
                className={`btn ${getActionButtonClass()} btn-lg w-full h-14 transition-all duration-300 shadow-md ${isLoading ? "animate-pulse" : ""}`}
                onClick={handleDeposit}
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
              <button className="btn btn-ghost btn-sm w-full hover:bg-base-200" onClick={onClose} disabled={isLoading}>
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
