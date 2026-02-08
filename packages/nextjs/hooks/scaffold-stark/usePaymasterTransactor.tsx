import { useTargetNetwork } from "./useTargetNetwork";
import type { AccountInterface, InvokeFunctionResponse, Call } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { usePaymasterSendTransaction, usePaymasterGasTokens } from "@starknet-react/core";
import { universalStrkAddress } from "~~/utils/Constants";
import providerFactory from "~~/services/web3/provider";
import { TransactionToast } from "~~/components/TransactionToast";
import { logger } from "~~/utils/logger";

type TransactionFunc = (
  tx: () => Promise<InvokeFunctionResponse> | Promise<string> | Call | Call[],
) => Promise<string | undefined>;

/** Execute calls via paymaster or regular wallet, returning the transaction hash. */
async function executeCalls(
  calls: Call[],
  shouldUsePaymaster: boolean,
  selectedToken: { address?: string; symbol?: string } | undefined,
  sendPaymasterTransaction: (calls: Call[]) => Promise<InvokeFunctionResponse>,
  walletClient: AccountInterface,
): Promise<string> {
  if (shouldUsePaymaster && selectedToken?.address) {
    logger.debug(`Using paymaster with ${selectedToken.symbol} for gas payment`);
    const result = await sendPaymasterTransaction(calls);
    return result.transaction_hash;
  }
  logger.debug("Using regular transaction with STRK for gas payment");
  const result = await walletClient.execute(calls);
  return result.transaction_hash;
}

/** Resolve the transaction hash from a tx function result or raw Call(s). */
async function resolveTransactionHash(
  tx: () => Promise<InvokeFunctionResponse> | Promise<string> | Call | Call[],
  shouldUsePaymaster: boolean,
  selectedToken: { address?: string; symbol?: string } | undefined,
  sendPaymasterTransaction: (calls: Call[]) => Promise<InvokeFunctionResponse>,
  walletClient: AccountInterface,
): Promise<string> {
  if (typeof tx !== "function") {
    throw new Error("Incorrect transaction passed to transactor");
  }

  const result = await tx();

  if (typeof result === "string") {
    return result;
  }
  if ("transaction_hash" in result) {
    return result.transaction_hash;
  }
  // Result is Call or Call[] - execute via paymaster or regular wallet
  const calls = Array.isArray(result) ? result : [result];
  return executeCalls(calls, shouldUsePaymaster, selectedToken, sendPaymasterTransaction, walletClient);
}

/** Extract a user-facing error message from a transaction error. */
function extractErrorMessage(error: unknown): string {
  const errorObj = error as Error;
  const errorPattern = /Contract (.*?)"}/;
  const match = errorPattern.exec(errorObj.message);
  return match ? match[1] : errorObj.message;
}

/** Wait for the on-chain receipt, swallowing fetch failures. */
async function waitForReceipt(
  provider: ReturnType<typeof providerFactory>,
  transactionHash: string,
): Promise<void> {
  try {
    await provider?.waitForTransaction(transactionHash);
    logger.debug("Transaction confirmed:", transactionHash);
  } catch (waitError) {
    console.warn("Error waiting for transaction:", waitError);
    // Continue anyway - transaction might be included but receipt fetch failed
  }
}

/**
 * Paymaster-aware transactor that automatically uses gasless transactions when non-STRK token is selected.
 * Falls back to regular transactions for STRK or when paymaster is unavailable.
 */
export const usePaymasterTransactor = (_walletClient?: AccountInterface): TransactionFunc => {
  let walletClient = _walletClient;
  const { account } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { selectedToken } = useSelectedGasToken();

  if (walletClient === undefined && account) {
    walletClient = account;
  }

  // Create provider for waiting for transaction receipts
  const provider = providerFactory(targetNetwork);

  // Determine if we should use paymaster (non-STRK token selected)
  const selectedAddr = selectedToken?.address?.toLowerCase();
  const STRK_ADDRESS = universalStrkAddress.toLowerCase();
  const { data: paymasterTokens } = usePaymasterGasTokens();
  const isSelectedStrk = selectedAddr === STRK_ADDRESS || (selectedToken?.symbol?.toUpperCase?.() === "STRK");
  const isSupportedPaymasterToken = !!selectedAddr && !!paymasterTokens?.some((t: { token_address?: string }) => (t?.token_address || "")?.toLowerCase() === selectedAddr);
  const shouldUsePaymaster = !isSelectedStrk && isSupportedPaymasterToken;

  // Setup paymaster transaction hook
  // When shouldUsePaymaster is true, selectedAddr is guaranteed to exist (via isSupportedPaymasterToken check)
  const { sendAsync: sendPaymasterTransaction } = usePaymasterSendTransaction({
    calls: [], // Will be overridden in execution
    options: {
      feeMode: shouldUsePaymaster && selectedAddr
        ? { mode: "default" as const, gasToken: selectedAddr }
        : { mode: "sponsored" as const },
    },
  });

  const transactionType = shouldUsePaymaster ? "gasless" : "regular";
  const gasTokenSymbol = shouldUsePaymaster ? selectedToken?.symbol : "STRK";

  return async tx => {
    if (!walletClient) {
      notification.error("Cannot access account");
      console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error");
      return;
    }

    let notificationId: string | number | null = null;
    let transactionHash: string | undefined = undefined;

    try {
      const networkId = await walletClient.getChainId();

      notificationId = notification.loading(
        <TransactionToast
          step="pending"
          message={`Waiting for approval... (${transactionType}, gas: ${gasTokenSymbol})`}
        />
      );

      const pendingTimeout = setTimeout(() => {
        if (notificationId) notification.remove(notificationId);
      }, 10000);

      try {
        transactionHash = await resolveTransactionHash(
          tx, shouldUsePaymaster, selectedToken, sendPaymasterTransaction, walletClient,
        );
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
          message={`Waiting for ${transactionType} transaction to complete...`}
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      await waitForReceipt(provider, transactionHash);
      notification.remove(notificationId);

      const successMessage = shouldUsePaymaster
        ? `Gasless transaction completed! (Paid with ${gasTokenSymbol})`
        : "Transaction completed successfully!";

      notification.success(
        <TransactionToast
          step="confirmed"
          txHash={transactionHash}
          message={successMessage}
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("txCompleted"));
      }
    } catch (error: unknown) {
      if (notificationId) notification.remove(notificationId);

      const message = extractErrorMessage(error);
      console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error", message);

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
