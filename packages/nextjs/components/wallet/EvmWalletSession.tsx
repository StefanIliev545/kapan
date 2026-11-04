"use client";

import { createContext, useContext } from "react";

export type EvmWalletSession = {
  kind: "external" | "email";
  ready: boolean;
  loginWithEmail?: () => void;
  logout?: () => Promise<void>;
  exportWallet?: () => Promise<void>;
  createWallet?: () => Promise<unknown>;
};

const externalSession: EvmWalletSession = {
  kind: "external",
  ready: true,
};

export const EvmWalletSessionContext = createContext(externalSession);

export function useEvmWalletSession() {
  return useContext(EvmWalletSessionContext);
}
