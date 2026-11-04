// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWalletTokens } from "../useWalletTokens";
import type { PendleToken } from "../usePendleTokens";
import type { Holding } from "~~/utils/wallet/holdings";
import type { PendlePortfolioPosition } from "~~/utils/pendlePortfolio";
const state = vi.hoisted(() => {
  return {
    markets: [] as unknown[],
    prices: {} as Record<string, number>,
    account: "0x0000000000000000000000000000000000000010" as string | undefined,
    held: "0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef",
    getBalance: vi.fn(),
    multicall: vi.fn(),
    readContract: vi.fn(),
    aaveReceipts: [] as string[],
    compoundReceipts: [] as string[],
    fetchMarkets: vi.fn(),
    fetchHoldings: vi.fn(),
    indexed: [] as Holding[],
    pendleTokens: [] as PendleToken[],
    portfolioByPt: new Map<string, PendlePortfolioPosition>(),
    findYield: vi.fn(),
  };
});
vi.mock("wagmi", () => {
  return {
    useAccount: () => {
      return {
        address: state.account,
      };
    },
    usePublicClient: () => {
      return {
        getBalance: state.getBalance,
        multicall: state.multicall,
        readContract: state.readContract,
      };
    },
  };
});
vi.mock("../useExternalYields", () => {
  return {
    useExternalYields: () => {
      return {
        findYield: state.findYield,
      };
    },
  };
});
vi.mock("../usePendleTokens", () => {
  return {
    usePendleTokens: () => {
      return {
        tokens: state.pendleTokens,
      };
    },
  };
});
vi.mock("../usePendlePortfolio", () => {
  return {
    usePendlePortfolio: () => {
      return {
        byPtAddress: state.portfolioByPt,
      };
    },
    getPendlePortfolioKey: (chainId: number, address: string) => {
      return `${chainId}:${address.toLowerCase()}`;
    },
  };
});
vi.mock("~~/utils/wallet/holdings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~~/utils/wallet/holdings")>();
  return {
    ...actual,
    fetchHoldings: state.fetchHoldings,
  };
});
vi.mock("../useTokenPrice", () => {
  return {
    useTokenPricesByAddress: () => {
      return {
        prices: state.prices,
      };
    },
  };
});
vi.mock("~~/contracts/externalContracts", () => {
  return {
    tokenNameToLogo: () => {
      return "/token.svg";
    },
  };
});
vi.mock("~~/services/store/store", () => {
  return {
    useGlobalState: () => {
      return 2000;
    },
  };
});
vi.mock("~~/utils/morpho/marketApi", () => {
  return {
    fetchMorphoMarkets: state.fetchMarkets,
  };
});
vi.mock("../useMorphoLendingPositions", () => {
  return {
    useMorphoMarkets: () => {
      return {
        marketPairs: new Map([["pair", state.markets]]),
      };
    },
  };
});
const clients: QueryClient[] = [];
function setup(chainId = 42161) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => {
    return createElement(
      QueryClientProvider,
      {
        client,
      },
      children,
    );
  };
  return {
    client,
    ...renderHook(
      ({ chain }) => {
        return useWalletTokens(chain);
      },
      {
        wrapper,
        initialProps: {
          chain: chainId,
        },
      },
    ),
  };
}
function discovered(address: string, priceUsd = 1, decimals = 18) {
  return {
    collateralAsset: null,
    loanAsset: {
      address,
      symbol: "KNOWN",
      decimals,
      priceUsd,
    },
    state: {
      supplyAssetsUsd: 0,
    },
  };
}
beforeEach(() => {
  state.markets = [];
  state.prices = {};
  state.account = "0x0000000000000000000000000000000000000010";
  state.held = "0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef";
  state.indexed = [];
  state.pendleTokens = [];
  state.portfolioByPt = new Map();
  state.findYield.mockReset().mockReturnValue(undefined);
  state.fetchHoldings.mockReset().mockImplementation(async (chainId, owner) => {
    return {
      chainId,
      owner,
      holdings: state.indexed,
      enumerationComplete: true,
      issues: [],
    };
  });
  state.getBalance.mockReset().mockResolvedValue(0n);
  state.aaveReceipts = [];
  state.compoundReceipts = [];
  state.readContract.mockReset().mockImplementation(async ({ functionName }) => {
    if (functionName === "getPoolDataProvider") {
      return "0x0000000000000000000000000000000000000040";
    }
    if (functionName === "allActiveComets") {
      return state.compoundReceipts;
    }
    return state.aaveReceipts.map((tokenAddress) => {
      return {
        symbol: "aToken",
        tokenAddress,
      };
    });
  });
  state.fetchMarkets.mockReset().mockImplementation(async () => {
    return state.markets;
  });
  state.multicall.mockReset().mockImplementation(async ({ contracts }) => {
    return contracts.map((call: { address: string }) => {
      return {
        status: "success",
        result: call.address.toLowerCase() === state.held ? 2n * 10n ** 18n : 0n,
      };
    });
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => {
    return client.clear();
  });
  vi.restoreAllMocks();
});
function indexedHolding(address = state.held, overrides: Partial<Holding> = {}): Holding {
  return {
    address: address as Holding["address"],
    rawBalance: "2000000000000000000",
    decimals: 18,
    symbol: "UNKNOWN",
    name: "Unknown asset",
    price: null,
    classification: "unknown",
    issues: [],
    ...overrides,
  };
}
function canonicalPt(chainId = 42161): PendleToken {
  return {
    address: state.held as PendleToken["address"],
    chainId,
    type: "PT",
    symbol: "PT-USDai-TEST",
    name: "Canonical principal token",
    decimals: 18,
    priceUsd: 0.95,
    impliedApy: 0.05,
  };
}
function entryPosition(chainId = 42161): PendlePortfolioPosition {
  return {
    chainId,
    ptAddress: state.held as PendlePortfolioPosition["ptAddress"],
    marketAddress: "0x0000000000000000000000000000000000000020",
    ptBalance: "2000000000000000000",
    entryApyPercent: 7,
    valuationUsd: 1.9,
    entryPriceInAsset: 0.9,
    unrealizedPnlUsd: 0.1,
  };
}
function selectUnknown(): void {
  state.held = "0x0000000000000000000000000000000000000021";
  state.indexed = [indexedHolding()];
}
it("discovers an arbitrary indexed ERC-20 with no protocol membership and unavailable valuation", async () => {
  selectUnknown();
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]).toMatchObject({
      address: state.held,
      source: "indexed",
      balanceFormatted: 2,
      valuationAvailable: false,
    });
  });
  expect(result.current.tokenCount).toBe(1);
  expect(result.current.valuationAvailable).toBe(false);
  expect(result.current.isError).toBe(false);
});
it("does not give a fake same-symbol PT a real token's price or yield", async () => {
  selectUnknown();
  state.indexed = [
    indexedHolding(state.held, {
      symbol: "PT-USDai-TEST",
    }),
  ];
  state.pendleTokens = [
    {
      ...canonicalPt(),
      address: "0x0000000000000000000000000000000000000022",
    },
  ];
  state.findYield.mockReturnValue({
    address: state.pendleTokens[0].address,
    source: "pendle",
    apy: 7,
    metadata: {
      ptPriceUsd: 0.95,
    },
  });
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(result.current.tokens[0]).toMatchObject({
    price: 0,
    usdValue: 0,
    valuationAvailable: false,
  });
  expect(result.current.tokens[0].externalYield).toBeUndefined();
});
it("preserves authenticated same-chain PT entry APY and entry metadata over market APY", async () => {
  selectUnknown();
  state.pendleTokens = [canonicalPt()];
  state.portfolioByPt.set(`42161:${state.held}`, entryPosition());
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.externalYield?.apy).toBe(7);
  });
  expect(result.current.tokens[0]).toMatchObject({
    price: 0.95,
    externalYield: {
      fixedApy: 7,
      metadata: {
        entryApyPercent: 7,
        valuationUsd: 1.9,
        unrealizedPnlUsd: 0.1,
      },
    },
  });
});
it("falls back to canonical same-chain PT market APY when no entry APY exists", async () => {
  selectUnknown();
  state.pendleTokens = [canonicalPt()];
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.externalYield?.apy).toBe(5);
  });
  expect(result.current.tokens[0].externalYield?.metadata?.entryApyPercent).toBeUndefined();
  expect(result.current.tokens[0].price).toBe(0.95);
});
it("does not enrich a same-address token from another chain's canonical PT or entry", async () => {
  selectUnknown();
  state.pendleTokens = [canonicalPt(1)];
  state.portfolioByPt.set(`1:${state.held}`, entryPosition(1));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(result.current.tokens[0].price).toBe(0);
  expect(result.current.tokens[0].externalYield).toBeUndefined();
});
it("refreshes entry APY when portfolio data changes without changing token count", async () => {
  selectUnknown();
  state.pendleTokens = [canonicalPt()];
  const { result, rerender } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.externalYield?.apy).toBe(5);
  });
  state.portfolioByPt = new Map([[`42161:${state.held}`, entryPosition()]]);
  rerender({
    chain: 42161,
  });
  await waitFor(() => {
    expect(result.current.tokens[0]?.externalYield?.apy).toBe(7);
  });
});
it("reports failed fallback coverage without inventing holdings after a complete empty scan", async () => {
  state.multicall.mockRejectedValue(new Error("RPC unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.isError).toBe(true);
  expect(result.current.tokens).toEqual([]);
  expect(result.current.unresolvedHoldings).toEqual([]);
  expect(result.current.tokenCount).toBe(0);
});
it("retains positive indexed ownership as unresolved and stale when current RPC fails", async () => {
  selectUnknown();
  state.multicall.mockRejectedValue(new Error("RPC unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.unresolvedHoldings).toEqual([
      {
        address: state.held,
        rawBalance: "2000000000000000000",
        reason: "balance",
      },
    ]);
  });
  expect(result.current.tokenCount).toBe(1);
  expect(result.current.tokens).toEqual([]);
  expect(result.current.isError).toBe(true);
  expect(result.current.valuationAvailable).toBe(false);
  expect(result.current.isDiscoveryIncomplete).toBe(false);
});
it.each([0, 6, 18])("recovers missing decimals through a validated RPC read (%s)", async (decimals) => {
  selectUnknown();
  state.indexed = [
    indexedHolding(state.held, {
      decimals: null,
    }),
  ];
  state.multicall.mockImplementation(async ({ contracts }) => {
    return contracts.map((call: { address: string; functionName: string }) => {
      return {
        status: "success",
        result: call.functionName === "decimals" ? decimals : call.address === state.held ? 2n : 0n,
      };
    });
  });
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.decimals).toBe(decimals);
  });
  expect(result.current.unresolvedHoldings).toEqual([]);
});
it.each([undefined, -1, 256, 1.5, "18"])(
  "retains a raw holding instead of assuming decimals for %s",
  async (decimals) => {
    selectUnknown();
    state.indexed = [
      indexedHolding(state.held, {
        decimals: null,
        name: null,
        symbol: null,
      }),
    ];
    state.multicall.mockImplementation(async ({ contracts }) => {
      return contracts.map((call: { address: string; functionName: string }) => {
        return {
          status: "success",
          result: call.functionName === "decimals" ? decimals : call.address === state.held ? 2n : 0n,
        };
      });
    });
    const { result } = setup();
    await waitFor(() => {
      expect(result.current.unresolvedHoldings).toEqual([
        {
          address: state.held,
          rawBalance: "2",
          reason: "decimals",
        },
      ]);
    });
    expect(result.current.tokens).toEqual([]);
    expect(result.current.isError).toBe(true);
    expect(result.current.isDiscoveryIncomplete).toBe(false);
  },
);
it("keeps native balance and successful ERC-20 reads when another call fails", async () => {
  selectUnknown();
  state.getBalance.mockResolvedValue(10n ** 18n);
  state.multicall.mockImplementation(async ({ contracts }) => {
    return contracts.map((call: { address: string }) => {
      return call.address === state.held
        ? {
            status: "success",
            result: 2n * 10n ** 18n,
          }
        : {
            status: "failure",
            error: new Error("failed"),
          };
    });
  });
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens).toHaveLength(2);
  });
  expect(
    result.current.tokens.map((token) => {
      return token.symbol;
    }),
  ).toContain("ETH");
  expect(result.current.unresolvedHoldings).toEqual([]);
  expect(result.current.isError).toBe(true);
});
it("refreshes indexed discovery and isolates a new account", async () => {
  selectUnknown();
  const { result, rerender } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  const previous = state.account;
  state.account = "0x0000000000000000000000000000000000000030";
  state.held = "0x0000000000000000000000000000000000000031";
  state.indexed = [indexedHolding()];
  rerender({
    chain: 42161,
  });
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(result.current.visibilityScope).not.toContain(previous);
  state.held = "0x0000000000000000000000000000000000000032";
  state.indexed = [indexedHolding()];
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(state.fetchHoldings).toHaveBeenCalledWith(42161, state.account, expect.any(AbortSignal));
});
it("reports an incomplete empty indexed scan and recovers on retry", async () => {
  state.held = "0x0000000000000000000000000000000000000031";
  state.fetchHoldings.mockResolvedValueOnce({
    chainId: 42161,
    owner: state.account,
    holdings: [],
    enumerationComplete: false,
    issues: [
      {
        kind: "enumeration",
        code: "partial",
      },
    ],
  });
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.tokens).toEqual([]);
  expect(result.current.isError).toBe(true);
  expect(result.current.isDiscoveryIncomplete).toBe(true);
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => {
    expect(result.current.isError).toBe(false);
    expect(result.current.isDiscoveryIncomplete).toBe(false);
  });
});
it("keeps complete indexed discovery separate from failed protocol enrichment", async () => {
  state.fetchMarkets.mockRejectedValue(new Error("Morpho unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
  });
  expect(result.current.isDiscoveryIncomplete).toBe(false);
});
it("reports a failed indexed fetch as incomplete discovery", async () => {
  state.fetchHoldings.mockRejectedValue(new Error("Provider unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.isDiscoveryIncomplete).toBe(true);
  });
  expect(result.current.isError).toBe(true);
});
it("does not report discovery failure while the first indexed request is pending", async () => {
  state.fetchHoldings.mockImplementation(() => {
    return new Promise(() => {});
  });
  const { result } = setup();
  await waitFor(() => {
    expect(state.fetchHoldings).toHaveBeenCalled();
  });
  expect(result.current.isLoading).toBe(true);
  expect(result.current.isDiscoveryIncomplete).toBe(false);
});
it("shows held Arbitrum USDAI even when protocol discovery is empty", async () => {
  const { result } = setup();
  await waitFor(() => {
    return expect(result.current.tokens).toEqual([
      expect.objectContaining({
        address: state.held,
        symbol: "USDai",
        balanceFormatted: 2,
        source: "major",
      }),
    ]);
  });
});
it("checks trusted discovered tokens even when their supply is zero", async () => {
  state.held = "0x0000000000000000000000000000000000000002";
  state.markets = [discovered(state.held)];
  const { result } = setup();
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(state.fetchMarkets).toHaveBeenCalledWith(42161, {
    walletDiscovery: true,
  });
});
it("refreshes a same-size token replacement, metadata and prices", async () => {
  const first = "0x0000000000000000000000000000000000000002";
  const second = "0x0000000000000000000000000000000000000003";
  state.held = first;
  state.markets = [discovered(first)];
  const { client, result, rerender } = setup();
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(first);
  });
  state.held = second;
  state.markets = [discovered(second)];
  await act(async () => {
    client.setQueryData(["wallet-morpho-markets", 42161], state.markets);
  });
  rerender({
    chain: 42161,
  });
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(second);
  });
  await act(async () => {
    client.setQueryData(["wallet-morpho-markets", 42161], [discovered(second, 3, 0)]);
  });
  await waitFor(() => {
    return expect(result.current.tokens[0]?.decimals).toBe(0);
  });
  expect(result.current.tokens[0].price).toBe(3);
});
it("refreshes an address price when the price collection size is unchanged", async () => {
  const { result, rerender } = setup();
  state.prices = {
    [state.held]: 1,
  };
  rerender({
    chain: 42161,
  });
  await waitFor(() => {
    return expect(result.current.totalValue).toBe(2);
  });
  state.prices = {
    [state.held]: 1.5,
  };
  rerender({
    chain: 42161,
  });
  await waitFor(() => {
    return expect(result.current.totalValue).toBe(3);
  });
});
it("isolates chain changes and rejects malformed discovered addresses", async () => {
  state.markets = [discovered("bad-address")];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { result, rerender } = setup();
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  rerender({
    chain: 8453,
  });
  await waitFor(() => {
    return expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.tokens).toEqual([]);
  for (const [call] of state.multicall.mock.calls) {
    expect(
      call.contracts.some((contract: { address: string }) => {
        return contract.address === "bad-address";
      }),
    ).toBe(false);
  }
});
it("does not fetch balances for a disconnected wallet", async () => {
  state.account = undefined;
  const { result } = setup();
  await waitFor(() => {
    return expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.tokens).toEqual([]);
  expect(state.multicall).not.toHaveBeenCalled();
});
it("refreshes discovery along with balances on a wallet refresh", async () => {
  const { result } = setup();
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  state.held = "0x0000000000000000000000000000000000000002";
  state.markets = [discovered(state.held)];
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(state.fetchMarkets).toHaveBeenCalledTimes(2);
});
it("exposes discovery errors while retaining the fixed whitelist", async () => {
  state.fetchMarkets.mockRejectedValue(new Error("Discovery unavailable"));
  const { result } = setup();
  await waitFor(() => {
    return expect(result.current.error?.message).toBe("Discovery unavailable");
  });
  expect(result.current.isError).toBe(true);
  await waitFor(() => {
    return expect(result.current.tokens[0]?.address).toBe(state.held);
  });
});
it.each([null, 0])(
  "uses market fallback only for a missing entry rate, preserving entry zero (%s)",
  async (entryApyPercent) => {
    selectUnknown();
    state.pendleTokens = [canonicalPt()];
    state.portfolioByPt.set(`42161:${state.held}`, {
      ...entryPosition(),
      entryApyPercent,
    });
    const { result } = setup();
    await waitFor(() => {
      expect(result.current.tokens[0]?.externalYield?.apy).toBe(entryApyPercent ?? 5);
    });
  },
);
it("ignores portfolio metadata whose chain disagrees with its lookup key", async () => {
  selectUnknown();
  state.pendleTokens = [canonicalPt()];
  state.portfolioByPt.set(`42161:${state.held}`, entryPosition(1));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.externalYield?.apy).toBe(5);
  });
  expect(result.current.tokens[0].externalYield?.metadata?.entryApyPercent).toBeUndefined();
});
it("keeps native-only balances visible with explicit unsupported indexed coverage", async () => {
  state.held = "0x0000000000000000000000000000000000000031";
  state.getBalance.mockResolvedValue(10n ** 18n);
  state.fetchHoldings.mockResolvedValue({
    chainId: 9745,
    owner: state.account,
    holdings: [],
    enumerationComplete: false,
    issues: [
      {
        kind: "enumeration",
        code: "unsupported",
      },
    ],
  });
  const { result } = setup(9745);
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.tokens).toHaveLength(1);
  expect(result.current.isError).toBe(true);
  expect(result.current.tokenCount).toBe(1);
});
it("retains successful ERC-20 reads when the independent native read fails", async () => {
  selectUnknown();
  state.getBalance.mockRejectedValue(new Error("native unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(result.current.isError).toBe(true);
});
it("does not invent ownership from an indexed zero balance when fallback reads fail", async () => {
  selectUnknown();
  state.indexed = [
    indexedHolding(state.held, {
      rawBalance: "0",
    }),
  ];
  state.multicall.mockRejectedValue(new Error("RPC unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });
  expect(result.current.unresolvedHoldings).toEqual([]);
  expect(result.current.tokenCount).toBe(0);
  expect(result.current.isError).toBe(true);
});

it("excludes Aave receipt addresses without hiding underlying tokens or same-symbol tokens", async () => {
  const receipt = "0x00000000000000000000000000000000000000ab";
  const lookalike = "0x00000000000000000000000000000000000000cd";
  state.aaveReceipts = [receipt.toUpperCase().replace("0X", "0x")];
  state.indexed = [
    indexedHolding(receipt, {
      symbol: "aArbUSDai",
    }),
    indexedHolding(lookalike, {
      symbol: "aArbUSDai",
    }),
  ];
  state.multicall.mockImplementation(async ({ contracts }) => {
    return contracts.map((call: { address: string }) => {
      const isHeld = [state.held, receipt, lookalike].includes(call.address);
      return {
        status: "success",
        result: isHeld ? 10n ** 18n : 0n,
      };
    });
  });
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens.map((token) => token.address).sort()).toEqual([state.held, lookalike].sort());
  });
  expect(result.current.tokens.find((token) => token.address === state.held)?.symbol).toBe("USDai");
  expect(result.current.tokens.find((token) => token.address === lookalike)?.symbol).toBe("aArbUSDai");
});
it("keeps holdings visible when Aave receipt lookup is unavailable", async () => {
  selectUnknown();
  state.readContract.mockRejectedValue(new Error("Aave metadata unavailable"));
  const { result } = setup();
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(result.current.isDiscoveryIncomplete).toBe(false);
});
it("scopes Aave receipt exclusion to its chain", async () => {
  selectUnknown();
  state.aaveReceipts = [state.held];
  const { result, rerender } = setup();
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tokens).toEqual([]);
  });
  state.aaveReceipts = [];
  rerender({
    chain: 8453,
  });
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
});
it("does not request Aave metadata on a chain without a configured provider", async () => {
  selectUnknown();
  const { result } = setup(130);
  await waitFor(() => {
    expect(result.current.tokens[0]?.address).toBe(state.held);
  });
  expect(state.readContract).not.toHaveBeenCalledWith(expect.objectContaining({
    functionName: "getPoolDataProvider",
  }));
});

it("excludes registered Compound receipts and retains COMP and same-symbol holdings", async () => {
  const receipt = "0x00000000000000000000000000000000000000ab";
  const comp = "0x00000000000000000000000000000000000000cd";
  const lookalike = "0x00000000000000000000000000000000000000ef";
  state.compoundReceipts = [receipt.toUpperCase().replace("0X", "0x")];
  state.indexed = [
    indexedHolding(receipt, {
      symbol: "cUSDCv3",
    }),
    indexedHolding(comp, {
      symbol: "COMP",
    }),
    indexedHolding(lookalike, {
      symbol: "cUSDCv3",
    }),
  ];
  state.multicall.mockImplementation(async ({ contracts }) => {
    return contracts.map((call: { address: string }) => {
      const isHeld = [state.held, receipt, comp, lookalike].includes(call.address);
      return {
        status: "success",
        result: isHeld ? 10n ** 18n : 0n,
      };
    });
  });
  const { result } = setup();
  await waitFor(() => {
    const addresses = result.current.tokens.map((token) => {
      return token.address;
    });
    expect(addresses.sort()).toEqual([state.held, comp, lookalike].sort());
  });
  expect(result.current.tokens.find((token) => token.address === comp)?.symbol).toBe("COMP");
});
