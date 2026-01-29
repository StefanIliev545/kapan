/**
 * Hook for managing transaction notifications and status updates
 *
 * Handles:
 * - Toast notifications for transaction states (pending, sent, confirmed, failed)
 * - Batch transaction notification effects
 * - Post-transaction data refetching
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { qk } from "~~/lib/queryKeys";
import { logger } from "~~/utils/logger";
import { OP_STACK_FAST_CHAINS } from "./types";

interface UseTransactionNotificationsOptions {
  chainId: number;
  isConfirmed: boolean;
  isBatchConfirmed: boolean;
  isBatchError: boolean;
  batchId?: string;
  batchStatus?: unknown;
  suppressBatchNotifications?: boolean;
}

/**
 * Hook for managing transaction notifications
 */
export const useTransactionNotifications = ({
  chainId,
  isConfirmed,
  isBatchConfirmed,
  isBatchError,
  batchId,
  batchStatus,
  suppressBatchNotifications = false,
}: UseTransactionNotificationsOptions) => {
  const queryClient = useQueryClient();
  const [batchNotificationId, setBatchNotificationId] = useState<string | number | null>(null);

  // Show loading notification when batch is submitted (unless suppressed)
  useEffect(() => {
    if (!batchId || suppressBatchNotifications) return;

    // Show "waiting for confirmation" notification
    const id = notification.loading(
      <TransactionToast
        step="sent"
        message="Transaction submitted — waiting for confirmation..."
      />
    );
    setBatchNotificationId(id);

    return () => {
      // Cleanup on unmount or when batchId changes
      if (id) notification.remove(id);
    };
  }, [batchId, suppressBatchNotifications]);

  // Batch Status Effects - update notification when status changes (unless suppressed)
  useEffect(() => {
    if (!batchId || !batchStatus || suppressBatchNotifications) return;

    // Remove the loading notification
    if (batchNotificationId) {
      notification.remove(batchNotificationId);
      setBatchNotificationId(null);
    }

    if (isBatchConfirmed) {
      notification.success(
        <TransactionToast
          step="confirmed"
          message="Transaction confirmed!"
        />
      );
    } else if (isBatchError) {
      notification.error(
        <TransactionToast
          step="failed"
          message="Transaction failed"
        />
      );
    }
  }, [batchId, batchStatus, isBatchConfirmed, isBatchError, batchNotificationId, suppressBatchNotifications]);

  // Refetch Data on Success
  useEffect(() => {
    const complete = isConfirmed || isBatchConfirmed;
    if (!complete) return;

    const doRefetch = () => {
      Promise.all([
        queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
        // Morpho-specific queries - use hierarchical keys for chain-specific invalidation
        queryClient.refetchQueries({ queryKey: qk.morpho.all(chainId), type: 'active' }),
        // Euler-specific queries
        queryClient.refetchQueries({ queryKey: qk.euler.all(chainId), type: 'active' }),
      ]).catch(e => logger.warn("Post-tx refetch err:", e));

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("txCompleted"));
      }
    };

    // OP Stack chains with fast block times need a delay for RPC to index new state
    const delay = OP_STACK_FAST_CHAINS.has(chainId) ? 2000 : 0;

    if (delay > 0) {
      const timer = setTimeout(doRefetch, delay);
      return () => clearTimeout(timer);
    } else {
      doRefetch();
    }
  }, [isConfirmed, isBatchConfirmed, queryClient, chainId]);

  return {
    batchNotificationId,
    setBatchNotificationId,
  };
};

/**
 * Helper to show a pending notification with auto-dismiss after timeout
 */
export const showPendingNotification = (
  message: string,
  timeoutMs = 10000
): { notificationId: string | number; clearTimeout: () => void } => {
  const notificationId = notification.loading(
    <TransactionToast step="pending" message={message} />
  );

  const timeoutId = setTimeout(() => {
    notification.remove(notificationId);
  }, timeoutMs);

  return {
    notificationId,
    clearTimeout: () => clearTimeout(timeoutId),
  };
};

/**
 * Helper to show a sent notification
 */
export const showSentNotification = (
  txHash?: string,
  message = "Waiting for transaction to complete.",
  blockExplorerLink?: string
): string | number => {
  return notification.loading(
    <TransactionToast
      step="sent"
      txHash={txHash}
      message={message}
      blockExplorerLink={blockExplorerLink}
    />
  );
};

/**
 * Helper to show a success notification
 */
export const showSuccessNotification = (
  txHash?: string,
  message = "Transaction completed successfully!",
  blockExplorerLink?: string
): void => {
  notification.success(
    <TransactionToast
      step="confirmed"
      txHash={txHash}
      message={message}
      blockExplorerLink={blockExplorerLink}
    />
  );
};

/**
 * Helper to show an error notification
 */
export const showErrorNotification = (
  txHash?: string,
  message = "Transaction failed",
  blockExplorerLink?: string
): void => {
  notification.error(
    <TransactionToast
      step="failed"
      txHash={txHash}
      message={message}
      blockExplorerLink={blockExplorerLink}
    />
  );
};
