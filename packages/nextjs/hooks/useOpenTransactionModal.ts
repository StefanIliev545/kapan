"use client";

import { useCallback, useEffect } from "react";
import { useModalContext, ModalData } from "~~/contexts/ModalContext";
import type { TokenInfo } from "~~/components/modals/TokenActionModal";
import type { PositionManager } from "~~/utils/position";
import type { Address } from "viem";

/**
 * Preload the modal chunk after idle to make first-open feel instant
 * This warms up the code-split chunk without blocking initial render
 */
const preloadModal = () => {
  // Preload the unified modal component
  import("~~/components/modals/UnifiedTransactionModal");
  // Preload all panels
  import("~~/components/modals/panels/DepositPanel");
  import("~~/components/modals/panels/WithdrawPanel");
  import("~~/components/modals/panels/BorrowPanel");
  import("~~/components/modals/panels/RepayPanel");
};

/**
 * Helper hook to open transaction modals (Deposit, Withdraw, Borrow, Repay)
 * Uses the global modal context to manage a single modal instance
 * Preloads modal chunks after idle for better UX
 */
export const useOpenTransactionModal = () => {
  const { openModal } = useModalContext();

  // Preload modal chunks after idle to make first-open feel instant
  useEffect(() => {
    if (typeof window === "undefined") return;

    const idle = (cb: () => void) => {
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(cb, { timeout: 2000 });
      } else {
        setTimeout(cb, 1500);
      }
    };

    idle(preloadModal);
  }, []);

  const openDepositModal = useCallback(
    (config: {
      token: TokenInfo;
      protocolName: string;
      chainId?: number;
      market?: Address;
      position?: PositionManager;
    }) => {
      // Preload the specific panel when user clicks
      import("~~/components/modals/panels/DepositPanel");
      openModal({
        type: "deposit",
        ...config,
      });
    },
    [openModal]
  );

  const openWithdrawModal = useCallback(
    (config: {
      token: TokenInfo;
      protocolName: string;
      supplyBalance: bigint;
      chainId?: number;
      market?: Address;
      position?: PositionManager;
    }) => {
      // Preload the specific panel when user clicks
      import("~~/components/modals/panels/WithdrawPanel");
      openModal({
        type: "withdraw",
        ...config,
      });
    },
    [openModal]
  );

  const openBorrowModal = useCallback(
    (config: {
      token: TokenInfo;
      protocolName: string;
      currentDebt: number;
      chainId?: number;
      position?: PositionManager;
    }) => {
      // Preload the specific panel when user clicks
      import("~~/components/modals/panels/BorrowPanel");
      openModal({
        type: "borrow",
        ...config,
      });
    },
    [openModal]
  );

  const openRepayModal = useCallback(
    (config: {
      token: TokenInfo;
      protocolName: string;
      debtBalance: bigint;
      chainId?: number;
      position?: PositionManager;
    }) => {
      // Preload the specific panel when user clicks
      import("~~/components/modals/panels/RepayPanel");
      openModal({
        type: "repay",
        ...config,
      });
    },
    [openModal]
  );

  return {
    openDepositModal,
    openWithdrawModal,
    openBorrowModal,
    openRepayModal,
  };
};

