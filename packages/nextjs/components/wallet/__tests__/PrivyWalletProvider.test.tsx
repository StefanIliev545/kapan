import type { PropsWithChildren } from "react";
import { useEvmWalletSession } from "../EvmWalletSession";
import PrivyWalletProvider from "../PrivyWalletProvider";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "~~/lib/queryClient";

type TestWallet = { address: string; walletClientType: string };
type SelectWallet = (args: { wallets: TestWallet[]; user: object | null }) => TestWallet | undefined;

const mocks = vi.hoisted(() => ({
  auth: { ready: false, authenticated: false },
  logout: vi.fn(),
  exportWallet: vi.fn(),
  createWallet: vi.fn(),
  login: vi.fn(),
  loginOptions: undefined as { onComplete: () => Promise<void> } | undefined,
  selectWallet: undefined as SelectWallet | undefined,
  connections: new Map<string, { connector: { uid: string } }>(),
  disconnect: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ children }: PropsWithChildren) => children,
  usePrivy: () => ({ ...mocks.auth, logout: mocks.logout, exportWallet: mocks.exportWallet }),
  useCreateWallet: () => ({ createWallet: mocks.createWallet }),
  useLogin: (options: { onComplete: () => Promise<void> }) => {
    mocks.loginOptions = options;
    return { login: mocks.login };
  },
}));
vi.mock("@privy-io/wagmi", () => ({
  createConfig: () => ({ id: "email-wallet-config" }),
  WagmiProvider: ({
    children,
    setActiveWalletForWagmi,
  }: PropsWithChildren<{ setActiveWalletForWagmi: SelectWallet }>) => {
    mocks.selectWallet = setActiveWalletForWagmi;
    return <section data-testid="email-provider">{children}</section>;
  },
}));
vi.mock("wagmi", () => ({ createStorage: () => ({}) }));
vi.mock("@wagmi/core", () => ({ disconnect: mocks.disconnect }));
vi.mock("~~/services/web3/evmChains", () => ({ evmChains: [{ id: 8453 }], getEvmClient: vi.fn() }));
vi.mock("~~/services/web3/wagmiConfig", () => ({
  wagmiConfig: { state: { connections: mocks.connections } },
}));
vi.mock("../ExternalWalletProvider", () => ({
  ExternalWalletProvider: ({ children, reconnectOnMount }: PropsWithChildren<{ reconnectOnMount: boolean }>) => (
    <section data-testid="external-provider" data-reconnect={String(reconnectOnMount)}>
      {children}
    </section>
  ),
  WalletAppearance: ({ children }: PropsWithChildren) => children,
}));

function SessionProbe() {
  const session = useEvmWalletSession();
  const client = useQueryClient();
  return (
    <>
      <span data-testid="session">
        {session.kind}:{String(session.ready)}
      </span>
      <span data-testid="cache">{client.getQueryData<string>(["wallet-provider-regression"])}</span>
      <span data-testid="shared-client">{String(client === queryClient)}</span>
      <button onClick={session.loginWithEmail}>Email login</button>
      <button onClick={session.logout}>Email logout</button>
    </>
  );
}

const tree = () => (
  <QueryClientProvider client={queryClient}>
    <PrivyWalletProvider appId="test-app-id">
      <SessionProbe />
    </PrivyWalletProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.ready = false;
  mocks.auth.authenticated = false;
  mocks.connections.clear();
  mocks.selectWallet = undefined;
  mocks.logout.mockResolvedValue(undefined);
  mocks.disconnect.mockImplementation(async (_config: unknown, options?: { connector: { uid: string } }) => {
    // Wagmi removes one selected/current connection, then activates the next one.
    const uid = options?.connector.uid ?? mocks.connections.keys().next().value;
    if (uid) {
      mocks.connections.delete(uid);
    }
  });
  queryClient.setQueryData(["wallet-provider-regression"], "existing-cache");
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("Privy wallet ownership", () => {
  it("delays external reconnection until authentication is ready and preserves the shared cache", () => {
    const view = render(tree());
    const loadingProvider = screen.getByTestId("external-provider");
    expect(loadingProvider).toHaveAttribute("data-reconnect", "false");
    expect(screen.queryByTestId("email-provider")).not.toBeInTheDocument();
    expect(screen.getByTestId("session")).toHaveTextContent("external:false");

    mocks.auth.ready = true;
    view.rerender(tree());

    expect(screen.getByTestId("external-provider")).toHaveAttribute("data-reconnect", "true");
    // Reconnection happens on mount; updating a prop on the old provider is insufficient.
    expect(screen.getByTestId("external-provider")).not.toBe(loadingProvider);
    expect(screen.getByTestId("shared-client")).toHaveTextContent("true");
    expect(screen.getByTestId("cache")).toHaveTextContent("existing-cache");
  });

  it("gives exactly one provider ownership as email authentication starts and ends", () => {
    mocks.auth.ready = true;
    const view = render(tree());
    expect(screen.getAllByTestId("external-provider")).toHaveLength(1);

    mocks.auth.authenticated = true;
    view.rerender(tree());
    expect(screen.queryByTestId("external-provider")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("email-provider")).toHaveLength(1);
    expect(screen.getByTestId("session")).toHaveTextContent("email:true");
    expect(screen.getByTestId("shared-client")).toHaveTextContent("true");
    expect(screen.getByTestId("cache")).toHaveTextContent("existing-cache");

    mocks.auth.authenticated = false;
    view.rerender(tree());
    expect(screen.queryByTestId("email-provider")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("external-provider")).toHaveLength(1);
    expect(screen.getByTestId("cache")).toHaveTextContent("existing-cache");
  });

  it("selects the embedded wallet even when an external wallet is first, and never falls back to it", () => {
    mocks.auth.ready = true;
    mocks.auth.authenticated = true;
    render(tree());
    const external = { address: "0xexternal", walletClientType: "rabby" };
    const embedded = { address: "0xembedded", walletClientType: "privy" };
    expect(mocks.selectWallet?.({ wallets: [external, embedded], user: {} })).toBe(embedded);
    expect(mocks.selectWallet?.({ wallets: [external], user: {} })).toBeUndefined();
    expect(mocks.selectWallet?.({ wallets: [embedded], user: null })).toBeUndefined();
  });

  it("clears an old external connection only after email login completes", async () => {
    mocks.auth.ready = true;
    mocks.connections.set("old-extension", { connector: { uid: "old-extension" } });
    render(tree());

    fireEvent.click(screen.getByRole("button", { name: "Email login" }));
    expect(mocks.login).toHaveBeenCalledWith({ loginMethods: ["email"] });
    expect(mocks.disconnect).not.toHaveBeenCalled();

    await act(async () => {
      await mocks.loginOptions?.onComplete();
    });
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.connections.size).toBe(0);

    await act(async () => {
      await mocks.loginOptions?.onComplete();
    });
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("clears every saved external connection so another wallet cannot reappear after email logout", async () => {
    mocks.auth.ready = true;
    mocks.connections.set("rabby", { connector: { uid: "rabby" } });
    mocks.connections.set("metamask", { connector: { uid: "metamask" } });
    render(tree());

    await act(async () => {
      await mocks.loginOptions?.onComplete();
    });

    expect(mocks.connections.size).toBe(0);
    expect(mocks.disconnect).toHaveBeenCalledTimes(2);
  });

  it("clears stale external connections before logging out a restored email session", async () => {
    mocks.auth.ready = true;
    mocks.auth.authenticated = true;
    mocks.connections.set("stale-extension", { connector: { uid: "stale-extension" } });
    let connectionsAtLogout: number | undefined;
    mocks.logout.mockImplementation(async () => {
      connectionsAtLogout = mocks.connections.size;
    });
    render(tree());

    // A restored session has no new login callback to perform the cleanup.
    expect(mocks.login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Email logout" }));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledOnce();
    });
    expect(connectionsAtLogout).toBe(0);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
