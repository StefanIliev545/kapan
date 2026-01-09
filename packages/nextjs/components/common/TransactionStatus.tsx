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
    icon: <Wallet className="h-5 w-5 text-blue-500" />,
    spinner: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    title: "Waiting for Approval",
    description: "Please confirm in your wallet...",
    bgClass: "bg-blue-500/10",
  },
  confirming: {
    icon: <Clock className="h-5 w-5 text-amber-500" />,
    spinner: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
    title: "Confirming Transaction",
    description: "Processing on blockchain...",
    bgClass: "bg-amber-500/10",
  },
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    spinner: null,
    title: "Transaction Confirmed",
    description: "Successfully completed!",
    bgClass: "bg-green-500/10",
  },
  error: {
    icon: <AlertCircle className="h-5 w-5 text-red-500" />,
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
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgClass}`}>
        {showSpinner ? config.spinner : config.icon}
        <span className="text-sm text-base-content">
          {message || config.description}
          {showSteps && ` (${currentStep}/${totalSteps})`}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-base-300 ${config.bgClass} p-4`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {showSpinner && <span>{config.spinner}</span>}
            <h4 className="font-medium text-base-content">{config.title}</h4>
          </div>
          <p className="text-sm text-base-content/70 mt-1">
            {message || config.description}
          </p>

          {/* Step Progress */}
          {showSteps && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-base-content/60 mb-1">
                <span>Progress</span>
                <span>{currentStep} of {totalSteps}</span>
              </div>
              <div className="w-full bg-base-300 rounded-full h-1.5">
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
                  className="text-sm link text-primary hover:text-primary-focus"
                >
                  View on explorer
                </a>
              )}
              {secondaryLink && (
                <a
                  href={secondaryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm link text-primary hover:text-primary-focus"
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
  pending: <div className="w-4 h-4 rounded-full border-2 border-base-300" />,
  in_progress: <Loader2 className="w-4 h-4 animate-spin text-primary" />,
  completed: <CheckCircle2 className="w-4 h-4 text-success" />,
  error: <AlertCircle className="w-4 h-4 text-error" />,
};

export const TransactionSteps: FC<TransactionStepsProps> = ({ steps, compact = false }) => {
  if (compact) {
    const currentStepIdx = steps.findIndex(s => s.status === "in_progress");
    const completedCount = steps.filter(s => s.status === "completed").length;
    const currentStep = currentStepIdx >= 0 ? steps[currentStepIdx] : null;

    return (
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
          <div className="flex-shrink-0 mt-0.5">
            {STEP_ICONS[step.status]}
          </div>
          <div className="flex-1">
            <div className={`text-sm ${step.status === "completed" ? "text-base-content/50" : "text-base-content"}`}>
              {step.label}
            </div>
            {step.message && (
              <div className="text-xs text-base-content/50 mt-0.5">
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
