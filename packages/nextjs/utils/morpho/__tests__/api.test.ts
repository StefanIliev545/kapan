// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getMarkets } from "../../../app/api/morpho/[chainId]/markets/route";
import { GET as getPositions } from "../../../app/api/morpho/[chainId]/positions-onchain/route";

const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("viem", async importOriginal => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({ readContract }),
}));
vi.mock("~~/contracts/deployedContracts", () => ({
  default: {
    8453: {
      MorphoBlueGatewayView: {
        address: "0x0000000000000000000000000000000000000001",
        abi: [],
      },
    },
  },
}));

const fetchMock = vi.fn();
const marketId = `0x${"ab".repeat(32)}`;
const address = "0x0000000000000000000000000000000000000000";
const market = {
  marketId,
  listed: true,
  collateralAsset: {
    address,
    symbol: "COL",
    decimals: 18,
    price: { usd: 2 },
  },
  loanAsset: {
    address,
    symbol: "USD",
    decimals: 6,
    price: { usd: 1 },
  },
  oracle: { address },
  irmAddress: address,
  lltv: "860000000000000000",
  state: {
    supplyAssets: 100,
    borrowAssets: 10,
    utilization: 0.1,
    supplyApy: 0.01,
    borrowApy: 0.02,
    liquidityAssetsUsd: 10000,
  },
};

const indexedPosition = {
  market,
  healthFactor: 2,
  state: {
    supplyShares: "0",
    supplyAssets: "0",
    borrowShares: "123",
    borrowAssets: "1000000",
    collateral: "2000000000000000000",
  },
};

const run = (kind: "markets" | "positions-onchain") => {
  const query = kind === "markets" ? "curation=all&first=1" : `user=${address}`;
  const handler = kind === "markets" ? getMarkets : getPositions;
  return handler(new NextRequest(`http://localhost/api/morpho/8453/${kind}?${query}`), {
    params: Promise.resolve({ chainId: "8453" }),
  });
};

const mockDiscovery = (markets: unknown[] = [], positions: unknown[] = []) => {
  fetchMock.mockImplementation((_url, init) => {
    const query = JSON.parse(init.body).query as string;
    const collection = query.includes("query GetUserPositions") ? "marketPositions" : "markets";
    return Promise.resolve(
      Response.json({ data: { [collection]: { items: collection === "markets" ? markets : positions } } }),
    );
  });
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  readContract.mockReset();
  readContract.mockRejectedValue(new Error("RPC unavailable"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Morpho API schema compatibility", () => {
  it.each([2, 0, null, undefined])("normalizes price %s in market and position boundaries", async usd => {
    const asset = {
      ...market.loanAsset,
      price: usd === undefined ? undefined : usd === null ? null : { usd },
    };
    const input = {
      ...market,
      collateralAsset: null,
      loanAsset: asset,
    };
    mockDiscovery(
      [input],
      [
        {
          ...indexedPosition,
          market: input,
        },
      ],
    );
    const markets = await (await run("markets")).json();
    const positions = await (await run("positions-onchain")).json();
    for (const normalized of [markets.markets.items[0], positions.userByAddress.marketPositions[0].market]) {
      expect(normalized.uniqueKey).toBe(marketId);
      expect(normalized.collateralAsset).toBeNull();
      expect(normalized.loanAsset).toEqual({
        address,
        symbol: "USD",
        decimals: 6,
        priceUsd: usd ?? null,
      });
    }
    expect(positions.userByAddress.marketPositions[0]).toMatchObject({
      borrowShares: "123",
      borrowAssets: 1000000,
      healthFactor: 2,
    });
    for (const [, init] of fetchMock.mock.calls) {
      const query = JSON.parse(init.body).query as string;
      expect(query).not.toMatch(/\bpriceUsd\b/);
      expect(query).toMatch(/price\s*\{\s*usd\s*\}/);
    }
  });
  it("preserves nonzero GraphQL positions when the RPC read fails", async () => {
    mockDiscovery([market], [indexedPosition]);
    const response = await run("positions-onchain");
    expect(response.status).toBe(200);
    expect(readContract).toHaveBeenCalledOnce();
    expect((await response.json()).userByAddress.marketPositions[0]).toMatchObject({
      collateral: 2e18,
      borrowAssets: 1000000,
    });
  });
  it("preserves on-chain recovery when indexed positions are empty", async () => {
    mockDiscovery([market], []);
    readContract.mockResolvedValue([
      {
        marketId,
        collateralBalance: 2n * 10n ** 18n,
        borrowBalance: 1000000n,
        supplyBalance: 0n,
        healthFactor: 2n * 10n ** 18n,
      },
    ]);
    const response = await run("positions-onchain");
    expect(response.status).toBe(200);
    expect((await response.json()).userByAddress.marketPositions[0]).toMatchObject({
      collateral: 2e18,
      borrowAssets: 1000000,
      healthFactor: 2,
    });
  });
  it("keeps successful empty discovery distinct from failure", async () => {
    mockDiscovery();
    const positions = await run("positions-onchain");
    expect(positions.status).toBe(200);
    expect((await positions.json()).userByAddress.marketPositions).toEqual([]);
    expect(readContract).not.toHaveBeenCalled();
    const markets = await run("markets");
    expect(markets.status).toBe(200);
    expect((await markets.json()).markets.items).toEqual([]);
  });
});

describe("Morpho upstream failure handling", () => {
  it.each(["http", "graphql", "invalid-items", "missing-data", "invalid-json", "transport"])(
    "does not turn %s failures into empty collections",
    async failure => {
      fetchMock.mockImplementation(() => {
        if (failure === "transport") {
          return Promise.reject(new Error("network unavailable"));
        }
        if (failure === "http") {
          return Promise.resolve(Response.json({}, { status: 400 }));
        }
        if (failure === "graphql") {
          return Promise.resolve(Response.json({ errors: [{ message: "Cannot query field priceUsd" }] }));
        }
        if (failure === "invalid-json") {
          return Promise.resolve(new Response("not json"));
        }
        if (failure === "invalid-items") {
          return Promise.resolve(
            Response.json({
              data: {
                markets: { items: {} },
                marketPositions: { items: {} },
              },
            }),
          );
        }
        return Promise.resolve(Response.json({ data: {} }));
      });
      for (const route of ["markets", "positions-onchain"] as const) {
        const response = await run(route);
        expect(response.status).toBe(502);
        expect(await response.json()).toHaveProperty("error");
      }
      expect(readContract).not.toHaveBeenCalled();
    },
  );
  it.each(["markets", "marketPositions"])("rejects incomplete discovery when only %s fails", async failed => {
    fetchMock.mockImplementation((_url, init) => {
      const collection = JSON.parse(init.body).query.includes("query GetUserPositions") ? "marketPositions" : "markets";
      return Promise.resolve(
        collection === failed
          ? Response.json({}, { status: 503 })
          : Response.json({ data: { [collection]: { items: [] } } }),
      );
    });
    expect((await run("positions-onchain")).status).toBe(502);
    expect(readContract).not.toHaveBeenCalled();
  });
});

it("keeps recovered unindexed positions when a later RPC batch fails", async () => {
  const markets = Array.from({ length: 101 }, (_, index) => ({
    ...market,
    marketId: `0x${(index + 1).toString(16).padStart(64, "0")}`,
  }));
  mockDiscovery(markets, []);
  readContract.mockResolvedValueOnce([{
    marketId: markets[0].marketId,
    collateralBalance: 2n * 10n ** 18n,
    borrowBalance: 1000000n,
    supplyBalance: 0n,
    healthFactor: 2n * 10n ** 18n,
  }]).mockRejectedValueOnce(new Error("Second batch unavailable"));

  const response = await run("positions-onchain");

  expect(readContract).toHaveBeenCalledTimes(2);
  expect(response.status).toBe(200);
  expect((await response.json()).userByAddress.marketPositions).toMatchObject([{
    market: {
      uniqueKey: markets[0].marketId,
    },
    collateral: 2e18,
    borrowAssets: 1000000,
  }]);
});
