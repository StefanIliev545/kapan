import { useCallback, useState } from "react";

type CopyStatus = "idle" | "copied" | "error";

interface UseCopyToClipboardOptions {
  /** Duration in milliseconds to show "copied" status. Default: 800ms */
  resetDelay?: number;
}

interface UseCopyToClipboardReturn {
  /** Current copy status */
  status: CopyStatus;
  /** Whether text was recently copied */
  isCopied: boolean;
  /** Copy text to clipboard */
  copy: (text: string) => Promise<void>;
  /** Reset status to idle */
  reset: () => void;
}

/**
 * Hook for copying text to clipboard with status tracking.
 *
 * @example
 * ```tsx
 * const { copy, isCopied } = useCopyToClipboard();
 *
 * return (
 *   <button onClick={() => copy(address)}>
 *     {isCopied ? <CheckIcon /> : <CopyIcon />}
 *   </button>
 * );
 * ```
 */
export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}): UseCopyToClipboardReturn {
  const { resetDelay = 800 } = options;
  const [status, setStatus] = useState<CopyStatus>("idle");

  const copy = useCallback(
    async (text: string) => {
      if (!navigator?.clipboard) {
        console.warn("Clipboard API not available");
        setStatus("error");
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        setStatus("copied");

        setTimeout(() => {
          setStatus("idle");
        }, resetDelay);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        setStatus("error");

        setTimeout(() => {
          setStatus("idle");
        }, resetDelay);
      }
    },
    [resetDelay],
  );

  const reset = useCallback(() => {
    setStatus("idle");
  }, []);

  return {
    status,
    isCopied: status === "copied",
    copy,
    reset,
  };
}
