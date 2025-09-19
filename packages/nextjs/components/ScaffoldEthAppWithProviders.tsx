"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { StarknetConfig, argent, braavos, starkscan, useInjectedConnectors } from "@starknet-react/core";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { Fordefi } from "starknetkit/fordefi";
import { Keplr } from "starknetkit/keplr";
import { MetaMask } from "starknetkit/metamask";
import { WagmiProvider } from "wagmi";
import FloatingSocials from "~~/components/FloatingSocials";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { BlockNumberProvider } from "~~/hooks/scaffold-eth";
import { StarkBlockNumberProvider } from "~~/hooks/scaffold-stark";
import { appChains } from "~~/services/web3/connectors";
import provider, { paymasterProvider } from "~~/services/web3/provider";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { AccountProvider } from "~~/contexts/AccountContext";
import { SelectedGasTokenProvider } from "~~/contexts/SelectedGasTokenContext";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  useInitializeNativeCurrencyPrice();

  return (
    <SelectedGasTokenProvider>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <FloatingSocials />
      <Toaster />
    </SelectedGasTokenProvider>
  );
};

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const injected = useInjectedConnectors({
    recommended: [argent(), braavos(), new MetaMask(), new Keplr(), new Fordefi()],
    includeRecommended: "onlyIfNoConnectors",
    order: "alphabetical",
  });
  const liveConnectors = useMemo(() => injected.connectors, [injected.connectors]);

  const connectorsRef = useRef<typeof liveConnectors | null>(null);
  if (!connectorsRef.current && liveConnectors?.length) {
    connectorsRef.current = liveConnectors;
  }

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      paymasterProvider={paymasterProvider}
      connectors={connectorsRef.current ?? []}
      explorer={starkscan}
      autoConnect={true}
    >
      <AccountProvider>
        <WagmiProvider config={wagmiConfig}>
          <BlockNumberProvider>
            <StarkBlockNumberProvider>
              <ProgressBar height="3px" color="#2299dd" />
              <RainbowKitProvider
                avatar={BlockieAvatar}
                theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
              >
                <ScaffoldEthApp>{children}</ScaffoldEthApp>
              </RainbowKitProvider>
            </StarkBlockNumberProvider>
          </BlockNumberProvider>
        </WagmiProvider>
      </AccountProvider>
    </StarknetConfig>
  );
};
