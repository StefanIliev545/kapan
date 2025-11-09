import { CheckCircle2, Loader2, AlertCircle, Wallet } from "lucide-react";

export type TransactionStep = "pending" | "sent" | "confirmed" | "failed";

interface TransactionToastProps {
  step: TransactionStep;
  txHash?: string;
  message?: string;
  blockExplorerLink?: string;
}

export function TransactionToast({ step, txHash, message, blockExplorerLink }: TransactionToastProps) {
  const getStepConfig = () => {
    switch (step) {
      case "pending":
        return {
          icon: <Wallet className="h-5 w-5 text-blue-500" />,
          spinner: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
          title: "Pending Transaction",
          description: message || "Waiting for approval...",
        };
      case "sent":
        return {
          icon: null,
          spinner: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
          title: "Transaction Sent",
          description: message || "Processing on blockchain...",
        };
      case "confirmed":
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
          spinner: null,
          title: "Transaction Confirmed",
          description: message || "Successfully completed!",
        };
      case "failed":
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          spinner: null,
          title: "Transaction Failed",
          description: message || "Please try again",
        };
    }
  };

  const config = getStepConfig();
  const showSpinner = step === "pending" || step === "sent";

  return (
    <div className="w-[360px] rounded border border-gray-800 bg-gray-950 p-4 shadow-lg pointer-events-auto">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {showSpinner && <span>{config.spinner}</span>}
            <h4 className="text-white">{config.title}</h4>
          </div>
          <p className="text-gray-400 mt-1">{config.description}</p>
          {blockExplorerLink && blockExplorerLink.length > 0 && (
            <a
              href={blockExplorerLink}
              target="_blank"
              rel="noreferrer"
              className="block link text-md text-blue-400 hover:text-blue-300 mt-1"
            >
              View on explorer
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

