import { useTargetNetwork } from "./useTargetNetwork";
import { AccountInterface, InvokeFunctionResponse, constants, RpcProvider, Call } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { getBlockExplorerTxLink, notification } from "~~/utils/scaffold-stark";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { usePaymasterGasTokens } from "@starknet-react/core";
import { universalStrkAddress } from "~~/utils/Constants";
import { useProtocolPaymasterSendTransaction } from "./useProtocolPaymasterSendTransaction";

type TransactionFunc = (
  tx: () => Promise<InvokeFunctionResponse> | Promise<string> | Call | Call[],
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
  const provider = new RpcProvider({
    nodeUrl: targetNetwork.rpcUrls.public.http[0],
  });

  // Determine if we should use paymaster (non-STRK token selected)
  const selectedAddr = selectedToken?.address?.toLowerCase();
  const STRK_ADDRESS = universalStrkAddress.toLowerCase();
  const { data: paymasterTokens } = usePaymasterGasTokens();
  const selectedMode = selectedToken?.mode ?? "default";
  const isCustomMode = selectedMode === "collateral" || selectedMode === "borrow";
  const isSelectedStrk = selectedAddr === STRK_ADDRESS || (selectedToken?.symbol?.toUpperCase?.() === "STRK");
  const isSupportedPaymasterToken = !!selectedAddr && !!paymasterTokens?.some((t: any) => (t?.token_address || "")?.toLowerCase() === selectedAddr);

  let customAmount: bigint | undefined;
  if (selectedToken?.amount && isCustomMode) {
    try {
      customAmount = BigInt(selectedToken.amount);
    } catch (error) {
      console.warn("Failed to parse custom gas token amount", error);
    }
  }

  const hasCustomConfig =
    isCustomMode &&
    customAmount !== undefined &&
    typeof selectedToken?.protocol === "string" &&
    selectedToken.protocol.trim().length > 0;
  const shouldUsePaymaster = hasCustomConfig || (!isSelectedStrk && isSupportedPaymasterToken);

  const vesuContext = selectedToken?.vesuContext && isCustomMode
    ? {
        poolId: (() => {
          try {
            return BigInt(selectedToken.vesuContext.poolId);
          } catch (error) {
            console.warn("Failed to parse Vesu pool id", error);
            return undefined;
          }
        })(),
        counterpartToken: selectedToken.vesuContext.counterpartToken,
      }
    : undefined;

  const normalizedVesuContext = vesuContext?.poolId && vesuContext.counterpartToken
    ? { poolId: vesuContext.poolId, counterpartToken: vesuContext.counterpartToken }
    : undefined;

  // Setup paymaster transaction hook
  const { sendAsync: sendPaymasterTransaction, estimateFee: estimateProtocolFee } = useProtocolPaymasterSendTransaction({
    calls: [],
    mode: hasCustomConfig ? selectedMode : "default",
    gasToken: selectedToken?.address ?? universalStrkAddress,
    protocol: hasCustomConfig ? selectedToken?.protocol : undefined,
    amount: hasCustomConfig ? customAmount : undefined,
    useMax: hasCustomConfig ? selectedToken?.useMax : undefined,
    vesuContext: hasCustomConfig ? normalizedVesuContext : undefined,
  });

  return async tx => {
    if (!walletClient) {
      notification.error("Cannot access account");
      console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error");
      return;
    }

    let notificationId = null;
    let transactionHash: Awaited<InvokeFunctionResponse>["transaction_hash"] | undefined = undefined;

    try {
      const networkId = await walletClient.getChainId();
      
      // Show appropriate notification based on transaction type
      const transactionType = shouldUsePaymaster ? "gasless" : "regular";
      const gasTokenSymbol = shouldUsePaymaster ? selectedToken?.symbol : "STRK";
      notificationId = notification.loading(
        <TxnNotification message={`Awaiting ${transactionType} transaction confirmation (gas: ${gasTokenSymbol})`} />
      );

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
            console.log(`Using paymaster with ${selectedToken.symbol} for gas payment`);
            if (hasCustomConfig) {
              try {
                await estimateProtocolFee(calls);
              } catch (feeError) {
                console.warn("Failed to estimate protocol paymaster fee", feeError);
              }
            }
            const paymasterResult = await sendPaymasterTransaction(calls);
            transactionHash = paymasterResult.transaction_hash;
          } else {
            console.log("Using regular transaction with STRK for gas payment");
            // Fallback to regular transaction
            const regularResult = await walletClient.execute(calls, {
              version: constants.TRANSACTION_VERSION.V2,
            });
            transactionHash = regularResult.transaction_hash;
          }
        }
      } else if (tx != null) {
        // tx is already a Call or Call[]
        const calls = Array.isArray(tx) ? tx : [tx];
        
        if (shouldUsePaymaster && selectedToken?.address) {
          console.log(`Using paymaster with ${selectedToken.symbol} for gas payment`);
          if (hasCustomConfig) {
            try {
              await estimateProtocolFee(calls);
            } catch (feeError) {
              console.warn("Failed to estimate protocol paymaster fee", feeError);
            }
          }
          const paymasterResult = await sendPaymasterTransaction(calls);
          transactionHash = paymasterResult.transaction_hash;
        } else {
          console.log("Using regular transaction with STRK for gas payment");
          const regularResult = await walletClient.execute(calls, {
            version: constants.TRANSACTION_VERSION.V2,
          });
          transactionHash = regularResult.transaction_hash;
        }
      } else {
        throw new Error("Incorrect transaction passed to transactor");
      }

      notification.remove(notificationId);

      const blockExplorerTxURL = networkId ? getBlockExplorerTxLink(targetNetwork.network, transactionHash) : "";

      notificationId = notification.loading(
        <TxnNotification 
          message={`Waiting for ${transactionType} transaction to complete...`} 
          blockExplorerLink={blockExplorerTxURL} 
        />,
      );

      // Wait for transaction receipt
      try {
        await provider.waitForTransaction(transactionHash);
        console.log("Transaction confirmed:", transactionHash);
      } catch (waitError) {
        console.warn("Error waiting for transaction:", waitError);
        // Continue anyway - transaction might be included but receipt fetch failed
      }

      notification.remove(notificationId);

      const successMessage = shouldUsePaymaster 
        ? `Gasless transaction completed! (Paid with ${gasTokenSymbol})` 
        : "Transaction completed successfully!";

      notification.success(
        <TxnNotification message={successMessage} blockExplorerLink={blockExplorerTxURL} />,
        {
          icon: shouldUsePaymaster ? "⚡" : "🎉",
        },
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

      notification.error(message);
      throw error;
    }

    return transactionHash;
  };
};
