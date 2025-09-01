import { useEffect, useRef, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { Address, Log } from "viem";
import { usePublicClient } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";

// Cache logs per address so multiple components share results and avoid refetching
const logsCache = new Map<string, { logs: Log[]; lastBlock?: bigint }>();

export const useContractLogs = (address: Address) => {
  const cacheEntry = logsCache.get(address) ?? { logs: [], lastBlock: undefined };
  const [logs, setLogs] = useState<Log[]>(cacheEntry.logs);
  const lastFetchedBlock = useRef<bigint | undefined>(cacheEntry.lastBlock);

  const { targetNetwork } = useTargetNetwork();
  const client = usePublicClient({ chainId: targetNetwork.id });
  const blockNumber = useBlockNumberContext();

  useEffect(() => {
    const fetchLogs = async () => {
      if (!client || blockNumber === undefined) return;
      try {
        const fromBlock =
          lastFetchedBlock.current !== undefined ? lastFetchedBlock.current + 1n : 0n;
        const newLogs = await client.getLogs({
          address: address,
          fromBlock,
          toBlock: blockNumber,
        });
        if (newLogs.length > 0) {
          setLogs(prevLogs => {
            const updated = [...prevLogs, ...newLogs];
            logsCache.set(address, { logs: updated, lastBlock: blockNumber });
            return updated;
          });
        }
        lastFetchedBlock.current = blockNumber;
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      }
    };
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, client, blockNumber]);

  return logs;
};
