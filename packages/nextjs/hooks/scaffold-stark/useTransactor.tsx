import { useTargetNetwork } from "./useTargetNetwork";
import { AccountInterface, InvokeFunctionResponse, constants } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";

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
  const { account, address, status, chainId: accountChainId } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  if (walletClient === undefined && account) {
    walletClient = account;
  }

  return async tx => {
    // Some wallets expose the account as a function. Resolve it here to avoid
    // "t.execute is not a function" runtime errors when the account hasn't been
    // materialized yet.
    if (typeof walletClient === "function") {
      try {
        walletClient = await (walletClient as any)();
      } catch (err) {
        notification.error("Cannot access account");
        console.error("useTransactor: walletClient() threw", err);
        return;
      }
    }

    if (!walletClient || typeof (walletClient as any).execute !== "function") {
      notification.error("Cannot access account");
      console.error("useTransactor: walletClient missing execute", walletClient);
      return;
    }

    let notificationId = null;
    let transactionHash: Awaited<InvokeFunctionResponse>["transaction_hash"] | undefined = undefined;
    try {
      let networkId: bigint | string | undefined;
      if (typeof (walletClient as any).getChainId === "function") {
        try {
          networkId = await (walletClient as any).getChainId();
        } catch (err) {
          console.warn("useTransactor: getChainId threw", err);
        }
      }
      if (!networkId && accountChainId) {
        networkId = accountChainId;
      }
      notificationId = notification.loading(<TxnNotification message="Awaiting for user confirmation" />);
      if (typeof tx === "function") {
        // Tx is already prepared by the caller
        const result = await tx();
        if (typeof result === "string") {
          transactionHash = result;
        } else {
          transactionHash = result.transaction_hash;
        }
      } else if (tx != null) {
        console.log("tx", tx);
        transactionHash = (
          await walletClient.execute(tx, {
            version: constants.TRANSACTION_VERSION.V2,
          })
        ).transaction_hash;
      } else {
        throw new Error("Incorrect transaction passed to transactor");
      }

      notification.remove(notificationId);

      const blockExplorerTxURL = networkId ? getBlockExplorerTxLink(targetNetwork.network, transactionHash) : "";

      notificationId = notification.loading(
        <TxnNotification message="Waiting for transaction to complete." blockExplorerLink={blockExplorerTxURL} />,
      );

      notification.remove(notificationId);

      notification.success(
        <TxnNotification message="Transaction completed successfully!" blockExplorerLink={blockExplorerTxURL} />,
        {
          icon: "🎉",
        },
      );
    } catch (error: any) {
      if (notificationId) {
        notification.remove(notificationId);
      }

      const errorPattern = /Contract (.*?)"}/;
      const match = errorPattern.exec(error.message);
      const message = match ? match[1] : error.message;

      console.error("⚡️ ~ file: useTransactor.ts ~ error", message);

      notification.error(message);
      throw error;
    }

    return transactionHash;
  };
};
