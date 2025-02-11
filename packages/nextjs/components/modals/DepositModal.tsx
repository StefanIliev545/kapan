import { FC, useState } from "react";
import Image from "next/image";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWalletClient, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
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
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // Get the RouterGateway contract deployment from Scaffold‑Eth
  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  // Use Scaffold‑Eth's write hook for sending transactions to RouterGateway
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
  // Format balance for display
  const formattedBalance = balance && decimals 
    ? formatUnits(BigInt(balance), decimals) 
    : "0";

  const handleDeposit = async () => {
    if (!walletClient || !routerGateway) return;
    try {
      setLoading(true);
      // Parse the deposit amount – adjust decimals if necessary (here we assume 18)
      const depositAmount = parseUnits(amount, decimals);

      const spenderAddress = routerGateway.address as `0x${string}`;
      const contractAddress = token.address as `0x${string}`;
      const ownerAddress = walletClient?.account.address as `0x${string}`;

      console.log(`Protocol name: ${protocolName}`);
      console.log(`Spender address: ${spenderAddress}`);
      console.log(`Contract address: ${contractAddress}`);
      console.log(`Owner address: ${ownerAddress}`);

      const approveTx = await writeErc20Async({
        address: contractAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [spenderAddress, depositAmount],
      });

      // Call supplyWithPermit on RouterGateway:
      // The expected arguments: protocolName, token address, user, amount, deadline, v, r, s
      const tx = await writeContractAsync({
        functionName: "supply",
        args: [
          protocolName.toLowerCase(), // ensure protocol name matches your mapping (e.g. "aave")
          token.address,
          walletClient?.account.address,
          depositAmount,
        ],
      });
      if (tx) {
        await tx.wait();
        onClose();
      }
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
              Amount 
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
