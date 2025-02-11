import { FC, useState } from "react";
import Image from "next/image";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  useWalletClient,
  useWriteContract,
  useReadContract,
  usePublicClient,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    currentRate: number;
    address: string; // ERC20 token address
  };
  protocolName: string;
}

export const DepositModal: FC<DepositModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
}) => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  // Track if the approval step is confirmed.
  const [isApproveConfirmed, setIsApproveConfirmed] = useState(false);

  // Get the RouterGateway contract from Scaffold‑Eth.
  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  // Write hooks.
  const { writeContractAsync: writeContractAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });
  const { writeContractAsync: writeErc20Async } = useWriteContract();

  // Read token balance.
  const { data: balance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [walletClient?.account.address as `0x${string}`],
  });

  // Read token decimals.
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  const formattedBalance =
    balance && decimals
      ? formatUnits(balance as bigint, decimals as number)
      : "0";

  const handleDeposit = async () => {
    if (!walletClient || !routerGateway || !publicClient) return;
    try {
      setLoading(true);
      // Parse deposit amount.
      const depositAmount = parseUnits(amount, decimals as number);

      const spenderAddress = routerGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;
      const ownerAddress = walletClient.account.address as `0x${string}`;

      console.log(`Protocol: ${protocolName}`);
      console.log(`Spender: ${spenderAddress}`);
      console.log(`Contract: ${contractAddress}`);
      console.log(`Owner: ${ownerAddress}`);

      // Approve RouterGateway to spend tokens.
      const approveTx = await writeErc20Async({
        address: contractAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [spenderAddress, depositAmount],
      });
      console.log("Approve tx sent:", approveTx);

      // Wait for approve receipt.
      await publicClient.waitForTransactionReceipt({ hash: approveTx as `0x${string}` });
      console.log("Approve tx confirmed");
      setIsApproveConfirmed(true);

      // Now supply.
      const supplyTx = await writeContractAsync({
        functionName: "supply",
        args: [
          protocolName.toLowerCase(),
          token.address,
          ownerAddress,
          depositAmount,
        ],
      });
      console.log("Supply tx sent:", supplyTx);

      // Wait for supply receipt.
      await publicClient.waitForTransactionReceipt({ hash: supplyTx as `0x${string}` });
      console.log("Supply tx confirmed");

      // Close modal when finished.
      onClose();
    } catch (error) {
      console.error("Deposit failed:", error);
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
          Deposit {token.name}
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
              onChange={(e) => setAmount(e.target.value)}
              max={formattedBalance}
            />
            <div className="text-right mt-1">
              <button
                className="btn btn-xs"
                onClick={() => setAmount(formattedBalance)}
              >
                Max
              </button>
            </div>
          </div>

          <div className="text-sm">
            <span className="text-base-content/70">Supply APY:</span>
            <span className="ml-2 font-medium">
              {token.currentRate.toFixed(2)}%
            </span>
          </div>

          {/* DaisyUI steps – the list items remain contiguous, while inner spans get extra padding */}
          <div className="flex justify-center mt-8">
            <ul className="steps steps-horizontal w-full max-w-lg">
              <li className="step step-primary">
                <span className="block py-3">Approve {token.name}</span>
              </li>
              <li className={`step ${isApproveConfirmed ? "step-primary" : "opacity-50"}`}>
                <span className="block py-3">Supply to {protocolName}</span>
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
