"use client";

import type { PropsWithChildren } from "react";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { BlockieAvatar } from "~~/components/scaffold-eth/BlockieAvatar";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const walletTheme = darkTheme({
  accentColor: "#3b82f6",
  borderRadius: "medium",
});
const appInfo = { appName: "Kapan" };

export function ExternalWalletProvider({
  children,
  reconnectOnMount = true,
}: PropsWithChildren<{ reconnectOnMount?: boolean }>) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={reconnectOnMount}>
      <WalletAppearance>{children}</WalletAppearance>
    </WagmiProvider>
  );
}

export function WalletAppearance({ children }: PropsWithChildren) {
  return (
    <RainbowKitProvider avatar={BlockieAvatar} theme={walletTheme} modalSize="compact" appInfo={appInfo}>
      {children}
    </RainbowKitProvider>
  );
}
