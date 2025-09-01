"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { StarknetConfig, argent, braavos, starkscan, useInjectedConnectors } from "@starknet-react/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { BlockNumberProvider } from "~~/hooks/scaffold-eth";
import { StarkBlockNumberProvider } from "~~/hooks/scaffold-stark";
import { appChains } from "~~/services/web3/connectors";
import provider from "~~/services/web3/provider";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  useInitializeNativeCurrencyPrice();

  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 2,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const injected = useInjectedConnectors({
    recommended: [argent(), braavos()],
    includeRecommended: "onlyIfNoConnectors",
    order: "alphabetical",
  });
  const liveConnectors = useMemo(() => injected.connectors, [injected.connectors]);
  const loggingConnectors = useMemo(
    () =>
      liveConnectors.map(connector =>
        new Proxy(connector, {
          get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (prop === "connect" && typeof value === "function") {
              return async (...args: unknown[]) => {
                console.log(`Connecting with ${target.id}`);
                // eslint-disable-next-line @typescript-eslint/ban-types
                return (value as Function).apply(target, args);
              };
            }
            return value;
          },
        }) as typeof connector,
      ),
    [liveConnectors],
  );

  const connectorsRef = useRef<typeof liveConnectors | null>(null);
  if (!connectorsRef.current && loggingConnectors?.length) {
    connectorsRef.current = loggingConnectors;
  }

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      connectors={connectorsRef.current ?? []}
      explorer={starkscan}
      autoConnect={false}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
      </WagmiProvider>
    </StarknetConfig>
  );
};
