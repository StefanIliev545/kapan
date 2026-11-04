import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scaffoldConfig: {
    onlyLocalBurnerWallet: true,
    targetEVMNetworks: [{ id: 8453 }],
    walletConnectProjectId: "test-project-id",
  },
  connectorsForWallets: vi.fn((_groups: unknown, _options: unknown) => ["rainbowkit-connector"]),
  safe: vi.fn((_options: unknown) => "safe-connector"),
}));

vi.mock("~~/scaffold.config", () => ({ default: mocks.scaffoldConfig }));
vi.mock("@rainbow-me/rainbowkit", () => ({ connectorsForWallets: mocks.connectorsForWallets }));
vi.mock("@rainbow-me/rainbowkit/wallets", () => ({
  coinbaseWallet: "coinbase",
  injectedWallet: "injected",
  ledgerWallet: "ledger",
  metaMaskWallet: "metamask",
  phantomWallet: "phantom",
  rabbyWallet: "rabby",
  rainbowWallet: "rainbow",
  safeWallet: "safe",
  trustWallet: "trust",
  walletConnectWallet: "walletconnect",
  zerionWallet: "zerion",
}));
vi.mock("burner-connector", () => ({ rainbowkitBurnerWallet: "burner" }));
vi.mock("wagmi/connectors", () => ({ safe: mocks.safe }));

type WalletGroup = { groupName: string; wallets: string[] };

const configuredGroups = () => mocks.connectorsForWallets.mock.calls[0][0] as WalletGroup[];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  globalThis.wagmiConnectors = undefined;
  mocks.scaffoldConfig.onlyLocalBurnerWallet = true;
  mocks.scaffoldConfig.targetEVMNetworks = [{ id: 8453 }];
});

afterEach(() => {
  globalThis.wagmiConnectors = undefined;
  vi.unstubAllGlobals();
});

describe("EVM wallet connectors", () => {
  it("offers Rabby prominently and retains popular wallets and generic fallbacks", async () => {
    const { getWagmiConnectors } = await import("../wagmiConnectors");
    getWagmiConnectors();

    const groups = configuredGroups();
    const wallets = groups.flatMap(group => group.wallets);
    expect(groups[0].wallets[0]).toBe("rabby");
    expect(wallets).toEqual(
      expect.arrayContaining([
        "metamask",
        "coinbase",
        "rainbow",
        "phantom",
        "trust",
        "zerion",
        "ledger",
        "safe",
        "walletconnect",
        "injected",
      ]),
    );
    expect(new Set(wallets).size).toBe(wallets.length);
    expect(wallets).not.toContain("burner");
    expect(mocks.connectorsForWallets).toHaveBeenCalledWith(
      groups,
      expect.objectContaining({
        appName: "Kapan Finance",
        appUrl: "https://kapan.finance",
        projectId: "test-project-id",
      }),
    );
  });

  it.each([
    { chains: [31337], onlyLocal: true, expected: true },
    { chains: [31337, 8453], onlyLocal: true, expected: false },
    { chains: [8453], onlyLocal: false, expected: true },
  ])("preserves burner eligibility for $chains with onlyLocal=$onlyLocal", async ({ chains, onlyLocal, expected }) => {
    mocks.scaffoldConfig.targetEVMNetworks = chains.map(id => ({ id }));
    mocks.scaffoldConfig.onlyLocalBurnerWallet = onlyLocal;
    const { getWagmiConnectors } = await import("../wagmiConnectors");
    getWagmiConnectors();

    expect(configuredGroups().some(group => group.wallets.includes("burner"))).toBe(expected);
  });

  it("reuses wallet setup while preserving the Safe iframe connector and domain restrictions", async () => {
    const { getWagmiConnectors } = await import("../wagmiConnectors");
    expect(getWagmiConnectors()).toEqual(["safe-connector", "rainbowkit-connector"]);
    expect(getWagmiConnectors()).toEqual(["safe-connector", "rainbowkit-connector"]);
    expect(mocks.connectorsForWallets).toHaveBeenCalledOnce();

    const options = mocks.safe.mock.calls[0][0] as { allowedDomains: RegExp[]; debug: boolean };
    expect(options.debug).toBe(false);
    expect(options.allowedDomains.some(pattern => pattern.test("app.safe.global"))).toBe(true);
    expect(options.allowedDomains.some(pattern => pattern.test("gnosis-safe.io"))).toBe(true);
    expect(options.allowedDomains.some(pattern => pattern.test("app.safe.global.attacker.test"))).toBe(false);
  });

  it("does not initialize browser wallets during server rendering", async () => {
    vi.stubGlobal("window", undefined);
    const { getWagmiConnectors } = await import("../wagmiConnectors");

    expect(getWagmiConnectors()).toEqual([]);
    expect(mocks.connectorsForWallets).not.toHaveBeenCalled();
    expect(mocks.safe).not.toHaveBeenCalled();
  });
});
