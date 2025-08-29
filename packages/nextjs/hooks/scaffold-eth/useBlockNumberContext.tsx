import { ReactNode, useEffect } from "react";
import { useBlockNumber } from "wagmi";
import { useTargetNetwork } from "./useTargetNetwork";
import { useGlobalState } from "~~/services/store/store";

const BlockNumberUpdater = () => {
  const { targetNetwork } = useTargetNetwork();
  const setBlockNumber = useGlobalState(state => state.setBlockNumber);
  const { data: blockNumber } = useBlockNumber({ watch: true, chainId: targetNetwork.id });
  useEffect(() => {
    setBlockNumber(blockNumber);
  }, [blockNumber, setBlockNumber]);
  return null;
};

export const BlockNumberProvider = ({ children }: { children: ReactNode }) => (
  <>
    {children}
    <BlockNumberUpdater />
  </>
);

export const useBlockNumberContext = () => useGlobalState(state => state.blockNumber);
