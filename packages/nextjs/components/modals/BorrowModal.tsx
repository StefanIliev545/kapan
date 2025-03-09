import { FC, useState } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { usePublicClient, useReadContract, useWalletClient, useWriteContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

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
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [isApproveConfirmed, setIsApproveConfirmed] = useState(false);

  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  const { writeContractAsync: writeContractAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  // Get available borrow amount - in a real implementation, this would check the user's collateral
  // and calculate the maximum amount they can borrow
  const maxBorrowAmount = 5000; // This is a placeholder, would be calculated from the user's position
  const formattedMaxBorrow = maxBorrowAmount.toFixed(2);

  const handleBorrow = async () => {
    if (!walletClient || !routerGateway || !publicClient) return;
    try {
      setLoading(true);
      const borrowAmount = parseUnits(amount, decimals as number);

      const spenderAddress = routerGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;
      const ownerAddress = walletClient.account.address as `0x${string}`;

      console.log(`Protocol: ${protocolName}`);
      console.log(`Spender: ${spenderAddress}`);
      console.log(`Contract: ${contractAddress}`);
      console.log(`Owner: ${ownerAddress}`);

      // In real implementation, you would do the borrow operation here
      console.log("Borrow amount:", borrowAmount);
      
      // Simulate a successful borrow
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsApproveConfirmed(true);
      
      // Simulate a final confirmation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      onClose();
    } catch (error) {
      console.error("Borrow failed:", error);
    } finally {
      setLoading(false);
    }
  };

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
              Amount{" "}
              <span className="float-right">
                Available: {formattedMaxBorrow} {token.name}
              </span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              max={formattedMaxBorrow}
            />
            <div className="text-right mt-1">
              <button className="btn btn-xs" onClick={() => setAmount(formattedMaxBorrow)}>
                Max
              </button>
            </div>
          </div>

          <div className="text-sm">
            <span className="text-base-content/70">Borrow APR:</span>
            <span className="ml-2 font-medium">{token.currentRate.toFixed(2)}%</span>
          </div>

          <div className="flex justify-center mt-8">
            <ul className="steps steps-horizontal w-full max-w-lg">
              <li className="step step-primary">
                <span className="block py-3">Confirm Collateral</span>
              </li>
              <li className={`step ${isApproveConfirmed ? "step-primary" : "opacity-50"}`}>
                <span className="block py-3">Borrow from {protocolName}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-secondary" onClick={handleBorrow} disabled={loading || !amount}>
            {loading ? "Borrowing..." : "Borrow"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}; 