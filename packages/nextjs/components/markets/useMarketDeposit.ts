import { useState, useCallback } from "react";
import { MarketProps, canDeposit, getMarketTokenData, MarketTokenData } from "./types";

type UseMarketDepositProps = Pick<MarketProps, "name" | "icon" | "address" | "supplyRate" | "allowDeposit" | "networkType">;

type UseMarketDepositReturn = {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  showDepositButton: boolean;
  tokenData: MarketTokenData;
};

/**
 * Hook for managing deposit modal state in market components
 */
export function useMarketDeposit(props: UseMarketDepositProps): UseMarketDepositReturn {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return {
    isModalOpen,
    openModal,
    closeModal,
    showDepositButton: canDeposit(props),
    tokenData: getMarketTokenData(props),
  };
}
