import { getPublicClient } from "@wagmi/core";
import { Hash, SendTransactionParameters, TransactionReceipt, WalletClient } from "viem";
import { Config, useWalletClient } from "wagmi";
import { SendTransactionMutate } from "wagmi/query";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { getBlockExplorerTxLink, getParsedError, notification } from "~~/utils/scaffold-eth";
import { TransactorFuncOptions } from "~~/utils/scaffold-eth/contract";
import { TransactionToast } from "~~/components/TransactionToast";

type TransactionFunc = (
  tx: (() => Promise<Hash>) | Parameters<SendTransactionMutate<Config, undefined>>[0],
  options?: TransactorFuncOptions,
) => Promise<Hash | undefined>;

/**
 * Runs Transaction passed in to returned function showing UI feedback.
 * @param _walletClient - Optional wallet client to use. If not provided, will use the one from useWalletClient.
 * @returns function that takes in transaction function as callback, shows UI feedback for transaction and returns a promise of the transaction hash
 */
export const useTransactor = (_walletClient?: WalletClient): TransactionFunc => {
  let walletClient = _walletClient;
  const { data } = useWalletClient();
  if (walletClient === undefined && data) {
    walletClient = data;
  }

  const result: TransactionFunc = async (tx, options) => {
    if (!walletClient) {
      notification.error("Cannot access account");
      console.error("⚡️ ~ file: useTransactor.tsx ~ error");
      return;
    }

    let notificationId: string | number | null = null;
    let transactionHash: Hash | undefined = undefined;
    let transactionReceipt: TransactionReceipt | undefined;
    let blockExplorerTxURL = "";
    try {
      const network = await walletClient.getChainId();
      // Get full transaction from public client
      const publicClient = getPublicClient(wagmiConfig);

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
        // Wait for user to confirm in MetaMask and get transaction hash
        if (typeof tx === "function") {
          // Tx is already prepared by the caller
          const result = await tx();
          transactionHash = result;
        } else if (tx != null) {
          // This will wait for MetaMask confirmation before returning hash
          transactionHash = await walletClient.sendTransaction(tx as SendTransactionParameters);
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
      blockExplorerTxURL = network ? getBlockExplorerTxLink(network, transactionHash) : "";
      
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

      const opStackChainIds = new Set([10, 420, 8453, 84531, 84532, 11155420]);
      const effectiveConfirmations =
        options?.blockConfirmations ?? (opStackChainIds.has(network) ? 2 : 1);

      transactionReceipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: effectiveConfirmations,
      });
      notification.remove(notificationId);

      if (transactionReceipt.status === "reverted") throw new Error("Transaction reverted");

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

      if (options?.onBlockConfirmation) options.onBlockConfirmation(transactionReceipt);
    } catch (error: any) {
      if (notificationId) {
        notification.remove(notificationId);
      }
      console.error("⚡️ ~ file: useTransactor.ts ~ error", error);
      const message = getParsedError(error);

      // if receipt was reverted, show notification with block explorer link and return error
      if (transactionReceipt?.status === "reverted") {
        notification.error(
          <TransactionToast
            step="failed"
            txHash={transactionHash}
            message={message}
            blockExplorerLink={blockExplorerTxURL}
          />
        );
        throw error;
      }

      notification.error(
        <TransactionToast step="failed" txHash={transactionHash} message={message} blockExplorerLink={blockExplorerTxURL} />
      );
      throw error;
    }

    return transactionHash;
  };

  return result;
};
