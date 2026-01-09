/**
 * TransactionStatus - Shared component for displaying transaction progress in modals
 *
 * This component provides a consistent UI for showing:
 * - Pending/loading states with spinner
 * - Success states with checkmark
 * - Error states with error icon
 * - Step progress for multi-step transactions
 *
 * It is meant to be used INSIDE modals (not as toast notifications).
 * For toast notifications, use TransactionToast with the notification utility.
 */

import { FC } from "react";
import { CheckCircle2, Loader2, AlertCircle, Wallet, Clock } from "lucide-react";

export type TransactionStatusState = "idle" | "pending" | "confirming" | "success" | "error";

export interface TransactionStatusProps {
  /** Current status of the transaction */
  status: TransactionStatusState;
  /** Optional message to display */
  message?: string;
  /** Current step number (for multi-step transactions) */
  currentStep?: number;
  /** Total number of steps (for multi-step transactions) */
  totalSteps?: number;
  /** Optional link to block explorer */
  explorerLink?: string;
  /** Optional secondary link (e.g., CoW Explorer) */
  secondaryLink?: string;
  /** Text for secondary link */
  secondaryLinkText?: string;
  /** Whether to show in compact mode */
  compact?: boolean;
}

const STATUS_CONFIG = {
  idle: {
    icon: null,
    title: "",
    description: "",
    bgClass: "",
  },
  pending: {
    icon: <Wallet className="size-5 text-blue-500" />,
    spinner: <Loader2 className="size-4 animate-spin text-blue-500" />,
    title: "Waiting for Approval",
    description: "Please confirm in your wallet...",
    bgClass: "bg-blue-500/10",
  },
  confirming: {
    icon: <Clock className="size-5 text-amber-500" />,
    spinner: <Loader2 className="size-4 animate-spin text-amber-500" />,
    title: "Confirming Transaction",
    description: "Processing on blockchain...",
    bgClass: "bg-amber-500/10",
  },
  success: {
    icon: <CheckCircle2 className="size-5 text-green-500" />,
    spinner: null,
    title: "Transaction Confirmed",
    description: "Successfully completed!",
    bgClass: "bg-green-500/10",
  },
  error: {
    icon: <AlertCircle className="size-5 text-red-500" />,
    spinner: null,
    title: "Transaction Failed",
    description: "Please try again",
    bgClass: "bg-red-500/10",
  },
};

export const TransactionStatus: FC<TransactionStatusProps> = ({
  status,
  message,
  currentStep,
  totalSteps,
  explorerLink,
  secondaryLink,
  secondaryLinkText,
  compact = false,
}) => {
  if (status === "idle") return null;

  const config = STATUS_CONFIG[status];
  const showSpinner = status === "pending" || status === "confirming";
  const showSteps = currentStep !== undefined && totalSteps !== undefined && totalSteps > 1;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${config.bgClass}`}>
        {showSpinner ? config.spinner : config.icon}
        <span className="text-base-content text-sm">
          {message || config.description}
          {showSteps && ` (${currentStep}/${totalSteps})`}
        </span>
      </div>
    );
  }

  return (
    <div className={`border-base-300 rounded-lg border ${config.bgClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {showSpinner && <span>{config.spinner}</span>}
            <h4 className="text-base-content font-medium">{config.title}</h4>
          </div>
          <p className="text-base-content/70 mt-1 text-sm">
            {message || config.description}
          </p>

          {/* Step Progress */}
          {showSteps && (
            <div className="mt-3">
              <div className="text-base-content/60 mb-1 flex items-center justify-between text-xs">
                <span>Progress</span>
                <span>{currentStep} of {totalSteps}</span>
              </div>
              <div className="bg-base-300 h-1.5 w-full rounded-full">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Explorer Links */}
          {(explorerLink || secondaryLink) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {explorerLink && (
                <a
                  href={explorerLink}
                  target="_blank"
                  rel="noreferrer"
                  className="link text-primary hover:text-primary-focus text-sm"
                >
                  View on explorer
                </a>
              )}
              {secondaryLink && (
                <a
                  href={secondaryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="link text-primary hover:text-primary-focus text-sm"
                >
                  {secondaryLinkText || "View order"}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * TransactionSteps - Shows a vertical list of transaction steps
 * Useful for multi-step operations like limit order creation
 */
export interface TransactionStep {
  label: string;
  status: "pending" | "in_progress" | "completed" | "error";
  message?: string;
}

export interface TransactionStepsProps {
  steps: TransactionStep[];
  compact?: boolean;
}

const STEP_ICONS = {
  pending: <div className="border-base-300 size-4 rounded-full border-2" />,
  in_progress: <Loader2 className="text-primary size-4 animate-spin" />,
  completed: <CheckCircle2 className="text-success size-4" />,
  error: <AlertCircle className="text-error size-4" />,
};

export const TransactionSteps: FC<TransactionStepsProps> = ({ steps, compact = false }) => {
  if (compact) {
    const currentStepIdx = steps.findIndex(s => s.status === "in_progress");
    const completedCount = steps.filter(s => s.status === "completed").length;
    const currentStep = currentStepIdx >= 0 ? steps[currentStepIdx] : null;

    return (
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="text-primary size-4 animate-spin" />
        <span className="text-base-content/70">
          {currentStep?.label || `Step ${completedCount + 1} of ${steps.length}`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            {STEP_ICONS[step.status]}
          </div>
          <div className="flex-1">
            <div className={`text-sm ${step.status === "completed" ? "text-base-content/50" : "text-base-content"}`}>
              {step.label}
            </div>
            {step.message && (
              <div className="text-base-content/50 mt-0.5 text-xs">
                {step.message}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Helper function to create standard transaction notification messages
 */
export const createTransactionMessage = {
  pending: (action: string) => `${action}...`,
  confirming: (action: string) => `Confirming ${action.toLowerCase()}...`,
  success: (action: string) => `${action} completed!`,
  error: (action: string, error?: string) => error || `${action} failed`,
  step: (current: number, total: number, action?: string) =>
    action ? `${action} (${current}/${total})` : `Step ${current} of ${total}`,
};

export default TransactionStatus;
