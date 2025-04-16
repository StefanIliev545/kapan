import { FC, useState } from "react";
import { BaseModal } from "./BaseModal";
import { ByteArray, CairoCustomEnum, CairoOption, CairoOptionVariant } from "starknet";
import { useAccount } from "wagmi";
import { useDeployedContractInfo, useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { TokenMetadata } from "~~/utils/protocols";

// Helper to convert a string to its felt representation.
// It converts the string to a hex string and then to a BigInt string.
const stringToFelt = (s: string): string => {
  // Note: This simple conversion works well for short strings.
  return BigInt("0x" + Buffer.from(s, "utf8").toString("hex")).toString();
};

interface DepositModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: {
    name: string;
    icon: string;
    address: string; // Must be a hex string (contract address)
    currentRate: number;
  };
  protocolName: string; // e.g. "USDC" (but will be converted to a felt)
  counterpartToken?: string; // e.g. another token address; if provided, also encode as felt if needed
}

export const DepositModalStark: FC<DepositModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  counterpartToken,
}) => {
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { address: userAddress } = useAccount();
  const { data: deployedContractData } = useDeployedContractInfo("VesuGateway");
  console.log(`Token: ${token.address}`)

      // Convert the decimal amount (entered in UI) to wei (18 decimals)
    const decimalAmount = parseFloat(amount? amount : "0");
    const amountWei = BigInt(Math.floor(decimalAmount * 1e18));

  const lendingInstruction = new CairoCustomEnum({
    Deposit: {
      basic: {
        token: token.address,
        amount: amountWei,
        user: userAddress || "0x0",
      },
      context: new CairoOption<ByteArray>(CairoOptionVariant.None, []),
    },
  });


  const instruction = {
    type: "ProtocolInstruction",
    protocol: stringToFelt(protocolName),
    instruction: lendingInstruction,
  };
  const { sendAsync } = useScaffoldMultiWriteContract({
    calls: [
      {
        contractName: "Eth",
        functionName: "approve",
        args: [deployedContractData?.address, amountWei]
      },
      {
        contractName: "VesuGateway",
        functionName: "process_instructions",
        args: [[
            lendingInstruction
        ]],
      }
    ],
  });

  const handleDeposit = async () => {
    if (!amount || isLoading) return;

    try {
      setIsLoading(true);

      await sendAsync();
      onClose();
    } catch (error) {
      console.error("Error depositing:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-bold mb-4">Deposit {token.name}</h3>

        <div className="flex items-center gap-2 mb-4">
          <img src={token.icon} alt={token.name} className="w-6 h-6" />
          <span className="font-medium">{token.name}</span>
          <span className="text-sm text-gray-500">APY: {token.currentRate.toFixed(2)}%</span>
        </div>

        <div className="form-control w-full mb-4">
          <label className="label">
            <span className="label-text">Amount</span>
          </label>
          <input
            type="number"
            placeholder="0.0"
            className="input input-bordered w-full"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleDeposit} disabled={!amount || isLoading}>
            {isLoading ? "Processing..." : "Deposit"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
