import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useProvider } from "@starknet-react/core";
import { refetchPending, refetchFinal } from "~~/utils/scaffold-stark/refetch";

interface TxItem {
  hash: string;
  tags: string[];
  state: "SUBMITTED" | "PRE_CONFIRMED" | "ACCEPTED" | "REJECTED";
}

interface TxWatcherContextValue {
  addTx: (hash: string, tags?: string[]) => void;
}

const TxWatcherContext = createContext<TxWatcherContextValue>({
  addTx: () => undefined,
});

export const TxWatcherProvider = ({ children }: { children: React.ReactNode }) => {
  const { provider } = useProvider();
  const items = useRef<Map<string, TxItem>>(new Map());

  const addTx = useCallback((hash: string, tags: string[] = []) => {
    items.current.set(hash, { hash, tags, state: "SUBMITTED" });
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      if (!items.current.size) return;
      for (const item of Array.from(items.current.values())) {
        try {
          const receipt = await provider.getTransactionReceipt(item.hash);
          const status = receipt.status?.toUpperCase() || "";
          if (
            item.state === "SUBMITTED" &&
            (status.includes("PENDING") || status.includes("PRE_CONFIRMED"))
          ) {
            item.state = "PRE_CONFIRMED";
            await refetchPending(item.tags);
          }
          if (status.includes("ACCEPTED_ON_L2") || status.includes("ACCEPTED_ON_L1")) {
            item.state = "ACCEPTED";
            await refetchFinal(item.tags);
            items.current.delete(item.hash);
          }
          if (status.includes("REJECTED")) {
            item.state = "REJECTED";
            await refetchFinal(item.tags);
            items.current.delete(item.hash);
          }
        } catch {
          // ignore
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [provider]);

  return <TxWatcherContext.Provider value={{ addTx }}>{children}</TxWatcherContext.Provider>;
};

export const useTxWatcher = () => useContext(TxWatcherContext);

