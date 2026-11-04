"use client";

import { type PropsWithChildren, createContext, useContext, useMemo } from "react";
import { useStore } from "zustand";
import { createDashboardTotalsStore } from "~~/services/store/dashboardTotals";

const DashboardTotalsContext = createContext<ReturnType<typeof createDashboardTotalsStore> | null>(null);
const ignoreProtocolTotals = () => {};

interface DashboardTotalsProviderProps extends PropsWithChildren {
  scope: string;
  connected: boolean;
}

export function DashboardTotalsProvider({ scope, connected, children }: DashboardTotalsProviderProps) {
  const store = useMemo(() => createDashboardTotalsStore(connected), [scope, connected]);
  return <DashboardTotalsContext.Provider value={store}>{children}</DashboardTotalsContext.Provider>;
}

export function useDashboardTotals() {
  const store = useContext(DashboardTotalsContext);
  if (!store) {
    throw new Error("Dashboard totals require a DashboardTotalsProvider.");
  }

  return useStore(store);
}

export function useSetProtocolTotals() {
  const store = useContext(DashboardTotalsContext);
  // Protocol views also appear on market pages, outside the positions dashboard.
  return store?.getState().setProtocolTotals ?? ignoreProtocolTotals;
}
