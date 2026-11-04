// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../../../app/api/morpho/[chainId]/markets/route";
const fetchMock = vi.fn();
const asset = {
  address: "0x0000000000000000000000000000000000000001",
  symbol: "USDai",
  decimals: 18,
  price: {
    usd: 1,
  },
};
const market = {
  marketId: "usdai-market",
  listed: true,
  collateralAsset: asset,
  loanAsset: {
    ...asset,
    symbol: "USDC",
    decimals: 6,
  },
  warnings: [],
  state: {
    supplyAssetsUsd: 0,
    liquidityAssetsUsd: 0,
    utilization: 1,
    supplyApy: 0.01,
    borrowApy: 0.02,
  },
};
async function request(query = "walletDiscovery=true") {
  return GET(new NextRequest(`http://localhost/api/morpho/42161/markets?${query}`), {
    params: Promise.resolve({
      chainId: "42161",
    }),
  });
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("discovers trusted USDAI despite empty liquidity and full utilization while display filters still hide it", async () => {
  fetchMock.mockImplementation((_url, init) => {
    const vars = JSON.parse(init.body).variables;
    const items = vars.listed && vars.minSupplyUsd === 0 && vars.utilizationMax === 1 ? [market] : [];
    return Promise.resolve(
      Response.json({
        data: {
          markets: {
            items,
          },
        },
      }),
    );
  });
  const normal = await request("curation=curated&hideSaturated=true");
  expect((await normal.json()).markets.items).toEqual([]);
  const wallet = await request();
  expect(wallet.status).toBe(200);
  expect((await wallet.json()).markets.items).toEqual([
    expect.objectContaining({
      uniqueKey: "usdai-market",
      collateralAsset: expect.objectContaining({
        symbol: "USDai",
        priceUsd: 1,
      }),
    }),
  ]);
});
it("retains spam, trust, warning and extreme APY exclusions even if display overrides are supplied", async () => {
  const unlisted = {
    ...market,
    listed: false,
  };
  const trusted = {
    ...unlisted,
    marketId: "trusted-vault",
    supplyingVaults: [
      {
        listed: true,
        state: {
          totalAssetsUsd: 20000,
        },
      },
    ],
  };
  fetchMock.mockImplementation((_url, init) => {
    const { listed } = JSON.parse(init.body).variables;
    const items = listed
      ? []
      : [
          trusted,
          {
            ...unlisted,
            marketId: "untrusted",
          },
          {
            ...trusted,
            marketId: "spam",
            collateralAsset: {
              ...asset,
              symbol: "GMORPHO",
            },
          },
          {
            ...trusted,
            marketId: "red",
            warnings: [
              {
                level: "RED",
              },
            ],
          },
          {
            ...trusted,
            marketId: "high",
            warnings: [
              {
                level: "HIGH",
              },
            ],
          },
          {
            ...trusted,
            marketId: "apy",
            state: {
              ...market.state,
              supplyApy: 20,
            },
          },
        ];
    return Promise.resolve(
      Response.json({
        data: {
          markets: {
            items,
          },
        },
      }),
    );
  });
  const response = await request("walletDiscovery=true&curation=all&search=USDai&showLowLiquidity=true");
  expect(
    (await response.json()).markets.items.map((item: { uniqueKey: string }) => {
      return item.uniqueKey;
    }),
  ).toEqual(["trusted-vault"]);
  for (const [, init] of fetchMock.mock.calls) {
    expect(JSON.parse(init.body).variables.search).toBeUndefined();
  }
});
it("paginates beyond the display target and still visits trusted non-listed markets", async () => {
  fetchMock.mockImplementation((_url, init) => {
    const { listed, skip } = JSON.parse(init.body).variables;
    const items =
      listed && skip === 0
        ? Array.from(
            {
              length: 200,
            },
            (_, i) => {
              return {
                ...market,
                marketId: `listed-${i}`,
              };
            },
          )
        : listed
          ? []
          : [
              {
                ...market,
                listed: false,
                marketId: "vault-backed",
                supplyingVaults: [
                  {
                    listed: true,
                    state: {
                      totalAssetsUsd: 20000,
                    },
                  },
                ],
                collateralAsset: {
                  ...asset,
                  symbol: "PT-USDai",
                },
              },
            ];
    return Promise.resolve(
      Response.json({
        data: {
          markets: {
            items,
          },
        },
      }),
    );
  });
  const response = await request("walletDiscovery=true&first=1");
  expect((await response.json()).markets.items).toHaveLength(201);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("reports truncated discovery rather than returning a successful partial whitelist", async () => {
  fetchMock.mockImplementation(async () => {
    return Response.json({
      data: {
        markets: {
          items: Array.from(
            {
              length: 200,
            },
            () => {
              return market;
            },
          ),
        },
      },
    });
  });
  expect((await request()).status).toBe(502);
});
it.each(["http", "graphql"])("reports %s dependency failures", async (kind) => {
  fetchMock.mockResolvedValue(
    kind === "http"
      ? Response.json(
          {},
          {
            status: 502,
          },
        )
      : Response.json({
          errors: [
            {
              message: "Unavailable",
            },
          ],
        }),
  );
  expect((await request()).status).toBe(502);
});
it("accepts a successful empty discovery", async () => {
  fetchMock.mockImplementation(async () => {
    return Response.json({
      data: {
        markets: {
          items: [],
        },
      },
    });
  });
  const response = await request();
  expect(response.status).toBe(200);
  expect((await response.json()).markets.items).toEqual([]);
});
function mockMarketCategories(listedMarkets: unknown[], unlistedMarkets: unknown[]) {
  fetchMock.mockImplementation(async (_url, init) => {
    const { listed } = JSON.parse(init.body).variables;
    return Response.json({
      data: {
        markets: {
          items: listed ? listedMarkets : unlistedMarkets,
        },
      },
    });
  });
}
it.each(["PT-FAKE", "YT-FAKE", "PTFAKE", "YTFAKE"])(
  "does not trust an empty unlisted market because either asset has the %s prefix",
  async (symbol) => {
    const fake = {
      ...asset,
      address: "0x0000000000000000000000000000000000000002",
      symbol,
    };
    const spoofed = {
      ...market,
      listed: false,
      marketId: "spoof-collateral",
      collateralAsset: fake,
    };
    mockMarketCategories(
      [],
      [
        spoofed,
        {
          ...spoofed,
          marketId: "spoof-loan",
          collateralAsset: asset,
          loanAsset: fake,
        },
      ],
    );
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).markets.items).toEqual([]);
  },
);
it("requires evidence on each market rather than trusting a shared collateral and its arbitrary loan counterpart", async () => {
  const knownPt = {
    ...asset,
    symbol: "PT-USDai",
  };
  const listedMarket = {
    ...market,
    marketId: "listed-pt",
    collateralAsset: knownPt,
  };
  const arbitraryLoan = {
    ...asset,
    address: "0x0000000000000000000000000000000000000003",
    symbol: "SCAM",
  };
  mockMarketCategories(
    [listedMarket],
    [
      {
        ...market,
        marketId: "untrusted-counterpart",
        listed: false,
        collateralAsset: knownPt,
        loanAsset: arbitraryLoan,
      },
    ],
  );
  const response = await request();
  const items = (await response.json()).markets.items;
  expect(
    items.map((item: { uniqueKey: string }) => {
      return item.uniqueKey;
    }),
  ).toEqual(["listed-pt"]);
  expect(
    items.some(
      (item: {
        loanAsset: {
          address: string;
        };
      }) => {
        return item.loanAsset.address === arbitraryLoan.address;
      },
    ),
  ).toBe(false);
});
it("checks actual evidence even for responses from the listed query", async () => {
  mockMarketCategories(
    [
      {
        ...market,
        listed: "false",
        collateralAsset: {
          ...asset,
          symbol: "PT-FAKE",
        },
      },
    ],
    [],
  );
  expect((await (await request()).json()).markets.items).toEqual([]);
});
it.each([9999, 10000, 10001])("requires more than $10k in a listed supplying vault (%s)", async (totalAssetsUsd) => {
  const vaultMarket = {
    ...market,
    listed: false,
    supplyingVaults: [
      {
        listed: true,
        state: {
          totalAssetsUsd,
        },
      },
    ],
  };
  mockMarketCategories([], [vaultMarket]);
  const items = (await (await request()).json()).markets.items;
  expect(items).toHaveLength(totalAssetsUsd > 10000 ? 1 : 0);
});
it("retains the separate market-browser PT policy", async () => {
  mockMarketCategories(
    [],
    [
      {
        ...market,
        listed: false,
        collateralAsset: {
          ...asset,
          symbol: "PT-USDai",
        },
      },
    ],
  );
  const response = await request("showLowLiquidity=true");
  expect((await response.json()).markets.items).toHaveLength(1);
});
