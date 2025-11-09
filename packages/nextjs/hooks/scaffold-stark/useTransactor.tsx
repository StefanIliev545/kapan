import { useTargetNetwork } from "./useTargetNetwork";
import { AccountInterface, InvokeFunctionResponse } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";
import providerFactory from "~~/services/web3/provider";
import { TransactionToast } from "~~/components/TransactionToast";

type TransactionFunc = (
  tx: () => Promise<InvokeFunctionResponse> | Promise<string>,
  // | SendTransactionParameters,
) => Promise<string | undefined>;

/**
 * Runs Transaction passed in to returned function showing UI feedback.
 * @param _walletClient - Optional wallet client to use. If not provided, will use the one from useWalletClient.
 * @returns function that takes in transaction function as callback, shows UI feedback for transaction and returns a promise of the transaction hash
 */
export const useTransactor = (_walletClient?: AccountInterface): TransactionFunc => {
  let walletClient = _walletClient;
  const { account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  if (walletClient === undefined && account) {
    walletClient = account;
  }

  const provider = providerFactory(targetNetwork);

  return async tx => {
    if (!walletClient) {
      notification.error("Cannot access account");
      console.error("⚡️ ~ file: useTransactor.tsx ~ error");
      return;
    }

    let notificationId: string | number | null = null;
    let transactionHash: Awaited<InvokeFunctionResponse>["transaction_hash"] | undefined = undefined;
    try {
      const networkId = await walletClient.getChainId();
      // Show pending notification - this will stay until we get the transaction hash or timeout
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Waiting for approval..." />
      );
      
      // Set up 10 second timeout for pending state
      const pendingTimeout = setTimeout(() => {
        if (notificationId) {
          notification.remove(notificationId);
        }
      }, 10000);
      
      try {
        // Wait for user to confirm in wallet and get transaction hash
        if (typeof tx === "function") {
          // Tx is already prepared by the caller
          console.log("tx is a function");
          const result = await tx();
          if (typeof result === "string") {
            transactionHash = result;
          } else {
            transactionHash = result.transaction_hash;
          }
        } else if (tx != null) {
          console.log("tx", tx);
          // This will wait for wallet confirmation before returning hash
          transactionHash = (await walletClient.execute(tx)).transaction_hash;
        } else {
          throw new Error("Incorrect transaction passed to transactor");
        }
        
        // Clear timeout since we got the hash
        clearTimeout(pendingTimeout);
      } catch (error) {
        // Clear timeout on error
        clearTimeout(pendingTimeout);
        throw error;
      }

      // Now that we have the hash, transaction is sent - switch to "sent" state
      const blockExplorerTxURL = networkId ? getBlockExplorerTxLink(targetNetwork.network, transactionHash) : "";

      // Update notification to "sent" state
      notification.remove(notificationId);
      notificationId = notification.loading(
        <TransactionToast
          step="sent"
          txHash={transactionHash}
          message="Waiting for transaction to complete."
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      try {
        await provider?.waitForTransaction(transactionHash);
        console.log("Transaction confirmed:", transactionHash);
      } catch (waitError) {
        console.warn("Error waiting for transaction:", waitError);
      }

      notification.remove(notificationId);

      notification.success(
        <TransactionToast
          step="confirmed"
          txHash={transactionHash}
          message="Transaction completed successfully!"
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("txCompleted"));
      }
    } catch (error: any) {
      if (notificationId) {
        notification.remove(notificationId);
      }

      // Check for user rejection
      const errorMessage = error?.message || "";
      const lowerMessage = errorMessage.toLowerCase();
      const isRejection = 
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("user denied") ||
        lowerMessage.includes("user cancelled") ||
        lowerMessage.includes("rejected") ||
        lowerMessage.includes("denied") ||
        lowerMessage.includes("cancelled") ||
        error?.code === 4001 ||
        error?.code === "ACTION_REJECTED" ||
        error?.code === "USER_REJECTED";

      const message = isRejection 
        ? "User rejected the request"
        : (() => {
            const errorPattern = /Contract (.*?)"}/;
            const match = errorPattern.exec(errorMessage);
            return match ? match[1] : errorMessage;
          })();

      console.error("⚡️ ~ file: useTransactor.ts ~ error", message);

      const blockExplorerTxURL = transactionHash
        ? getBlockExplorerTxLink(targetNetwork.network, transactionHash)
        : "";
      notification.error(
        <TransactionToast step="failed" txHash={transactionHash} message={message} blockExplorerLink={blockExplorerTxURL} />
      );
      throw error;
    }

    return transactionHash;
  };
};
