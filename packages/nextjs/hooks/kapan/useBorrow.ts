import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { useScaffoldContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface BorrowParams {
  protocolName: string;
  tokenAddress: string;
  userAddress: string;
  amount: bigint;
}

export type BorrowStep = "idle" | "approving" | "approved" | "borrowing" | "done";

export const useBorrow = () => {
  const [error, setError] = useState<Error | null>(null);
  const [step, setStep] = useState<BorrowStep>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const publicClient = usePublicClient();
  const { data: signer } = useWalletClient();
  const { data: routerContract } = useScaffoldContract({ contractName: "RouterGateway" });

  // Prepare the borrow write hook
  const { writeContractAsync: borrowAsync } = useScaffoldWriteContract({
    contractName: "RouterGateway",
  });

  /**
   * borrow executes the following steps:
   * 1. Dynamically reads the encoded debt approval payload using the passed parameters.
   * 2. Sends the approval transaction via the signer and waits for the receipt.
   * 3. Calls the borrow function on the RouterGateway and waits for its receipt.
   *
   * @param {Object} params
   * @param {string} params.protocolName - The protocol to borrow from.
   * @param {string} params.tokenAddress - The token address to borrow.
   * @param {string} params.userAddress - The user's address.
   * @param {bigint} params.amount - The amount to borrow.
   */
  const borrow = async ({ protocolName, tokenAddress, userAddress, amount }: BorrowParams) => {
    try {
      setIsLoading(true);
      setError(null);
      setStep("approving");
      
      if (!routerContract || !signer || !publicClient) {
        throw new Error("RouterGateway contract, signer, or publicClient is not available");
      }

      // Step 1: Get encoded debt approval payload
      const approvals = await routerContract.read.getEncodedDebtApproval([
        protocolName.toLowerCase(),
        tokenAddress,
        amount,
        userAddress,
      ]);

      // Approvals will be a tuple: [address[] targets, bytes[] encodedData]
      const [targets, data] = approvals;

      // Execute approval transactions and wait for each receipt
      for (let i = 0; i < targets.length; i++) {
        const txHash = await signer.sendTransaction({
          to: targets[i],
          data: data[i],
        });
        console.log(`Sent approval ${i}: ${txHash}`);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`Approval ${i} confirmed`);
      }

      setStep("approved");
      setStep("borrowing");

      // Step 2: Once approval is confirmed, call borrow on the RouterGateway
      const borrowTxHash = await borrowAsync({
        functionName: "borrow",
        args: [protocolName.toLowerCase(), tokenAddress, userAddress, amount],
      });
      
      console.log(`Sent borrow tx: ${borrowTxHash}`);
      await publicClient.waitForTransactionReceipt({ hash: borrowTxHash as `0x${string}` });
      console.log("Borrow transaction confirmed");
      
      setStep("done");
      return borrowTxHash;
    } catch (err: any) {
      console.error("Borrow error:", err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setStep("idle");
    setError(null);
    setIsLoading(false);
  };

  return { borrow, step, isLoading, error, reset };
}; 