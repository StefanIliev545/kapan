import { useTargetNetwork } from "./useTargetNetwork";
import { AccountInterface, InvokeFunctionResponse } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";
import providerFactory from "~~/services/web3/provider";

type TransactionFunc = (
  tx: () => Promise<InvokeFunctionResponse> | Promise<string>,
  // | SendTransactionParameters,
) => Promise<string | undefined>;

/**
 * Custom notification content for TXs.
 */
const TxnNotification = ({ message, blockExplorerLink }: { message: string; blockExplorerLink?: string }) => {
  return (
    <div className={`flex flex-col ml-1 cursor-default`}>
      <p className="my-0">{message}</p>
      {blockExplorerLink && blockExplorerLink.length > 0 ? (
        <a href={blockExplorerLink} target="_blank" rel="noreferrer" className="block link text-md">
          check out transaction
        </a>
      ) : null}
    </div>
  );
};

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

    let notificationId = null;
    let transactionHash: Awaited<InvokeFunctionResponse>["transaction_hash"] | undefined = undefined;
    try {
      const networkId = await walletClient.getChainId();
      notificationId = notification.loading(<TxnNotification message="Awaiting for user confirmation" />);
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
        transactionHash = (await walletClient.execute(tx)).transaction_hash;
      } else {
        throw new Error("Incorrect transaction passed to transactor");
      }

      notification.remove(notificationId);

      const blockExplorerTxURL = networkId ? getBlockExplorerTxLink(targetNetwork.network, transactionHash) : "";

      notificationId = notification.loading(
        <TxnNotification message="Waiting for transaction to complete." blockExplorerLink={blockExplorerTxURL} />,
      );

      try {
        await provider?.waitForTransaction(transactionHash);
        console.log("Transaction confirmed:", transactionHash);
      } catch (waitError) {
        console.warn("Error waiting for transaction:", waitError);
      }

      notification.remove(notificationId);

      notification.success(
        <TxnNotification message="Transaction completed successfully!" blockExplorerLink={blockExplorerTxURL} />,
        {
          icon: "🎉",
        },
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

      notification.error(message);
      throw error;
    }

    return transactionHash;
  };
};
