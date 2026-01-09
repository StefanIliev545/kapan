/**
 * @deprecated Use LoadingSpinner from './Loading' instead
 * This file is kept for backward compatibility
 */

import clsx from "clsx";

export type SpinnerProps = {
  size?: "loading-xs" | "loading-sm" | "loading-md" | "loading-lg";
  className?: string;
};

const Spinner = ({ size = "loading-md", className }: SpinnerProps) => (
  <span className={clsx("loading loading-spinner", size, className)} />
);

export default Spinner;

// Re-export new components for gradual migration
export {
  LoadingSpinner,
  LoadingOverlay,
  ButtonLoading,
  LoadingAlert,
  SkeletonLine,
  SkeletonCircle,
  SkeletonCard,
  SkeletonRow,
  ModalLoading,
  SectionLoading,
  type LoadingSize,
} from "./Loading";
