"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import {
  Connector,
  StarknetConfig,
  argent,
  braavos,
  starkscan,
  useInjectedConnectors,
} from "@starknet-react/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { useAutoConnect } from "~~/hooks/scaffold-stark";
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

  // Debug wrapper to trace connector method calls and suppress duplicate connects
  const connectedMap = useRef<Record<string, boolean>>({});
  const wrapConnector = (connector: Connector): Connector => {
    const originalConnect = connector.connect.bind(connector);
    const originalAvailable = connector.available.bind(connector);

    return new Proxy(connector, {
      get(target, prop, receiver) {
        if (prop === "connect") {
          return async (
            ...args: Parameters<Connector["connect"]>
          ) => {
            if (connectedMap.current[connector.id]) {
              console.debug(
                `[starknet connector] connect skipped: ${connector.id}`,
              );
              return { account: (connector as any).account } as any;
            }
            console.debug(`[starknet connector] connect: ${connector.id}`);
            const result = await originalConnect(...args);
            connectedMap.current[connector.id] = true;
            console.debug(
              `[starknet connector] connect resolved: ${connector.id}`,
            );
            return result;
          };
        }
        if (prop === "available") {
          return async (
            ...args: Parameters<Connector["available"]>
          ) => {
            console.debug(`[starknet connector] available: ${connector.id}`);
            return originalAvailable(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  };

  const wrapped = useMemo(() => liveConnectors.map(wrapConnector), [liveConnectors]);

  const connectorsRef = useRef<typeof wrapped | null>(null);
  if (!connectorsRef.current && wrapped?.length) {
    connectorsRef.current = wrapped;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const lastEnable: Record<string, number> = {};

    const patchWallet = (key: string) => {
      const wallet: any = (window as any)[key];
      if (wallet && !wallet.__kapan_patched) {
        if (typeof wallet.enable === "function") {
          const originalEnable = wallet.enable.bind(wallet);
          wallet.enable = async (...args: any[]) => {
            const now = Date.now();
            if (
              wallet.isConnected ||
              (lastEnable[key] && now - lastEnable[key] < 1000)
            ) {
              console.debug(
                `[starknet] enable skipped: already connected (${key})`,
              );
              return wallet;
            }
            lastEnable[key] = now;
            console.debug(`[starknet] enable called (${key})`);
            try {
              return await originalEnable({ ...(args[0] ?? {}), showModal: false });
            } catch {
              return originalEnable(...args);
            }
          };
        }
        if (typeof wallet.request === "function") {
          const originalRequest = wallet.request.bind(wallet);
          wallet.request = async (...args: any[]) => {
            try {
              console.debug(`[starknet] request (${key})`, args[0]);
            } catch (_) {
              /* ignore */
            }
            return originalRequest(...args);
          };
        }
        wallet.__kapan_patched = true;
      }
    };

    ["starknet", "braavos", "starknet_braavos"].forEach(patchWallet);
  }, []);
  const AutoConnector = () => {
    useAutoConnect();
    return null;
  };

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      connectors={connectorsRef.current ?? []}
      explorer={starkscan}
      // disable built-in autoConnect to avoid unwanted wallet popups
      autoConnect={false}
    >
      <AutoConnector />
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ProgressBar height="3px" color="#2299dd" />
          <RainbowKitProvider
            avatar={BlockieAvatar}
            theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
          >
            <ScaffoldEthApp>{children}</ScaffoldEthApp>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </StarknetConfig>
  );
};
