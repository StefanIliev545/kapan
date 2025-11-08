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
import { ModalProvider } from "~~/contexts/ModalContext";
import { NetworkProvider, useNetworkContext } from "~~/contexts/NetworkContext";
import dynamic from "next/dynamic";
import { ControllerConnector } from "@cartridge/connector";
import { constants } from "starknet";

// Lazy-load the unified modal component - code-split into separate chunk
const UnifiedTransactionModal = dynamic(
  () => import("~~/components/modals/UnifiedTransactionModal").then(m => ({ default: m.UnifiedTransactionModal })),
  {
    ssr: false,
    loading: () => null, // No loading UI needed - modal only shows when open
  }
);

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
      <Toaster />
    </SelectedGasTokenProvider>
  );
};

// Inner component that uses NetworkContext to key providers
const ScaffoldEthAppWithProvidersInner = ({
  children,
  initialHost,
}: {
  children: React.ReactNode;
  initialHost?: string | null;
}) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);
  const { selectedChainId, networkType } = useNetworkContext();

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

  // Key providers based on network to force remount on network change
  // Use stable keys that change when network type or chain ID changes
  const evmProviderKey = useMemo(() => {
    const key = networkType === "evm" && selectedChainId !== null 
      ? `evm-${selectedChainId}` 
      : "evm-off";
    console.log("[ScaffoldEthApp] EVM provider key:", key, "networkType:", networkType, "selectedChainId:", selectedChainId);
    return key;
  }, [networkType, selectedChainId]);
  
  // Note: The StarknetConfig key changes based on network type to pause/resume Starknet queries.
  // When switching to EVM, the key becomes "stark-off" which causes a remount.
  // However, with autoConnect={true}, the Starknet wallet will automatically reconnect when
  // switching back to Starknet. The AccountContext is independent of NetworkContext, so
  // the connection state is preserved in localStorage and will be restored via autoConnect.
  const starkProviderKey = useMemo(() => {
    const key = networkType === "stark" 
      ? `stark-${selectedChainId ?? "main"}` 
      : "stark-off";
    console.log("[ScaffoldEthApp] Stark provider key:", key, "networkType:", networkType, "selectedChainId:", selectedChainId);
    return key;
  }, [networkType, selectedChainId]);

  return (
    <WagmiProvider key={evmProviderKey} config={wagmiConfig}>
      <StarknetConfig
        key={starkProviderKey}
        chains={appChains}
        provider={provider}
        paymasterProvider={paymasterProvider}
        connectors={connectorsRef.current}
        explorer={starkscan}
        autoConnect={true}
      >
        <AccountProvider>
          <BlockNumberProvider>
            <StarkBlockNumberProvider>
              <ProgressBar height="3px" color="#2299dd" />
              <RainbowKitProvider
                avatar={BlockieAvatar}
                theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
              >
                <ModalProvider>
                  <StarknetWalletAnalytics />
                  <WalletAnalytics />
                  <ScaffoldEthApp initialHost={initialHost}>{children}</ScaffoldEthApp>
                  <UnifiedTransactionModal />
                </ModalProvider>
              </RainbowKitProvider>
            </StarkBlockNumberProvider>
          </BlockNumberProvider>
        </AccountProvider>
      </StarknetConfig>
    </WagmiProvider>
  );
};

export const ScaffoldEthAppWithProviders = ({
  children,
  initialHost,
}: {
  children: React.ReactNode;
  initialHost?: string | null;
}) => {
  return (
    <NetworkProvider>
      <ScaffoldEthAppWithProvidersInner initialHost={initialHost}>{children}</ScaffoldEthAppWithProvidersInner>
    </NetworkProvider>
  );
};
