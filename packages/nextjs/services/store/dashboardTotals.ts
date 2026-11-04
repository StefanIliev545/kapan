import { createStore } from "zustand/vanilla";

interface ProtocolTotals {
  supply: number;
  borrow: number;
}

interface DashboardTotals {
  protocols: Record<string, ProtocolTotals>;
  totalSupplied: number;
  totalBorrowed: number;
  totalNet: number;
  loadedProtocolCount: number;
  setProtocolTotals: (protocol: string, supply: number, borrow: number) => void;
}

export function createDashboardTotalsStore(connected: boolean) {
  return createStore<DashboardTotals>()(set => ({
    protocols: {},
    totalSupplied: 0,
    totalBorrowed: 0,
    totalNet: 0,
    loadedProtocolCount: 0,
    setProtocolTotals: (protocol, supply, borrow) => {
      if (!connected) {
        return;
      }

      set(state => {
        const previous = state.protocols[protocol];
        const unchanged = previous?.supply === supply && previous?.borrow === borrow;
        if (unchanged) {
          return state;
        }

        const protocols = {
          ...state.protocols,
          [protocol]: {
            supply,
            borrow,
          },
        };
        const entries = Object.values(protocols);
        const totalSupplied = entries.reduce((sum, entry) => sum + entry.supply, 0);
        const totalBorrowed = entries.reduce((sum, entry) => sum + entry.borrow, 0);
        return {
          protocols,
          totalSupplied,
          totalBorrowed,
          totalNet: totalSupplied - totalBorrowed,
          loadedProtocolCount: entries.length,
        };
      });
    },
  }));
}
