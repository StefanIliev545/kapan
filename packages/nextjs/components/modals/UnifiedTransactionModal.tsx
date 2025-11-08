"use client";

import { FC, Suspense, useMemo } from "react";
import dynamic from "next/dynamic";
import { useModalContext } from "~~/contexts/ModalContext";

// Lazy-load each panel as a separate chunk
const DepositPanel = dynamic(() => import("./panels/DepositPanel").then(m => ({ default: m.DepositPanel })), {
  ssr: false,
  loading: () => null,
});

const WithdrawPanel = dynamic(() => import("./panels/WithdrawPanel").then(m => ({ default: m.WithdrawPanel })), {
  ssr: false,
  loading: () => null,
});

const BorrowPanel = dynamic(() => import("./panels/BorrowPanel").then(m => ({ default: m.BorrowPanel })), {
  ssr: false,
  loading: () => null,
});

const RepayPanel = dynamic(() => import("./panels/RepayPanel").then(m => ({ default: m.RepayPanel })), {
  ssr: false,
  loading: () => null,
});

/**
 * Unified transaction modal that handles Deposit, Withdraw, Borrow, and Repay actions
 * Uses global modal context to manage a single modal instance
 * Each action panel is code-split and lazy-loaded for optimal bundle size
 */
export const UnifiedTransactionModal: FC = () => {
  const { modalData, closeModal } = useModalContext();

  // Select the appropriate panel based on modal type
  const Panel = useMemo(() => {
    if (!modalData || !modalData.token) {
      return null;
    }
    switch (modalData.type) {
      case "deposit":
        return DepositPanel;
      case "withdraw":
        return WithdrawPanel;
      case "borrow":
        return BorrowPanel;
      case "repay":
        return RepayPanel;
      default:
        return null;
    }
  }, [modalData]);

  if (!Panel || !modalData || !modalData.token) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <Panel modal={modalData} onClose={closeModal} />
    </Suspense>
  );
};

