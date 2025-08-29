import { create } from "zustand";
import scaffoldConfig from "~~/scaffold.config";
import { ChainWithAttributes } from "~~/utils/scaffold-eth";
import { ChainWithAttributes as SNChainWithAttributes } from "~~/utils/scaffold-stark";

/**
 * Zustand Store
 *
 * You can add global state to the app using this useGlobalState, to get & set
 * values from anywhere in the app.
 *
 * Think about it as a global useState.
 */

type GlobalState = {
  nativeCurrency: {
    price: number;
    isFetching: boolean;
  };
  nativeCurrencyPrice: number;

  strkCurrencyPrice: number;
  setStrkCurrencyPrice: (newNativeCurrencyPriceState: number) => void;

  setNativeCurrencyPrice: (newNativeCurrencyPriceState: number) => void;
  setIsNativeCurrencyFetching: (newIsNativeCurrencyFetching: boolean) => void;
  targetEVMNetwork: ChainWithAttributes;
  setTargetEVMNetwork: (newTargetEVMNetwork: ChainWithAttributes) => void;
  targetSNNetwork: SNChainWithAttributes;
  setTargetSNNetwork: (newTargetSNNetwork: SNChainWithAttributes) => void;
  blockNumber?: bigint;
  setBlockNumber: (blockNumber: bigint | undefined) => void;
};

export const useGlobalState = create<GlobalState>(set => ({
  nativeCurrency: {
    price: 0,
    isFetching: true,
  },
  strkCurrencyPrice: 0,
  nativeCurrencyPrice: 0,
  setStrkCurrencyPrice: (newValue: number): void => set(() => ({ strkCurrencyPrice: newValue })),
  setNativeCurrencyPrice: (newValue: number): void =>
    set(state => ({ nativeCurrency: { ...state.nativeCurrency, price: newValue }, nativeCurrencyPrice: newValue })),
  setIsNativeCurrencyFetching: (newValue: boolean): void =>
    set(state => ({ nativeCurrency: { ...state.nativeCurrency, isFetching: newValue } })),
  targetEVMNetwork: scaffoldConfig.targetEVMNetworks[0],
  setTargetEVMNetwork: (newTargetEVMNetwork: ChainWithAttributes) =>
    set(() => ({ targetEVMNetwork: newTargetEVMNetwork })),
  targetSNNetwork: scaffoldConfig.targetSNNetworks[0],
  setTargetSNNetwork: (newTargetSNNetwork: SNChainWithAttributes) =>
    set(() => ({ targetSNNetwork: newTargetSNNetwork })),
  blockNumber: undefined,
  setBlockNumber: (blockNumber: bigint | undefined) => set(() => ({ blockNumber })),
}));
