import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";

/**
 * Hook to track modal open events via analytics.
 * Fires the tracking event only when the modal transitions from closed to open.
 *
 * @param isOpen - Whether the modal is currently open
 * @param eventName - The analytics event name to track
 * @param eventProps - Properties to send with the event (must be stable or memoized)
 * @param onOpen - Optional callback to run when modal opens (e.g., reset state)
 *
 * @example
 * useModalTracking(
 *   isOpen,
 *   "refinance_modal_open",
 *   { protocol: "Aave", chainId: 1 },
 *   () => setAmount("")
 * );
 */
export function useModalTracking(
  isOpen: boolean,
  eventName: string,
  eventProps: Record<string, string | number | boolean | null>,
  onOpen?: () => void
): void {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      track(eventName, eventProps);
      onOpen?.();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, eventName, eventProps, onOpen]);
}

/**
 * Hook to run a callback when a modal opens.
 * Simpler version of useModalTracking without analytics.
 *
 * @param isOpen - Whether the modal is currently open
 * @param onOpen - Callback to run when modal transitions from closed to open
 *
 * @example
 * useOnModalOpen(isOpen, () => {
 *   setAmount("");
 *   setSelectedToken(null);
 * });
 */
export function useOnModalOpen(isOpen: boolean, onOpen: () => void): void {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      onOpen();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, onOpen]);
}
