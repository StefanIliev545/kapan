import { FC, useState } from "react";
import Image from "next/image";
import { formatUnits, parseUnits } from "viem";
import { usePublicClient, useReadContract, useWalletClient, useWriteContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface RepayModalProps {
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

export const RepayModal: FC<RepayModalProps> = ({ isOpen, onClose, token, protocolName }) => {
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
  const { writeContractAsync: writeErc20Async } = useWriteContract();

  // Read token balance
  const { data: balance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [walletClient?.account.address as `0x${string}`],
  });

  // Read token decimals
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  const formattedBalance = balance && decimals ? formatUnits(balance as bigint, decimals as number) : "0";

  const handleRepay = async () => {
    if (!walletClient || !routerGateway || !publicClient) return;
    try {
      setLoading(true);
      const repayAmount = parseUnits(amount, decimals as number);

      const spenderAddress = routerGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;
      const ownerAddress = walletClient.account.address as `0x${string}`;

      console.log(`Protocol: ${protocolName}`);
      console.log(`Spender: ${spenderAddress}`);
      console.log(`Contract: ${contractAddress}`);
      console.log(`Owner: ${ownerAddress}`);

      // Approve RouterGateway to spend tokens
      const approveTx = await writeErc20Async({
        address: contractAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [spenderAddress, repayAmount],
      });
      console.log("Approve tx sent:", approveTx);

      await publicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
      console.log("Approve tx confirmed");
      setIsApproveConfirmed(true);

      // Now repay
      const repayTx = await writeContractAsync({
        functionName: "repay",
        args: [protocolName.toLowerCase(), token.address, ownerAddress, repayAmount],
      });
      console.log("Repay tx sent:", repayTx);

      await publicClient.waitForTransactionReceipt({ hash: repayTx as `0x${string}` });
      console.log("Repay tx confirmed");

      onClose();
    } catch (error) {
      console.error("Repay failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
          Repay {token.name}
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

          <div className="text-sm">
            <span className="text-base-content/70">Borrow APY:</span>
            <span className="ml-2 font-medium">{token.currentRate.toFixed(2)}%</span>
          </div>

          <div className="flex justify-center mt-8">
            <ul className="steps steps-horizontal w-full max-w-lg">
              <li className="step step-primary">
                <span className="block py-3">Approve {token.name}</span>
              </li>
              <li className={`step ${isApproveConfirmed ? "step-primary" : "opacity-50"}`}>
                <span className="block py-3">Repay to {protocolName}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleRepay} disabled={loading || !amount}>
            {loading ? "Repaying..." : "Repay"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
