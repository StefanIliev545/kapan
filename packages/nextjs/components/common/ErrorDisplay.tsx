import { FC, ReactNode } from "react";
import { ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

/**
 * Variant types for different error display styles
 * - error: Red alert for critical errors (default)
 * - warning: Yellow/amber alert for warnings that don't block action
 * - info: Blue alert for informational messages
 * - inline: Minimal text-only error for inline/form validation
 */
export type ErrorDisplayVariant = "error" | "warning" | "info" | "inline";

/**
 * Size options for the error display
 * - sm: Compact with smaller text (py-2, text-xs)
 * - md: Default size (py-3)
 * - lg: Larger with shadow (shadow-lg)
 */
export type ErrorDisplaySize = "sm" | "md" | "lg";

export interface ErrorDisplayProps {
  /** The error message to display. Can be string, Error object, or ReactNode */
  message: string | Error | ReactNode;
  /** Visual variant of the error display */
  variant?: ErrorDisplayVariant;
  /** Size of the alert component */
  size?: ErrorDisplaySize;
  /** Optional custom icon to override default */
  icon?: ReactNode;
  /** Hide the icon entirely */
  hideIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Allow text to break/wrap for long error messages */
  breakAll?: boolean;
}

/**
 * Unified error display component for consistent error presentation across the app.
 *
 * Consolidates various error display patterns:
 * - Modal error states (alert alert-error)
 * - Form validation errors (inline text)
 * - Warning messages (alert alert-warning)
 * - Info messages (alert alert-info)
 *
 * @example
 * // Full error alert in modal
 * <ErrorDisplay message={error} size="lg" />
 *
 * @example
 * // Compact warning
 * <ErrorDisplay message="Output may not cover full amount" variant="warning" size="sm" />
 *
 * @example
 * // Inline form error
 * <ErrorDisplay message="Invalid amount" variant="inline" />
 */
export const ErrorDisplay: FC<ErrorDisplayProps> = ({
  message,
  variant = "error",
  size = "md",
  icon,
  hideIcon = false,
  className = "",
  breakAll = false,
}) => {
  // Normalize message to string
  const displayMessage = message instanceof Error
    ? message.message
    : message;

  // Don't render if no message
  if (!displayMessage) return null;

  // Get default icon based on variant
  const getDefaultIcon = () => {
    const iconClasses = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    switch (variant) {
      case "warning":
        return <ExclamationTriangleIcon className={iconClasses} />;
      case "info":
        return <InformationCircleIcon className={iconClasses} />;
      case "error":
      default:
        return <ExclamationTriangleIcon className={iconClasses} />;
    }
  };

  // Inline variant - simple text error
  if (variant === "inline") {
    return (
      <span className={`text-error text-sm ${className}`}>
        {displayMessage}
      </span>
    );
  }

  // Get alert classes based on variant and size
  const getAlertClasses = () => {
    const variantClasses = {
      error: "alert-error",
      warning: "alert-warning",
      info: "alert-info",
    };

    const sizeClasses = {
      sm: "text-xs py-2",
      md: "",
      lg: "shadow-lg",
    };

    return `alert ${variantClasses[variant]} ${sizeClasses[size]}`;
  };

  const textClasses = breakAll ? "break-all" : "";
  const renderedIcon = hideIcon ? null : (icon || getDefaultIcon());

  return (
    <div className={`${getAlertClasses()} ${className}`}>
      {renderedIcon}
      {typeof displayMessage === "string" ? (
        <span className={textClasses}>{displayMessage}</span>
      ) : (
        <div className={`flex-1 ${textClasses}`}>{displayMessage}</div>
      )}
    </div>
  );
};

/**
 * Shorthand component for warning messages
 */
export const WarningDisplay: FC<Omit<ErrorDisplayProps, "variant">> = (props) => (
  <ErrorDisplay {...props} variant="warning" />
);

/**
 * Shorthand component for info messages
 */
export const InfoDisplay: FC<Omit<ErrorDisplayProps, "variant">> = (props) => (
  <ErrorDisplay {...props} variant="info" />
);

export default ErrorDisplay;
