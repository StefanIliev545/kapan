"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { Toaster } from "sonner";
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

const ScaffoldEthApp = ({
  children,
  initialHost,
}: {
  children: React.ReactNode;
  initialHost?: string | null;
}) => {
  useInitializeNativeCurrencyPrice();
  const pathname = usePathname();
  const [hostname, setHostname] = useState<string | null>(initialHost ?? null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostname(window.location.hostname);
    }
  }, []);

  const isAppSubdomain = hostname?.startsWith("app.") ?? false;
  const isAppExperience = pathname.startsWith("/app") || isAppSubdomain;
  const isLandingRoute = pathname === "/" || pathname.startsWith("/info") || pathname.startsWith("/automate");

  const renderHeader = () => {
    if (isAppExperience) {
      return <AppHeader />;
    }

    if (isLandingRoute) {
      return <LandingHeader />;
    }

    return <Header />;
  };

  return (
    <SelectedGasTokenProvider>
      <div className={`flex flex-col min-h-screen `}>
        {renderHeader()}
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <FloatingSocials />
      <Toaster position="bottom-right" />
    </SelectedGasTokenProvider>
  );
};

export const ScaffoldEthAppWithProviders = ({
  children,
  initialHost,
}: {
  children: React.ReactNode;
  initialHost?: string | null;
}) => {
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
      <Suspense fallback={null}>
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
                  <ScaffoldEthApp initialHost={initialHost}>{children}</ScaffoldEthApp>
                </RainbowKitProvider>
              </StarkBlockNumberProvider>
            </BlockNumberProvider>
          </WagmiProvider>
        </AccountProvider>
      </Suspense>
    </StarknetConfig>
  );
};
