"use client";

import { type PropsWithChildren, useCallback, useMemo } from "react";
import { type EvmWalletSession, EvmWalletSessionContext } from "./EvmWalletSession";
import { ExternalWalletProvider, WalletAppearance } from "./ExternalWalletProvider";
import { type PrivyClientConfig, PrivyProvider, useCreateWallet, useLogin, usePrivy } from "@privy-io/react-auth";
import { type SetActiveWalletForWagmiType, WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { disconnect } from "@wagmi/core";
import { createStorage } from "wagmi";
import { queryClient } from "~~/lib/queryClient";
import { evmChains, getEvmClient } from "~~/services/web3/evmChains";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const emailWalletConfig = createConfig({
  chains: evmChains,
  ssr: true,
  storage: createStorage({
    key: "kapan.email-wallet",
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  }),
  client: getEvmClient,
});

const selectEmailWallet: SetActiveWalletForWagmiType = ({ wallets, user }) => {
  if (!user) {
    return undefined;
  }

  return wallets.find(wallet => wallet.walletClientType === "privy");
};

const privyConfig = {
  loginMethods: ["email"],
  appearance: {
    theme: "dark",
    accentColor: "#3b82f6",
    landingHeader: "Sign in to Kapan",
    loginMessage: "Create or recover your email wallet. Your existing wallets stay separate.",
  },
  embeddedWallets: {
    ethereum: { createOnLogin: "all-users" },
    showWalletUIs: true,
  },
  defaultChain: evmChains[0],
  supportedChains: [...evmChains],
} satisfies PrivyClientConfig;

export default function PrivyWalletProvider({ appId, children }: PropsWithChildren<{ appId: string }>) {
  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletSession>{children}</WalletSession>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function WalletSession({ children }: PropsWithChildren) {
  const { ready, authenticated, logout, exportWallet } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { login } = useLogin({ onComplete: clearExternalConnections });
  const logoutEmail = useCallback(async () => {
    await clearExternalConnections();
    await logout();
  }, [logout]);
  const loginWithEmail = useCallback(() => login({ loginMethods: ["email"] }), [login]);
  const session = useMemo<EvmWalletSession>(
    () => ({
      kind: authenticated ? "email" : "external",
      ready,
      loginWithEmail,
      logout: logoutEmail,
      exportWallet,
      createWallet,
    }),
    [authenticated, ready, loginWithEmail, logoutEmail, exportWallet, createWallet],
  );

  const content = <EvmWalletSessionContext.Provider value={session}>{children}</EvmWalletSessionContext.Provider>;

  if (authenticated) {
    return (
      <WagmiProvider config={emailWalletConfig} setActiveWalletForWagmi={selectEmailWallet}>
        <WalletAppearance>{content}</WalletAppearance>
      </WagmiProvider>
    );
  }

  return (
    <ExternalWalletProvider key={ready ? "external" : "loading"} reconnectOnMount={ready}>
      {content}
    </ExternalWalletProvider>
  );
}

async function clearExternalConnections() {
  // Clear every remembered extension connection before handing ownership to email.
  const connections = [...wagmiConfig.state.connections.values()];
  for (const { connector } of connections) {
    await disconnect(wagmiConfig, { connector });
  }
}
