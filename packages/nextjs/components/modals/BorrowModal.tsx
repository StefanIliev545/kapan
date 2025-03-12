import { FC, useState, useEffect } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useBorrow } from "~~/hooks/kapan/useBorrow";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";

interface BorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    currentRate: number;
    address: string;
  };
  protocolName: string;
}

export const BorrowModal: FC<BorrowModalProps> = ({ isOpen, onClose, token, protocolName }) => {
  const { address: userAddress } = useAccount();
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Use our custom borrow hook with step tracking
  const { borrow, step, isLoading, error: borrowError, reset } = useBorrow();

  // Get RouterGateway contract - this handles all protocol interactions
  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  // Reset the borrow state when the modal is closed
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      setLocalError(null);
      reset();
    }
  }, [isOpen, reset]);

  // Borrow operation using our hook
  const handleBorrow = async () => {
    if (!routerGateway || !userAddress || !decimals) {
      setLocalError("Missing required dependencies");
      return;
    }

    setLocalError(null);
    
    try {
      const borrowAmount = parseUnits(amount, decimals as number);

      // Use our improved borrow hook
      await borrow({
        protocolName: protocolName.toLowerCase(),
        tokenAddress: token.address,
        userAddress,
        amount: borrowAmount,
      });

      // If successful, close the modal after a short delay
      if (step === "done") {
        setTimeout(() => onClose(), 2000);
      }
    } catch (error) {
      console.error("Borrow process failed:", error);
      setLocalError(`Borrowing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Display any errors from the hook or local errors
  const displayError = borrowError?.message || localError;

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
          Borrow {token.name}
        </h3>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm text-base-content/70">Protocol</label>
            <div className="font-medium">{protocolName}</div>
          </div>

          <div>
            <label className="text-sm text-base-content/70">
              Amount
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={isLoading || step !== "idle"}
            />
          </div>

          <div className="text-sm">
            <span className="text-base-content/70">Borrow APR:</span>
            <span className="ml-2 font-medium">{token.currentRate.toFixed(2)}%</span>
          </div>

          {displayError && (
            <div className="alert alert-error">
              <div className="text-sm">{displayError}</div>
            </div>
          )}

          <div className="flex justify-center mt-8">
            <ul className="steps steps-horizontal w-full max-w-lg">
              <li className={`step ${step !== "idle" ? "step-primary" : ""}`}>
                <span className="block py-3">Approve Token</span>
              </li>
              <li
                className={`step ${step === "borrowing" || step === "done" ? "step-primary" : "opacity-50"}`}
              >
                <span className="block py-3">Borrow from {protocolName}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={isLoading && step !== "done"}>
            {step === "done" ? "Close" : "Cancel"}
          </button>
          {step === "idle" && (
            <button
              className="btn btn-secondary"
              onClick={handleBorrow}
              disabled={isLoading || !amount || !userAddress || Number(amount) <= 0}
            >
              {isLoading ? "Processing..." : "Borrow"}
            </button>
          )}
          {step === "approving" && <button className="btn btn-secondary loading">Approving...</button>}
          {step === "approved" && (
            <button className="btn btn-secondary" onClick={handleBorrow} disabled={isLoading}>
              Confirm Borrow
            </button>
          )}
          {step === "borrowing" && <button className="btn btn-secondary loading">Borrowing...</button>}
          {step === "done" && <button className="btn btn-success" onClick={onClose}>Done!</button>}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={isLoading ? undefined : onClose}>
        <button disabled={isLoading}>close</button>
      </form>
    </dialog>
  );
};
