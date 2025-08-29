import { useEffect, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { Address, Log } from "viem";
import { usePublicClient } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";

export const useContractLogs = (address: Address) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [lastFetchedBlock, setLastFetchedBlock] = useState<bigint | undefined>();
  const { targetNetwork } = useTargetNetwork();
  const client = usePublicClient({ chainId: targetNetwork.id });
  const blockNumber = useBlockNumberContext();

  useEffect(() => {
    const fetchLogs = async () => {
      if (!client || blockNumber === undefined) return;
      try {
        const fromBlock = lastFetchedBlock ? lastFetchedBlock + 1n : 0n;
        const newLogs = await client.getLogs({
          address: address,
          fromBlock,
          toBlock: blockNumber,
        });
        setLogs(prevLogs => [...prevLogs, ...newLogs]);
        setLastFetchedBlock(blockNumber);
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };
    fetchLogs();
  }, [address, client, blockNumber, lastFetchedBlock]);

  return logs;
};
