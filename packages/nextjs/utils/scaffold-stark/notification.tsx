import React from "react";
import { toast } from "sonner";
import { TransactionToast } from "~~/components/TransactionToast";

type NotificationOptions = {
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
 * Custom Notification using Sonner
 */
export const notification = {
  success: (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      // Check if it's a confirmed transaction toast - use longer duration
      const isConfirmed = content.props.step === "confirmed";
      const duration = options?.duration ?? (isConfirmed ? CONFIRMED_DURATION : DEFAULT_DURATION);
      
      return toast.custom(() => content, {
        duration,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toast.success(content as string, {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: options?.position ?? DEFAULT_POSITION,
    });
  },
  info: (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      return toast.custom(() => content, {
        duration: options?.duration ?? DEFAULT_DURATION,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toast.info(content as string, {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: options?.position ?? DEFAULT_POSITION,
    });
  },
  warning: (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      return toast.custom(() => content, {
        duration: options?.duration ?? DEFAULT_DURATION,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toast.warning(content as string, {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: options?.position ?? DEFAULT_POSITION,
    });
  },
  error: (content: React.ReactNode, options?: NotificationOptions) => {
    if (isTransactionToast(content)) {
      return toast.custom(() => content, {
        duration: options?.duration ?? DEFAULT_DURATION,
        position: options?.position ?? DEFAULT_POSITION,
      });
    }
    return toast.error(content as string, {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: options?.position ?? DEFAULT_POSITION,
    });
  },
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
