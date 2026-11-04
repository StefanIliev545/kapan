import { render, cleanup } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "~~/app/providers/QueryProvider";
import { ScaffoldEthAppWithProviders } from "../ScaffoldEthAppWithProviders";
import { queryClient } from "~~/lib/queryClient";

const { Shell, Empty } = vi.hoisted(() => ({
  Shell: ({ children }: { children?: unknown }) => children,
  Empty: () => null,
}));

// Keep the real StarknetConfig and QueryProvider: their nested cache contexts
// are the integration under test. The surrounding app and wallets are inert.
vi.mock("@starknet-react/core", async importOriginal => ({
  ...await importOriginal<typeof import("@starknet-react/core")>(),
  useInjectedConnectors: () => ({ connectors: [] }),
  argent: () => ({}),
  braavos: () => ({}),
}));
vi.mock("@cartridge/connector", () => ({ ControllerConnector: class { id = "test-controller"; } }));
vi.mock("starknetkit/fordefi", () => ({ Fordefi: class {} }));
vi.mock("starknetkit/keplr", () => ({ Keplr: class {} }));
vi.mock("starknetkit/metamask", () => ({ MetaMask: class {} }));
vi.mock("@rainbow-me/rainbowkit", () => ({ RainbowKitProvider: Shell, darkTheme: () => ({}) }));
vi.mock("wagmi", () => ({ WagmiProvider: Shell }));
vi.mock("next-nprogress-bar", () => ({ AppProgressBar: Empty }));
vi.mock("sonner", () => ({ Toaster: Empty }));
vi.mock("~~/services/web3/connectors", async () => ({ appChains: [(await import("@starknet-react/chains")).mainnet] }));
vi.mock("~~/services/web3/provider", () => ({ default: () => ({}), paymasterProvider: () => ({}) }));
vi.mock("~~/services/web3/wagmiConfig", () => ({ wagmiConfig: {} }));
vi.mock("~~/hooks/scaffold-eth", () => ({ useInitializeNativeCurrencyPrice: Empty, BlockNumberProvider: Shell }));
vi.mock("~~/hooks/scaffold-stark", () => ({ StarkBlockNumberProvider: Shell }));
vi.mock("~~/hooks/useBridgeTracking", () => ({ useBridgeTracking: Empty }));
vi.mock("~~/components/scaffold-eth", () => ({ BlockieAvatar: Empty }));
vi.mock("~~/components/common/PendingOrdersDrawer", () => ({ PendingOrdersDrawer: Empty }));
vi.mock("~~/components/Footer", () => ({ Footer: Empty }));
vi.mock("~~/components/Header", () => ({ Header: Empty }));
vi.mock("~~/components/LandingHeader", () => ({ LandingHeader: Empty }));
vi.mock("~~/components/AppHeader", () => ({ AppHeader: Empty }));
vi.mock("~~/components/WalletAnalytics", () => ({ WalletAnalytics: Empty }));
vi.mock("~~/components/StarknetWalletAnalytics", () => ({ StarknetWalletAnalytics: Empty }));
vi.mock("~~/components/StarknetSessionRecovery", () => ({ StarknetSessionRecovery: Empty }));
vi.mock("~~/contexts/AccountContext", () => ({ AccountProvider: Shell }));
vi.mock("~~/contexts/SelectedGasTokenContext", () => ({ SelectedGasTokenProvider: Shell }));
vi.mock("~~/contexts/LandingSectionContext", () => ({ LandingSectionProvider: Shell }));
vi.mock("~~/contexts/ReferralContext", () => ({ ReferralProvider: Shell }));

afterEach(() => { cleanup(); queryClient.clear(); });

describe("ScaffoldEthAppWithProviders", () => {
  it("preserves the configured query client and its cache inside StarknetConfig", () => {
    queryClient.setQueryData(["provider-regression"], "cached");
    const seen: unknown[] = [];
    function Probe() {
      const client = useQueryClient();
      seen.push(client);
      return <span>{client.getQueryData<string>(["provider-regression"])}</span>;
    }
    const tree = () => <QueryProvider><ScaffoldEthAppWithProviders><Probe /></ScaffoldEthAppWithProviders></QueryProvider>;
    const view = render(tree());
    expect(view.getByText("cached")).toBeInTheDocument();
    view.rerender(tree());
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every(client => client === queryClient)).toBe(true);
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 60_000, refetchOnWindowFocus: false, refetchOnMount: false,
    });
  });
});
