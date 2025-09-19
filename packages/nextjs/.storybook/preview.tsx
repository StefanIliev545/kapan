"use client";

import type { Preview } from "@storybook/react";
import { initialize, mswLoader } from "msw-storybook-addon";
import React, { PropsWithChildren, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { SelectedGasTokenProvider } from "~~/contexts/SelectedGasTokenContext";
import { argent, braavos, StarknetConfig, useInjectedConnectors, voyager } from "@starknet-react/core";
import { WagmiProvider } from "wagmi";
import { appChains } from "~~/services/web3/connectors";
import provider, { paymasterProvider } from "~~/services/web3/provider";
import { enabledChains, wagmiConfig } from "~~/services/web3/wagmiConfig";
import "@rainbow-me/rainbowkit/styles.css";
import "~~/styles/globals.css";

// Initialize Mock Service Worker globally for all stories
initialize({ onUnhandledRequest: "bypass" });

// Reuse a single QueryClient instance across all stories to avoid cache churn
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const Web3Providers = ({ children }: PropsWithChildren) => {
  const injected = useInjectedConnectors({
    recommended: [argent(), braavos()],
    includeRecommended: "onlyIfNoConnectors",
    order: "alphabetical",
  });

  const connectorsRef = useRef(injected.connectors);

  useEffect(() => {
    if (injected.connectors.length) {
      connectorsRef.current = injected.connectors;
    }
  }, [injected.connectors]);

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      paymasterProvider={paymasterProvider}
      connectors={connectorsRef.current ?? []}
      autoConnect={false}
      explorer={voyager}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider chains={enabledChains} modalSize="compact">
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </StarknetConfig>
  );
};

const AppProviders = ({ children }: PropsWithChildren) => (
  <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
    <SelectedGasTokenProvider>{children}</SelectedGasTokenProvider>
  </ThemeProvider>
);

const preview: Preview = {
  globalTypes: {
    dataMode: {
      name: "Data source",
      description: "Choose between mocked or live contract data",
      defaultValue: "mocked" as const,
      toolbar: {
        icon: "database",
        items: [
          { value: "mocked", title: "Mocked data" },
          { value: "live", title: "Live data" },
        ],
      },
    },
  },
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: "dark",
    },
    nextjs: {
      appDirectory: true,
    },
    msw: {
      handlers: [],
    },
  },
  decorators: [
    (Story, context) => {
      const dataMode =
        (context.globals?.dataMode as "mocked" | "live" | undefined) ?? "mocked";

      useEffect(() => {
        if (typeof window === "undefined") return;
        const target = window as unknown as { __STORYBOOK_MOCKS?: unknown };
        if (dataMode === "mocked" && context.parameters.storybookMocks) {
          target.__STORYBOOK_MOCKS = context.parameters.storybookMocks;
        } else if (target.__STORYBOOK_MOCKS) {
          delete target.__STORYBOOK_MOCKS;
        }
        return () => {
          if (typeof window === "undefined") return;
          const current = window as unknown as { __STORYBOOK_MOCKS?: unknown };
          if (current.__STORYBOOK_MOCKS === context.parameters.storybookMocks) {
            delete current.__STORYBOOK_MOCKS;
          }
        };
      }, [context.parameters.storybookMocks, dataMode]);

      return (
        <AppProviders>
          <Web3Providers>
            <Story />
          </Web3Providers>
        </AppProviders>
      );
    },
  ],
  loaders: [mswLoader],
};

export default preview;
