"use client";

import { useState, useCallback } from "react";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import type { Call } from "starknet";

export interface UseNostraModalSubmitOptions {
  /** Transaction calls to execute */
  calls: Call[];
  /** Success message to display */
  successMessage: string;
  /** Error message to display on failure */
  errorMessage: string;
  /** Callback to run after successful submission */
  onSuccess?: () => void;
}

export interface UseNostraModalSubmitResult {
  /** Whether submission is in progress */
  submitting: boolean;
  /** Submit handler */
  handleSubmit: () => Promise<void>;
}

/**
 * Shared hook for Nostra modal submission logic.
 * Handles submitting, success/error notifications, and cleanup.
 *
 * @example
 * ```tsx
 * const { submitting, handleSubmit } = useNostraModalSubmit({
 *   calls,
 *   successMessage: "Position closed",
 *   errorMessage: "Failed to close position",
 *   onSuccess: onClose,
 * });
 * ```
 */
export function useNostraModalSubmit({
  calls,
  successMessage,
  errorMessage,
  onSuccess,
}: UseNostraModalSubmitOptions): UseNostraModalSubmitResult {
  const [submitting, setSubmitting] = useState(false);
  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const handleSubmit = useCallback(async () => {
    try {
      setSubmitting(true);
      await sendAsync();
      notification.success(successMessage);
      onSuccess?.();
    } catch (e) {
      console.error(e);
      notification.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }, [sendAsync, successMessage, errorMessage, onSuccess]);

  return { submitting, handleSubmit };
}
