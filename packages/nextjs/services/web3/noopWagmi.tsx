import React from "react";

export type Config = any;
export type UseReadContractParameters = any;
export type UseWatchContractEventParameters = any;
export type UseWriteContractParameters = any;
export type UseBalanceParameters = any;
export type UsePublicClientReturnType = any;

export const WagmiProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const useAccount = () => ({ address: undefined as any, isConnected: false, chain: undefined as any });
export const useWalletClient = () => ({ data: undefined as any });
export const usePublicClient = (_?: any) => ({
  waitForTransactionReceipt: async (_: any) => ({ status: "success" }),
  getLogs: async (_?: any) => [],
  getBytecode: async (_?: any) => "0x",
});
const defaultQuery = {
  data: undefined as any,
  isLoading: false,
  isFetching: false,
  refetch: async () => ({ data: undefined }),
  error: null,
  isError: false,
  isSuccess: false,
};
export const useReadContract = (_?: any) => defaultQuery;
export const useReadContracts = (_?: any) => defaultQuery;
export const useWriteContract = () => ({
  data: undefined as any,
  isPending: false,
  writeContractAsync: async (_?: any) => "0x0" as `0x${string}`,
  writeContract: async (_?: any) => "0x0" as `0x${string}`,
});
export const useWaitForTransactionReceipt = (_?: any) => ({ status: undefined, data: undefined, isLoading: false });
export const useEnsAddress = (_?: any) => defaultQuery;
export const useEnsAvatar = (_?: any) => defaultQuery;
export const useEnsName = (_?: any) => defaultQuery;
export const useSwitchChain = () => ({ switchChain: async (_?: any) => {}, chains: [] });
export const useDisconnect = () => ({ disconnect: async () => {} });
export const useWatchContractEvent = (_?: any) => undefined;
export const useBlockNumber = (_?: any) => ({ data: undefined, isLoading: false });
export const useBalance = (_?: any) => defaultQuery;
export const useConfig = () => undefined;

