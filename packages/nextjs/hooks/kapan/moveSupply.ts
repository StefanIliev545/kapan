import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface MoveSupplyParams {
  user: string;
  debtToken: string;
  collaterals: {
    token: string;
    amount: bigint;
  }[];
  fromProtocol: string;
  toProtocol: string;
}

export const useMoveSupply = () => {
  const [error, setError] = useState<any>(null);
  const publicClient = usePublicClient();
  const { data: signer } = useWalletClient();

  // Set up the write contract hook for the Router
  const { data: routerContract } = useScaffoldContract({ contractName: "RouterGateway" });

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });

  const moveSupply = async (params: MoveSupplyParams) => {
    if (!signer || !publicClient || !writeContractAsync || !routerContract) {
      throw new Error("Required objects are not available");
    }

    try {
      // Get approvals for withdrawing collateral from source protocol
      const fromApprovals = await routerContract.read.getFromProtocolApprovalsForMove([
        params.debtToken,
        params.collaterals,
        params.fromProtocol,
      ]);
      
      const [fromTargets, fromData] = fromApprovals;
      
      // Send approval transactions
      for (let i = 0; i < fromTargets.length; i++) {
        const txHash = await signer.sendTransaction({
          to: fromTargets[i],
          data: fromData[i],
        });
        console.log(`Sent approval ${i}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`Approval ${i} confirmed`);
      }

      // Execute the moveSupply function
      const moveSupplyTxHash = await writeContractAsync({
        functionName: "moveSupply",
        args: [
          params.user, 
          params.collaterals,
          params.fromProtocol, 
          params.toProtocol
        ],
      });
      
      console.log(`Sent moveSupply tx: ${moveSupplyTxHash}`);
      await publicClient.waitForTransactionReceipt({ hash: moveSupplyTxHash as `0x${string}` });
      console.log("moveSupply transaction confirmed");

      return moveSupplyTxHash;
    } catch (err: any) {
      console.error("moveSupply error:", err);
      setError(err);
      throw err;
    }
  };

  return { moveSupply, error };
};
