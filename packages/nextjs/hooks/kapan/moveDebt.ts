import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface MoveDebtParams {
  user: string;
  debtToken: string;
  debtAmount: bigint;
  collaterals: {
    token: string;
    amount: bigint;
  }[];
  fromProtocol: string;
  toProtocol: string;
  flashLoanVersion: string;
  repayAll: boolean;
}

export const useMoveDebtScaffold = () => {
  const [error, setError] = useState(null);
  const publicClient = usePublicClient();
  const { data: signer } = useWalletClient();
  const { data: routerContract } = useScaffoldContract({ contractName: "RouterGateway" });

  // Prepare the moveDebt write hook
  const { writeContractAsync: moveDebtAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });

  /**
   * moveDebt executes the following steps:
   * 1. Dynamically reads the encoded approval payloads using the passed parameters.
   * 2. Sends each approval transaction via the signer and waits for each receipt.
   * 3. Calls the moveDebt function on the RouterGateway and waits for its receipt.
   *
   * @param {Object} params
   * @param {string} params.user - The user's address.
   * @param {string} params.debtToken - The debt token address.
   * @param {string|number} params.debtAmount - The amount of debt.
   * @param {Array} params.collaterals - Array of collateral objects (must match the contract's struct).
   * @param {string} params.fromProtocol - The source protocol.
   * @param {string} params.toProtocol - The destination protocol.
   */
  const moveDebt = async (params: MoveDebtParams) => {
    try {
      if (!routerContract || !signer || !publicClient) {
        throw new Error("RouterGateway contract, signer, or publicClient is not available");
      }

      // Dynamically fetch approval payloads using callStatic
      // 1. Get collateral approvals from source protocol
      const fromApprovals = await routerContract.read.getFromProtocolApprovalsForMove([
        params.debtToken,
        params.collaterals,
        params.fromProtocol,
      ]);
      
      // 2. Get inbound collateral actions from destination protocol
      const inboundActions = await routerContract.read.getToProtocolInboundActions([
        params.debtToken,
        params.collaterals,
        params.toProtocol,
      ]);
      
      // 3. Get debt approvals for destination protocol
      const toApprovals = await routerContract.read.getToProtocolApprovalsForMove([
        params.debtToken,
        params.debtAmount,
        params.toProtocol,
        params.user,
      ]);

      // Extract all target addresses and encoded data
      const [fromTargets, fromData] = fromApprovals;
      const [inboundTargets, inboundData] = inboundActions;
      const [toTargets, toData] = toApprovals;

      // Execute "from" protocol approval transactions and wait for each receipt.
      for (let i = 0; i < fromTargets.length; i++) {
        const txHash = await signer.sendTransaction({
          to: fromTargets[i],
          data: fromData[i],
        });
        console.log(`Sent from approval ${i}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`From approval ${i} confirmed`);
      }

      // Execute inbound action transactions for the destination protocol
      for (let i = 0; i < inboundTargets.length; i++) {
        const txHash = await signer.sendTransaction({
          to: inboundTargets[i],
          data: inboundData[i],
        });
        console.log(`Sent inbound action ${i}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`Inbound action ${i} confirmed`);
      }

      // Execute "to" protocol approval transactions and wait for each receipt.
      for (let i = 0; i < toTargets.length; i++) {
        const txHash = await signer.sendTransaction({
          to: toTargets[i],
          data: toData[i],
        });
        console.log(`Sent to approval ${i}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`To approval ${i} confirmed`);
      }

      // Once all approvals are confirmed, call moveDebt on the RouterGateway.
      const moveDebtTxHash = await moveDebtAsync({
        functionName: "moveDebt",
        args: [
          params.user,
          params.debtToken,
          params.debtAmount,
          params.repayAll,
          params.collaterals,
          params.fromProtocol,
          params.toProtocol,
          params.flashLoanVersion,
        ],
      });
      console.log(`Sent moveDebt tx: ${moveDebtTxHash}`);
      await publicClient.waitForTransactionReceipt({ hash: moveDebtTxHash as `0x${string}` });
      console.log("moveDebt transaction confirmed");

      return moveDebtTxHash;
    } catch (err: any) {
      console.error("moveDebt error:", err);
      setError(err);
      throw err;
    }
  };

  return { moveDebt, error };
};
