import React from "react";
import { toast } from "sonner";
import { TransactionToast } from "~~/components/TransactionToast";

export type NotificationOptions = {
  duration?: number;
  icon?: string;
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
};

const DEFAULT_DURATION = 3000;
const CONFIRMED_DURATION = 9000; // Triple duration for confirmed transactions
const DEFAULT_POSITION: NotificationOptions["position"] = "bottom-right";

const isTransactionToast = (content: React.ReactNode): content is React.ReactElement<React.ComponentProps<typeof TransactionToast>> => {
  return React.isValidElement(content) && content.type === TransactionToast;
};

/**
 * Helper to create a toast with TransactionToast support
 */
const createToastHandler = (
  toastFn: (content: string, options: { duration: number; position: NonNullable<NotificationOptions["position"]> }) => string | number,
  defaultDuration: number = DEFAULT_DURATION,
) => {
  return (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      // Check if it's a confirmed transaction toast - use longer duration
      const isConfirmed = content.props.step === "confirmed";
      const duration = options?.duration ?? (isConfirmed ? CONFIRMED_DURATION : defaultDuration);

      return toast.custom(() => content, {
        duration,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toastFn(content as string, {
      duration: options?.duration ?? defaultDuration,
      position: options?.position ?? DEFAULT_POSITION,
    });
  };
};

/**
 * Custom Notification using Sonner
 */
export const notification = {
  success: createToastHandler((content, opts) => toast.success(content, opts)),
  info: createToastHandler((content, opts) => toast.info(content, opts)),
  warning: createToastHandler((content, opts) => toast.warning(content, opts)),
  error: createToastHandler((content, opts) => toast.error(content, opts)),
  loading: (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      return toast.custom(() => content, {
        duration: Infinity,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toast.loading(content as string, {
      duration: Infinity,
      position: options?.position ?? DEFAULT_POSITION,
    });
  },
  remove: (toastId: string | number) => {
    toast.dismiss(toastId);
  },
};
