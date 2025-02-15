import { FC, useState } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import { useReadContract, useWalletClient } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface MoveSupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    currentRate: number;
    address: string;
  };
  fromProtocol: string;
  currentSupply: number;
}

const SUPPORTED_PROTOCOLS = [
  { name: "Compound V3", value: "compound v3", icon: "/logos/compound.svg" },
  { name: "Aave V3", value: "aave", icon: "/logos/aave.svg" },
];

export const MoveSupplyModal: FC<MoveSupplyModalProps> = ({ isOpen, onClose, token, fromProtocol, currentSupply }) => {
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState("");

  // Get the RouterGateway contract
  const { data: routerGateway } = useScaffoldContract({
    contractName: "RouterGateway",
  });

  // Read token decimals using wagmi's useReadContract
  const { data: decimals } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
  });

  // Read actual balance from the protocol
  const { data: protocolBalance } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getBalance",
    args: [fromProtocol.toLowerCase(), token.address, walletClient?.account.address],
  });

  // Format balance for display using correct decimals
  const formattedBalance =
    protocolBalance && decimals ? formatUnits(protocolBalance as bigint, decimals as number) : "0";

  // Filter out the current protocol from options
  const availableProtocols = SUPPORTED_PROTOCOLS.filter(p => p.value.toLowerCase() !== fromProtocol.toLowerCase());

  const handleMove = async () => {
    try {
      setLoading(true);
      console.log(`Moving ${amount} ${token.name} from ${fromProtocol} to ${selectedProtocol}`);
      // TODO: Implement actual move logic
      onClose();
    } catch (error) {
      console.error("Move failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Image src={token.icon} alt={token.name} width={24} height={24} className="rounded-full" />
          Move {token.name} Supply
        </h3>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm text-base-content/70">From Protocol</label>
            <div className="font-medium flex items-center gap-2">
              <Image
                src={SUPPORTED_PROTOCOLS.find(p => p.value.toLowerCase() === fromProtocol.toLowerCase())?.icon || ""}
                alt={fromProtocol}
                width={20}
                height={20}
                className="rounded-full"
              />
              {fromProtocol}
            </div>
          </div>

          <div>
            <label className="text-sm text-base-content/70">To Protocol</label>
            <select
              className="select select-bordered w-full"
              value={selectedProtocol}
              onChange={e => setSelectedProtocol(e.target.value)}
            >
              <option value="">Select Protocol</option>
              {availableProtocols.map(protocol => (
                <option key={protocol.value} value={protocol.value}>
                  {protocol.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-base-content/70">
              Amount{" "}
              <span className="float-right">
                Available: {Number(formattedBalance).toFixed(4)} {token.name}
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                className="input input-bordered w-full pr-16"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                max={formattedBalance}
              />
              <span 
                className="absolute right-4 top-1/2 -translate-y-1/2 underline cursor-pointer hover:opacity-80 text-sm"
                onClick={() => setAmount(formattedBalance)}
              >
                Max
              </span>
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleMove} disabled={loading || !amount || !selectedProtocol}>
            {loading ? "Moving..." : "Move Supply"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button>close</button>
      </form>
    </dialog>
  );
};
