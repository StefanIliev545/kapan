import { getEvmClient } from "../evmChains";
import { wagmiConfig } from "../wagmiConfig";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WagmiProvider, useConnectors } from "wagmi";
import { queryClient } from "~~/lib/queryClient";

// Keep Wagmi and the application's createConfig call real. The curated wallet
// factories and RPC clients are unnecessary for passive extension discovery.
vi.mock("../wagmiConnectors", () => ({ getWagmiConnectors: () => [] }));
vi.mock("../evmChains", async () => ({
  evmChains: [(await import("viem/chains")).base],
  getEvmClient: vi.fn(() => {
    throw new Error("Discovery must not create an RPC client");
  }),
}));

afterEach(() => {
  cleanup();
  queryClient.clear();
  wagmiConfig._internal.mipd?.destroy();
});

it("discovers an announced EIP-6963 extension through the real Wagmi config after hydration", async () => {
  const request = vi.fn();
  const provider = { request, on: vi.fn(), removeListener: vi.fn() };
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid: "4cb7b331-a043-43eb-8737-d48180517a45",
          name: "Synthetic extension wallet",
          rdns: "test.kapan.synthetic-wallet",
          icon: "data:image/svg+xml;base64,PHN2Zy8+",
        },
        provider,
      },
    }),
  );

  function WalletChoices() {
    const connectors = useConnectors();
    return (
      <ul>
        {connectors.map(connector => (
          <li key={connector.uid}>{connector.name}</li>
        ))}
      </ul>
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      {/* Discovery must work before the user authorizes a connection. */}
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
        <WalletChoices />
      </WagmiProvider>
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Synthetic extension wallet")).toBeInTheDocument();
  expect(wagmiConfig.state.connections.size).toBe(0);
  expect(request).not.toHaveBeenCalled();
  expect(getEvmClient).not.toHaveBeenCalled();
});
