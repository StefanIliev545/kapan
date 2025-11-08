"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { Address } from "viem";
import type { TokenInfo } from "~~/components/modals/TokenActionModal";
import type { PositionManager } from "~~/utils/position";

export type ModalType = "deposit" | "withdraw" | "borrow" | "repay" | "move" | null;

export interface ModalData {
  type: ModalType;
  token?: TokenInfo;
  protocolName?: string;
  chainId?: number;
  market?: Address;
  // Action-specific data
  supplyBalance?: bigint;
  debtBalance?: bigint;
  currentDebt?: number;
  position?: PositionManager;
  // Move-specific data
  fromProtocol?: string;
  movePosition?: {
    name: string;
    balance: number;
    type: "supply" | "borrow";
    tokenAddress: string;
    decimals: number;
  };
}

interface ModalContextType {
  modalData: ModalData | null;
  openModal: (data: ModalData) => void;
  closeModal: () => void;
  isOpen: boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const openModal = useCallback((data: ModalData) => {
    setModalData(data);
  }, []);

  const closeModal = useCallback(() => {
    setModalData(null);
  }, []);

  return (
    <ModalContext.Provider
      value={{
        modalData,
        openModal,
        closeModal,
        isOpen: modalData !== null,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalContext must be used within ModalProvider");
  }
  return context;
};

