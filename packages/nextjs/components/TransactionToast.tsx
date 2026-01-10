import { CheckCircle2, Loader2, AlertCircle, Wallet } from "lucide-react";

export type TransactionStep = "pending" | "sent" | "confirmed" | "failed";

interface TransactionToastProps {
  step: TransactionStep;
  txHash?: string;
  message?: string;
  blockExplorerLink?: string;
  /** Optional secondary link (e.g., CoW Explorer for limit orders) */
  secondaryLink?: string;
  secondaryLinkText?: string;
}

export function TransactionToast({ step, message, blockExplorerLink, secondaryLink, secondaryLinkText }: TransactionToastProps) {
  const getStepConfig = () => {
    switch (step) {
      case "pending":
        return {
          icon: <Wallet className="size-5 text-blue-500" />,
          spinner: <Loader2 className="size-4 animate-spin text-blue-500" />,
          title: "Pending Transaction",
          description: message || "Waiting for approval...",
        };
      case "sent":
        return {
          icon: null,
          spinner: <Loader2 className="size-4 animate-spin text-amber-500" />,
          title: "Transaction Sent",
          description: message || "Processing on blockchain...",
        };
      case "confirmed":
        return {
          icon: <CheckCircle2 className="size-5 text-green-500" />,
          spinner: null,
          title: "Transaction Confirmed",
          description: message || "Successfully completed!",
        };
      case "failed":
        return {
          icon: <AlertCircle className="size-5 text-red-500" />,
          spinner: null,
          title: "Transaction Failed",
          description: message || "Please try again",
        };
    }
  };

  const config = getStepConfig();
  const showSpinner = step === "pending" || step === "sent";

  return (
    <div className="border-base-300 dark:border-base-700 bg-base-100 dark:bg-base-200 pointer-events-auto w-[360px] rounded border p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showSpinner && <span>{config.spinner}</span>}
            <h4 className="text-base-content">{config.title}</h4>
          </div>
          <p className="text-base-content/70 mt-1">{config.description}</p>
          {blockExplorerLink && blockExplorerLink.length > 0 && (
            <a
              href={blockExplorerLink}
              target="_blank"
              rel="noreferrer"
              className="link text-md text-primary hover:text-primary-focus mt-1 block"
            >
              View on explorer
            </a>
          )}
          {secondaryLink && secondaryLink.length > 0 && (
            <a
              href={secondaryLink}
              target="_blank"
              rel="noreferrer"
              className="link text-md text-primary hover:text-primary-focus mt-1 block"
            >
              {secondaryLinkText || "View order"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

