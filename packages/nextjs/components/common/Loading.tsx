"use client";

import clsx from "clsx";

/**
 * Standardized loading component sizes
 * Maps to DaisyUI's loading-* classes
 */
export type LoadingSize = "xs" | "sm" | "md" | "lg";

/**
 * Loading spinner component for inline loading states
 * Use in buttons, labels, and small UI elements
 */
export interface LoadingSpinnerProps {
  size?: LoadingSize;
  className?: string;
  /** Optional label to display next to the spinner */
  label?: string;
}

export const LoadingSpinner = ({
  size = "md",
  className,
  label
}: LoadingSpinnerProps) => (
  <span className={clsx("inline-flex items-center gap-2", className)}>
    <span className={clsx("loading loading-spinner", `loading-${size}`)} />
    {label && <span>{label}</span>}
  </span>
);

/**
 * Full-width centered loading state for sections/containers
 * Use for loading entire views, modals, or large content areas
 */
export interface LoadingOverlayProps {
  size?: LoadingSize;
  label?: string;
  className?: string;
  /** Whether to add vertical padding */
  padded?: boolean;
}

export const LoadingOverlay = ({
  size = "lg",
  label = "Loading...",
  className,
  padded = true,
}: LoadingOverlayProps) => (
  <div
    className={clsx(
      "flex flex-col items-center justify-center w-full",
      padded && "py-8",
      className
    )}
    role="status"
    aria-busy="true"
    aria-live="polite"
  >
    <span className={clsx("loading loading-spinner", `loading-${size}`)} />
    {label && <span className="text-base-content/60 mt-2 text-sm">{label}</span>}
    <span className="sr-only">{label}</span>
  </div>
);

/**
 * Inline loading indicator for buttons and action elements
 * Designed to be used as an icon in button components
 */
export interface ButtonLoadingProps {
  size?: LoadingSize;
  className?: string;
}

export const ButtonLoading = ({
  size = "xs",
  className
}: ButtonLoadingProps) => (
  <span className={clsx("loading loading-spinner", `loading-${size}`, className)} />
);

/**
 * Alert-style loading indicator with message
 * Use for loading states that need context (e.g., "Fetching quote...")
 */
export interface LoadingAlertProps {
  message: string;
  size?: LoadingSize;
  variant?: "info" | "warning" | "neutral";
  className?: string;
}

export const LoadingAlert = ({
  message,
  size = "xs",
  variant = "info",
  className,
}: LoadingAlertProps) => (
  <div className={clsx(`alert alert-${variant} text-xs py-2`, className)}>
    <span className={clsx("loading loading-spinner", `loading-${size}`)} />
    <span>{message}</span>
  </div>
);

/**
 * Generic skeleton line for text placeholders
 */
export interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
  rounded?: boolean;
}

export const SkeletonLine = ({
  width = "w-24",
  height = "h-4",
  className,
  rounded = false,
}: SkeletonLineProps) => (
  <div className={clsx("skeleton", width, height, rounded && "rounded-full", className)} />
);

/**
 * Skeleton circle for avatar/icon placeholders
 */
export interface SkeletonCircleProps {
  size?: string;
  className?: string;
}

export const SkeletonCircle = ({
  size = "w-8 h-8",
  className,
}: SkeletonCircleProps) => (
  <div className={clsx("skeleton rounded-full flex-shrink-0", size, className)} />
);

/**
 * Skeleton card for content card placeholders
 */
export interface SkeletonCardProps {
  className?: string;
  children?: React.ReactNode;
}

export const SkeletonCard = ({
  className,
  children,
}: SkeletonCardProps) => (
  <div className={clsx("card bg-base-100 shadow-md rounded-lg", className)}>
    <div className="card-body p-4">
      {children || (
        <div className="flex flex-col gap-3">
          <SkeletonLine width="w-32" height="h-6" />
          <SkeletonLine width="w-full" height="h-4" />
          <SkeletonLine width="w-3/4" height="h-4" />
        </div>
      )}
    </div>
  </div>
);

/**
 * Skeleton row for list item placeholders
 * Common pattern: icon + text lines + trailing element
 */
export interface SkeletonRowProps {
  hasIcon?: boolean;
  hasTrailing?: boolean;
  lines?: number;
  className?: string;
}

export const SkeletonRow = ({
  hasIcon = true,
  hasTrailing = true,
  lines = 2,
  className,
}: SkeletonRowProps) => (
  <div className={clsx("flex items-center gap-3 p-2 rounded-lg bg-base-200/30", className)}>
    {hasIcon && <SkeletonCircle />}
    <div className="flex-1 flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === 0 ? "w-24" : "w-32"}
          height={i === 0 ? "h-4" : "h-3"}
        />
      ))}
    </div>
    {hasTrailing && <SkeletonLine width="w-20" height="h-4" className="flex-shrink-0" />}
  </div>
);

/**
 * Modal loading skeleton
 * Standard loading state for modal content
 */
export interface ModalLoadingProps {
  message?: string;
  className?: string;
}

export const ModalLoading = ({
  message = "Loading...",
  className,
}: ModalLoadingProps) => (
  <div
    className={clsx("flex flex-col items-center justify-center py-12", className)}
    role="status"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="loading loading-spinner loading-lg" />
    <p className="mt-4 text-base-content/60">{message}</p>
    <span className="sr-only">{message}</span>
  </div>
);

/**
 * Section loading skeleton with header
 * Use for protocol sections, market lists, etc.
 */
export interface SectionLoadingProps {
  title?: string;
  rows?: number;
  className?: string;
}

export const SectionLoading = ({
  title,
  rows = 3,
  className,
}: SectionLoadingProps) => (
  <div className={clsx("w-full", className)} role="status" aria-busy="true">
    {title && (
      <div className="flex items-center justify-between mb-4">
        <SkeletonLine width="w-32" height="h-5" />
        <SkeletonLine width="w-8" height="h-5" rounded />
      </div>
    )}
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
    <span className="sr-only">Loading section...</span>
  </div>
);

// Default export for backward compatibility with existing Spinner import
export default LoadingSpinner;
