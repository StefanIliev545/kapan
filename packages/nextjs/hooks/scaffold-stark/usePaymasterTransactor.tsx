import { useTargetNetwork } from "./useTargetNetwork";
import { AccountInterface, InvokeFunctionResponse, Call } from "starknet";
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
  const isSupportedPaymasterToken = !!selectedAddr && !!paymasterTokens?.some((t: any) => (t?.token_address || "")?.toLowerCase() === selectedAddr);
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

  return async tx => {
    if (!walletClient) {
      notification.error("Cannot access account");
      console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error");
      return;
    }

    let notificationId: string | number | null = null;
    let transactionHash: Awaited<InvokeFunctionResponse>["transaction_hash"] | undefined = undefined;

    try {
      const networkId = await walletClient.getChainId();
      
      // Show pending notification - this will stay until we get the transaction hash or timeout
      const transactionType = shouldUsePaymaster ? "gasless" : "regular";
      const gasTokenSymbol = shouldUsePaymaster ? selectedToken?.symbol : "STRK";
      notificationId = notification.loading(
        <TransactionToast
          step="pending"
          message={`Waiting for approval... (${transactionType}, gas: ${gasTokenSymbol})`}
        />
      );
      
      // Set up 10 second timeout for pending state
      const pendingTimeout = setTimeout(() => {
        if (notificationId) {
          notification.remove(notificationId);
        }
      }, 10000);
      
      try {
        if (typeof tx === "function") {
          // Tx is a function that returns the transaction
          const result = await tx();
          
          if (typeof result === "string") {
            transactionHash = result;
          } else if ("transaction_hash" in result) {
            transactionHash = result.transaction_hash;
          } else {
            // Result is Call or Call[] - decide whether to use paymaster
            const calls = Array.isArray(result) ? result : [result];
            
            if (shouldUsePaymaster && selectedToken?.address) {
              logger.debug(`Using paymaster with ${selectedToken.symbol} for gas payment`);
              const paymasterResult = await sendPaymasterTransaction(calls);
              transactionHash = paymasterResult.transaction_hash;
            } else {
              logger.debug("Using regular transaction with STRK for gas payment");
              // Fallback to regular transaction
              const regularResult = await walletClient.execute(calls);
              transactionHash = regularResult.transaction_hash;
            }
          }
        } else if (tx != null) {
          // tx is already a Call or Call[]
          const calls = Array.isArray(tx) ? tx : [tx];
          
          if (shouldUsePaymaster && selectedToken?.address) {
            logger.debug(`Using paymaster with ${selectedToken.symbol} for gas payment`);
            const paymasterResult = await sendPaymasterTransaction(calls);
            transactionHash = paymasterResult.transaction_hash;
          } else {
            logger.debug("Using regular transaction with STRK for gas payment");
            const regularResult = await walletClient.execute(calls);
            transactionHash = regularResult.transaction_hash;
          }
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
          message={`Waiting for ${transactionType} transaction to complete...`}
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      // Wait for transaction receipt
      try {
        await provider?.waitForTransaction(transactionHash);
        logger.debug("Transaction confirmed:", transactionHash);
      } catch (waitError) {
        console.warn("Error waiting for transaction:", waitError);
        // Continue anyway - transaction might be included but receipt fetch failed
      }

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
    } catch (error: any) {
      if (notificationId) {
        notification.remove(notificationId);
      }

      const errorPattern = /Contract (.*?)"}/;
      const match = errorPattern.exec(error.message);
      const message = match ? match[1] : error.message;

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
