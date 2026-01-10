import type { Preview } from "@storybook/react";
import React, { Suspense } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StarknetConfig, publicProvider, argent, braavos } from "@starknet-react/core";
import { wagmiConfig } from "../services/web3/wagmiConfig";
import { AccountProvider } from "../contexts/AccountContext";
import { SelectedGasTokenProvider } from "../contexts/SelectedGasTokenContext";
import { appChains } from "../services/web3/connectors";

// Import global CSS
import "../styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";

// Create a client for react-query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// Starknet connectors for Storybook (minimal)
const starknetConnectors = [argent(), braavos()];

// Minimal provider wrapper for Storybook
const StorybookProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <StarknetConfig
        chains={appChains}
        provider={publicProvider()}
        connectors={starknetConnectors}
        autoConnect={false}
      >
        <WagmiProvider config={wagmiConfig}>
          <AccountProvider>
            <RainbowKitProvider theme={darkTheme()}>
              <SelectedGasTokenProvider>
                <div data-theme="kapan" className="dark min-h-screen bg-base-100">
                  {children}
                </div>
              </SelectedGasTokenProvider>
            </RainbowKitProvider>
          </AccountProvider>
        </WagmiProvider>
      </StarknetConfig>
    </QueryClientProvider>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0d0d0d" },
        { name: "light", value: "#ffffff" },
      ],
    },
  },
  decorators: [
    (Story) => (
      <Suspense fallback={<div>Loading...</div>}>
        <StorybookProviders>
          <Story />
        </StorybookProviders>
      </Suspense>
    ),
  ],
};

export default preview;
