"use client";

import { type PropsWithChildren, Suspense, lazy } from "react";
import { EvmWalletSessionContext } from "./EvmWalletSession";
import { ExternalWalletProvider } from "./ExternalWalletProvider";

const PrivyWalletProvider = lazy(() => import("./PrivyWalletProvider"));
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const loadingSession = {
  kind: "external",
  ready: false,
} as const;

export function EvmWalletProvider({ children }: PropsWithChildren) {
  if (!appId) {
    return <ExternalWalletProvider>{children}</ExternalWalletProvider>;
  }

  return (
    <Suspense
      fallback={
        <ExternalWalletProvider reconnectOnMount={false}>
          <EvmWalletSessionContext.Provider value={loadingSession}>{children}</EvmWalletSessionContext.Provider>
        </ExternalWalletProvider>
      }
    >
      <PrivyWalletProvider appId={appId}>{children}</PrivyWalletProvider>
    </Suspense>
  );
}
