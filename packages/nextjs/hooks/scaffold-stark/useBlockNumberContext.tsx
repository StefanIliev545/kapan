import { ReactNode, useEffect } from "react";
import { devnet } from "@starknet-react/chains";
import { useProvider } from "@starknet-react/core";
import { useInterval } from "usehooks-ts";
import scaffoldConfig from "~~/scaffold.config";
import { useTargetNetwork } from "./useTargetNetwork";
import { useGlobalState } from "~~/services/store/store";

const BlockNumberUpdater = () => {
  const { provider } = useProvider();
  const { targetNetwork } = useTargetNetwork();
  const setSnBlockNumber = useGlobalState(state => state.setSnBlockNumber);

  const fetchBlockNumber = async () => {
    try {
      const latestBlock =
        "getBlockLatestAccepted" in provider
          ? await (provider as any).getBlockLatestAccepted()
          : await (provider as any).getBlock("latest");
      setSnBlockNumber(BigInt(latestBlock.block_number ?? latestBlock.blockNumber));
    } catch {
      setSnBlockNumber(undefined);
    }
  };

  useEffect(() => {
    fetchBlockNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, targetNetwork.id]);

  useInterval(
    fetchBlockNumber,
    targetNetwork.id !== devnet.id ? scaffoldConfig.pollingInterval : 4_000,
  );

  return null;
};

export const StarkBlockNumberProvider = ({ children }: { children: ReactNode }) => (
  <>
    {children}
    <BlockNumberUpdater />
  </>
);

export const useStarkBlockNumber = () => useGlobalState(state => state.snBlockNumber);
