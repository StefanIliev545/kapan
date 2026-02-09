import { useTargetNetwork } from "./useTargetNetwork";
import type { AccountInterface, InvokeFunctionResponse } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";
import providerFactory from "~~/services/web3/provider";
import { TransactionToast } from "~~/components/TransactionToast";

type TransactionFunc = (
  tx: () => Promise<InvokeFunctionResponse> | Promise<string>,
  // | SendTransactionParameters,
) => Promise<string | undefined>;

const REJECTION_KEYWORDS = ["user rejected", "user denied", "user cancelled", "rejected", "denied", "cancelled"];
const REJECTION_CODES: (number | string)[] = [4001, "ACTION_REJECTED", "USER_REJECTED"];

/** Check whether the error represents a user rejection in the wallet. */
function isUserRejection(error: unknown): boolean {
  const errorObj = error as Error & { code?: number | string };
  const lowerMessage = (errorObj?.message || "").toLowerCase();
  if (REJECTION_KEYWORDS.some(kw => lowerMessage.includes(kw))) return true;
  if (errorObj?.code !== undefined && REJECTION_CODES.includes(errorObj.code)) return true;
  return false;
}

/** Extract a user-facing error message from a transaction error. */
function extractTransactorErrorMessage(error: unknown): string {
  if (isUserRejection(error)) return "User rejected the request";
  const errorMessage = (error as Error)?.message || "";
  const errorPattern = /Contract (.*?)"}/;
  const match = errorPattern.exec(errorMessage);
  return match ? match[1] : errorMessage;
}

/** Resolve the transaction hash from a tx function or raw transaction object. */
async function resolveHash(
  tx: (() => Promise<InvokeFunctionResponse> | Promise<string>) | unknown,
  walletClient: AccountInterface,
): Promise<string> {
  if (typeof tx === "function") {
    const result = await tx();
    return typeof result === "string" ? result : result.transaction_hash;
  }
  if (tx != null) {
    return (await walletClient.execute(tx as any)).transaction_hash;
  }
  throw new Error("Incorrect transaction passed to transactor");
}

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
    let transactionHash: string | undefined = undefined;

    try {
      const networkId = await walletClient.getChainId();
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Waiting for approval..." />
      );

      const pendingTimeout = setTimeout(() => {
        if (notificationId) notification.remove(notificationId);
      }, 10000);

      try {
        transactionHash = await resolveHash(tx, walletClient);
        clearTimeout(pendingTimeout);
      } catch (error) {
        clearTimeout(pendingTimeout);
        throw error;
      }

      const blockExplorerTxURL = networkId ? getBlockExplorerTxLink(targetNetwork.network, transactionHash) : "";

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
    } catch (error: unknown) {
      if (notificationId) notification.remove(notificationId);

      const message = extractTransactorErrorMessage(error);
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
