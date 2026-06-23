"use client";

// BigInt JSON serialization polyfill - prevents "Cannot serialize BigInt" errors
// This must be at the top level, before any other code runs
if (typeof BigInt !== "undefined") {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
    return this.toString();
  };
}

import { Suspense, useEffect, useMemo, useState } from "react";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import {
  StarknetConfig,
  argent,
  braavos,
  starkscan,
  useInjectedConnectors,
  type Connector,
} from "@starknet-react/core";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "sonner";
import { Fordefi } from "starknetkit/fordefi";
import { Keplr } from "starknetkit/keplr";
import { MetaMask } from "starknetkit/metamask";
import { WagmiProvider } from "wagmi";
import { PendingOrdersDrawer } from "~~/components/common/PendingOrdersDrawer";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { LandingHeader } from "~~/components/LandingHeader";
import { AppHeader } from "~~/components/AppHeader";
import { WalletAnalytics } from "~~/components/WalletAnalytics";
import { StarknetWalletAnalytics } from "~~/components/StarknetWalletAnalytics";
import { StarknetSessionRecovery } from "~~/components/StarknetSessionRecovery";
import { usePathname } from "next/navigation";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { useBridgeTracking } from "~~/hooks/useBridgeTracking";
import { BlockNumberProvider } from "~~/hooks/scaffold-eth";
import { StarkBlockNumberProvider } from "~~/hooks/scaffold-stark";
import { appChains } from "~~/services/web3/connectors";
import provider, { paymasterProvider } from "~~/services/web3/provider";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { AccountProvider } from "~~/contexts/AccountContext";
import { SelectedGasTokenProvider } from "~~/contexts/SelectedGasTokenContext";
import { LandingSectionProvider } from "~~/contexts/LandingSectionContext";
import { ReferralProvider } from "~~/contexts/ReferralContext";
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
}: {
  children: React.ReactNode;
}) => {
  useInitializeNativeCurrencyPrice();
  useBridgeTracking();
  const pathname = usePathname();
  // Host is read on the client only (after mount). We intentionally do NOT seed this from the
  // server (it used to come from headers() in the root layout) — reading headers() there forced
  // every route into dynamic rendering, blocking SSG/ISR for the programmatic /rates pages.
  // Starting null keeps the server and first client render identical (no hydration mismatch).
  //
  // KNOWN TRADE-OFF: on the `app.` subdomain, next.config rewrites `/` -> `/app` transparently, but
  // usePathname() still sees `/`, so until this effect runs the chrome falls back to LandingHeader
  // for one tick before swapping to AppHeader (and PendingOrdersDrawer mounts). Cosmetic, app-side,
  // self-correcting. The proper fix (host-aware chrome without tainting the static pages) is to give
  // the SEO route group its own minimal layout with no wallet providers — tracked as a follow-up.
  const [hostname, setHostname] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostname(window.location.hostname);
    }
  }, []);

  const isAppSubdomain = hostname?.startsWith("app.") ?? false;
  const isAppExperience = pathname.startsWith("/app") || pathname.startsWith("/markets") || pathname.startsWith("/orders") || isAppSubdomain;
  const isLandingRoute = pathname === "/" || pathname.startsWith("/info") || pathname.startsWith("/about");

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
      <LandingSectionProvider>
        <div className={`flex min-h-screen flex-col `}>
          {renderHeader()}
          <main className="relative flex flex-1 flex-col">{children}</main>
          <Footer />
        </div>
        {isAppExperience && <PendingOrdersDrawer />}
        <Toaster position="bottom-right" />
      </LandingSectionProvider>
    </SelectedGasTokenProvider>
  );
};

export const ScaffoldEthAppWithProviders = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Always dark mode with kapan theme

  const injected = useInjectedConnectors({
    recommended: [argent(), braavos(), new MetaMask(), new Keplr(), new Fordefi()],
    // "always" shows every recommended wallet in our picker regardless of
    // whether the extension has been detected yet (injected wallets often
    // aren't in `window.starknet_*` at initial render). "onlyIfNoConnectors"
    // was hiding them whenever Cartridge was also present.
    includeRecommended: "always",
    order: "alphabetical",
  });
  const liveConnectors = useMemo(() => injected.connectors ?? [], [injected.connectors]);

  // IMPORTANT: this must be a memoized value, not a ref. autoConnect in
  // StarknetConfig runs on mount using whatever `connectors` was at first
  // render — if we hand it a ref whose .current mutates later, the effect
  // fires against the stale array and only the initially-included connectors
  // (previously: Cartridge only) are considered for reconnection. That's
  // exactly why Braavos auto-reconnect was broken. Passing a memoized array
  // re-renders StarknetConfig when injected wallets arrive, so autoConnect
  // targets the full set.
  const connectors = useMemo<Connector[]>(
    () => [
      ...liveConnectors.filter(c => c.id !== cartridgeConnector.id),
      cartridgeConnector,
    ],
    [liveConnectors],
  );

  return (
    <StarknetConfig
      chains={appChains}
      provider={provider}
      paymasterProvider={paymasterProvider}
      connectors={connectors}
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
                  theme={darkTheme()}
                >
                  <ReferralProvider>
                    <StarknetSessionRecovery />
                    <StarknetWalletAnalytics />
                    <WalletAnalytics />
                    <ScaffoldEthApp>{children}</ScaffoldEthApp>
                  </ReferralProvider>
                </RainbowKitProvider>
              </StarkBlockNumberProvider>
            </BlockNumberProvider>
          </WagmiProvider>
        </AccountProvider>
      </Suspense>
    </StarknetConfig>
  );
};
