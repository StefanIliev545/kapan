import { FC, useState } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { usePublicClient, useReadContract, useWalletClient, useWriteContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

interface DepositCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string;
  };
  market: string; // The debt token address (market in Compound)
}

export const DepositCollateralModal: FC<DepositCollateralModalProps> = ({ 
  isOpen, 
  onClose, 
  token, 
  market 
}) => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [isApproveConfirmed, setIsApproveConfirmed] = useState(false);

  // Get CompoundGateway contract
  const { data: compoundGateway } = useScaffoldContract({
    contractName: "CompoundGateway",
  });

  // Write functions
  const { writeContractAsync: writeContractAsync } = useScaffoldWriteContract({
    contractName: "CompoundGateway",
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

  const handleDeposit = async () => {
    if (!walletClient || !compoundGateway || !publicClient) return;
    try {
      setLoading(true);
      
      // Parse deposit amount
      const depositAmount = parseUnits(amount, decimals as number);
      
      const spenderAddress = compoundGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;
      const ownerAddress = walletClient.account.address as `0x${string}`;
      
      console.log(`Market: ${market}`);
      console.log(`Collateral token: ${token.name} (${token.address})`);
      console.log(`Amount: ${amount}`);
      
      // Approve CompoundGateway to spend tokens
      if (writeErc20Async) {
        const approveTx = await writeErc20Async({
          address: contractAddress,
          abi: ERC20ABI,
          functionName: "approve",
          args: [spenderAddress, depositAmount],
        });
        console.log("Approve tx sent:", approveTx);
        
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log("Approve tx confirmed");
        setIsApproveConfirmed(true);
      }

      // Now deposit collateral
      const depositTx = await writeContractAsync({
        functionName: "depositCollateral",
        args: [market, token.address, depositAmount, ownerAddress],
      });
      console.log("Deposit tx sent:", depositTx);
      
      await publicClient.waitForTransactionReceipt({ hash: depositTx as `0x${string}` });
      console.log("Deposit tx confirmed");
      
      notification.success("Collateral deposited successfully!");
      onClose();
    } catch (error) {
      console.error("Deposit failed:", error);
      notification.error("Failed to deposit collateral");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Image 
            src={token.icon} 
            alt={token.name} 
            width={24} 
            height={24} 
            className="rounded-full"
          />
          Deposit {token.name} as Collateral
        </h3>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm text-base-content/70">
              Amount{" "}
              <span className="float-right">
                Balance: {Number(formattedBalance).toFixed(4)} {token.name}
              </span>
            </label>
            <input
              type="number"
              className="input input-bordered w-full"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              max={formattedBalance}
            />
            <div className="text-right mt-1">
              <button className="btn btn-xs" onClick={() => setAmount(formattedBalance)}>
                Max
              </button>
            </div>
          </div>

          <div className="text-sm bg-base-200/60 p-3 rounded-lg">
            <p className="text-base-content/70">
              This will deposit {token.name} as collateral for your Compound position.
            </p>
          </div>

          <div className="flex justify-center mt-8">
            <ul className="steps steps-horizontal w-full max-w-lg">
              <li className="step step-primary">
                <span className="block py-3">Approve {token.name}</span>
              </li>
              <li className={`step ${isApproveConfirmed ? "step-primary" : "opacity-50"}`}>
                <span className="block py-3">Deposit as Collateral</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleDeposit}
            disabled={loading || !amount}
          >
            {loading ? "Depositing..." : "Deposit"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
}; 