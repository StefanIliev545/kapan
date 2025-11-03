"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import {
  StarknetConfig,
  argent,
  braavos,
  starkscan,
  useInjectedConnectors,
  type Connector,
} from "@starknet-react/core";
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
import { LandingHeader } from "~~/components/LandingHeader";
import { AppHeader } from "~~/components/AppHeader";
import { WalletAnalytics } from "~~/components/WalletAnalytics";
import { StarknetWalletAnalytics } from "~~/components/StarknetWalletAnalytics";
import { usePathname } from "next/navigation";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { BlockNumberProvider } from "~~/hooks/scaffold-eth";
import { StarkBlockNumberProvider } from "~~/hooks/scaffold-stark";
import { appChains } from "~~/services/web3/connectors";
import provider, { paymasterProvider } from "~~/services/web3/provider";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { AccountProvider } from "~~/contexts/AccountContext";
import { SelectedGasTokenProvider } from "~~/contexts/SelectedGasTokenContext";
import { ControllerConnector } from "@cartridge/connector";
import { constants } from "starknet";

const cartridgeConnector = new ControllerConnector({
  chains: [
    { rpcUrl: "https://api.cartridge.gg/x/starknet/mainnet" },
    { rpcUrl: "https://api.cartridge.gg/x/starknet/sepolia" },
  ],
  defaultChainId: constants.StarknetChainId.SN_MAIN,
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  useInitializeNativeCurrencyPrice();
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Determine which header to render based on the current route
  const renderHeader = () => {
    // Check if hostname starts with "app." (for rewritten URLs like app.kapan.finance -> kapan.finance/app)
    // Guarded behind client-mount to avoid SSR hydration differences on Vercel.
    const isAppSubdomain = isClient && typeof window !== 'undefined' && window.location.hostname.startsWith('app.');
    
    if (pathname.startsWith('/app') || isAppSubdomain) {
      return <AppHeader />;
    } else if (pathname === '/' || pathname.startsWith('/info') || pathname.startsWith('/automate')) {
      return <LandingHeader />;
    } else {
      return <Header />;
    }
  };

  return (
    <SelectedGasTokenProvider>
      <div className={`flex flex-col min-h-screen `}>
        {renderHeader()}
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
  const liveConnectors = useMemo(() => injected.connectors ?? [], [injected.connectors]);

  const connectorsRef = useRef<Connector[]>([cartridgeConnector]);

  useEffect(() => {
    const connectorsWithCartridge = [
      ...liveConnectors.filter((connector) => connector.id !== cartridgeConnector.id),
      cartridgeConnector,
    ];

    connectorsRef.current = connectorsWithCartridge;
  }, [liveConnectors]);

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      paymasterProvider={paymasterProvider}
      connectors={connectorsRef.current}
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
                <StarknetWalletAnalytics />
                <WalletAnalytics />
                <ScaffoldEthApp>{children}</ScaffoldEthApp>
              </RainbowKitProvider>
            </StarkBlockNumberProvider>
          </BlockNumberProvider>
        </WagmiProvider>
      </AccountProvider>
    </StarknetConfig>
  );
};
