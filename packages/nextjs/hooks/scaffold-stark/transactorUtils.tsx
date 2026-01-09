import { notification } from "~~/utils/scaffold-stark";
import { TransactionToast } from "~~/components/TransactionToast";
import {
  isUserRejection as sharedIsUserRejection,
  getErrorMessage,
} from "~~/utils/errors";

/**
 * Shared utilities for transactor hooks (useTransactor, usePaymasterTransactor)
 * Extracts common notification patterns and error handling.
 */

export type TransactionStep = "pending" | "sent" | "confirmed" | "failed";

export interface TransactionNotificationOptions {
  message: string;
  txHash?: string;
  blockExplorerLink?: string;
  secondaryLink?: string;
  secondaryLinkText?: string;
}

/**
 * Shows a pending notification with an automatic timeout
 */
export function showPendingNotification(
  message: string,
  timeoutMs = 10000
): { notificationId: string | number; clearTimeout: () => void } {
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
}

/**
 * Shows a "sent" notification (transaction submitted, waiting for confirmation)
 */
export function showSentNotification(options: TransactionNotificationOptions): string | number {
  return notification.loading(
    <TransactionToast
      step="sent"
      txHash={options.txHash}
      message={options.message}
      blockExplorerLink={options.blockExplorerLink}
    />
  );
}

/**
 * Shows a success notification
 */
export function showSuccessNotification(options: TransactionNotificationOptions): void {
  notification.success(
    <TransactionToast
      step="confirmed"
      txHash={options.txHash}
      message={options.message}
      blockExplorerLink={options.blockExplorerLink}
      secondaryLink={options.secondaryLink}
      secondaryLinkText={options.secondaryLinkText}
    />
  );
}

/**
 * Shows an error notification
 */
export function showErrorNotification(options: TransactionNotificationOptions): void {
  notification.error(
    <TransactionToast
      step="failed"
      txHash={options.txHash}
      message={options.message}
      blockExplorerLink={options.blockExplorerLink}
    />
  );
}

/**
 * Removes a notification by ID
 */
export function removeNotification(notificationId: string | number | null): void {
  if (notificationId) {
    notification.remove(notificationId);
  }
}

/**
 * Dispatches a transaction completed event (for UI updates)
 */
export function dispatchTxCompletedEvent(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("txCompleted"));
  }
}

/**
 * Parses error messages to extract useful information
 * @deprecated Use getErrorMessage from "~~/utils/errors" instead
 */
export function parseErrorMessage(error: unknown): string {
  const errorMessage = (error as { message?: string })?.message || "";
  const errorPattern = /Contract (.*?)"}/;
  const match = errorPattern.exec(errorMessage);
  return match ? match[1] : errorMessage;
}

/**
 * Checks if an error is a user rejection
 * Re-exported from ~~/utils/errors for backward compatibility
 */
export const isUserRejection = sharedIsUserRejection;

/**
 * Gets a human-readable error message, handling user rejections specially
 * @deprecated Use getErrorMessage from "~~/utils/errors" instead
 */
export function getTransactionErrorMessage(error: unknown): string {
  return getErrorMessage(error);
}
