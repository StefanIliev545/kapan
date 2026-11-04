// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchHoldings, rawBalance, validDecimals } from "../holdings";
import { scanHoldings } from "../holdings.server";
const owner = "0x0000000000000000000000000000000000000010";
const address = "0x00000000000000000000000000000000000000ab";
const fetchMock = vi.fn();
function record(overrides: Record<string, unknown> = {}) {
  return {
    address: owner,
    network: "arb-mainnet",
    tokenAddress: address,
    tokenBalance: "0x02",
    tokenMetadata: {
      name: "Unknown asset",
      symbol: "UNKNOWN",
      decimals: 0,
    },
    tokenPrices: [],
    ...overrides,
  };
}
function page(tokens: unknown[] = [], pageKey?: string, extra: Record<string, unknown> = {}) {
  return Response.json({
    data: {
      tokens,
      ...(pageKey
        ? {
            pageKey,
          }
        : {}),
      ...extra,
    },
  });
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("follows pages and deduplicates contract casing without protocol membership", async () => {
  fetchMock.mockResolvedValueOnce(page([record()], "next"));
  fetchMock.mockResolvedValueOnce(
    page([
      record({
        tokenAddress: address.toUpperCase().replace("0X", "0x"),
      }),
      record({
        tokenAddress: "0x00000000000000000000000000000000000000ac",
      }),
    ]),
  );
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(scan.enumerationComplete).toBe(true);
  expect(scan.holdings).toHaveLength(2);
  expect(scan.holdings[0]).toMatchObject({
    address,
    rawBalance: "2",
    decimals: 0,
    classification: "unknown",
    price: null,
  });
  const body = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(body).toMatchObject({
    addresses: [
      {
        address: owner,
        networks: ["arb-mainnet"],
      },
    ],
    pageKey: "next",
    includeNativeTokens: false,
    includeErc20Tokens: true,
  });
});
it("retains holdings through per-token metadata/pricing errors without inventing decimals", async () => {
  fetchMock.mockResolvedValue(
    page([
      record({
        tokenMetadata: null,
        error: {
          message: "metadata failed",
        },
        tokenPrices: [
          {
            error: "no price",
          },
        ],
      }),
    ]),
  );
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(scan.enumerationComplete).toBe(true);
  expect(scan.holdings[0]).toMatchObject({
    address,
    rawBalance: "2",
    decimals: null,
    name: null,
    symbol: null,
    price: null,
    classification: "unknown",
  });
  expect(
    scan.holdings[0].issues.map((issue) => {
      return issue.kind;
    }),
  ).toEqual(["metadata", "price"]);
});
it.each(["top", "data"])(
  "detects HTTP-200 network partialErrors at %s while retaining valid holdings",
  async (where) => {
    const partialErrors = [
      {
        network: "arb-mainnet",
        message: "unsupported fixture network",
      },
    ];
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          tokens: [record()],
          ...(where === "data"
            ? {
                partialErrors,
              }
            : {}),
        },
        ...(where === "top"
          ? {
              partialErrors,
            }
          : {}),
      }),
    );
    const scan = await scanHoldings(42161, owner, "fixture-key");
    expect(scan.enumerationComplete).toBe(false);
    expect(scan.holdings).toHaveLength(1);
    expect(scan.issues).toContainEqual({
      kind: "enumeration",
      code: "partial",
    });
  },
);
it("preserves earlier pages and sanitizes provider/network failures", async () => {
  fetchMock.mockResolvedValueOnce(page([record()], "next"));
  fetchMock.mockRejectedValueOnce(new Error("https://provider/secret-fixture-key"));
  const scan = await scanHoldings(42161, owner, "secret-fixture-key");
  expect(scan.enumerationComplete).toBe(false);
  expect(scan.holdings).toHaveLength(1);
  expect(JSON.stringify(scan)).not.toMatch(/secret-fixture-key|https:/);
});
it.each([401, 429, 500])("reports HTTP %s as incomplete", async (status) => {
  fetchMock.mockResolvedValue(
    new Response("private provider error", {
      status,
    }),
  );
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(scan.enumerationComplete).toBe(false);
  expect(scan.issues).toEqual([
    {
      kind: "enumeration",
      code: "unavailable",
    },
  ]);
});
it.each([9745, 31337])("reports unsupported chain %s without calling the provider", async (chainId) => {
  const scan = await scanHoldings(chainId, owner, "fixture-key");
  expect(scan.enumerationComplete).toBe(false);
  expect(scan.issues).toEqual([
    {
      kind: "enumeration",
      code: "unsupported",
    },
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  [1, "eth-mainnet"],
  [42161, "arb-mainnet"],
  [8453, "base-mainnet"],
  [10, "opt-mainnet"],
  [59144, "linea-mainnet"],
  [130, "unichain-mainnet"],
] as const)("requests the explicit indexed network for chain %s", async (chainId, network) => {
  fetchMock.mockResolvedValue(page());
  expect((await scanHoldings(chainId, owner, "fixture-key")).enumerationComplete).toBe(true);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).addresses[0].networks).toEqual([network]);
});
it("stops repeated cursors and preserves the preceding records", async () => {
  fetchMock.mockImplementation(async () => {
    return page([record()], "same");
  });
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(scan.holdings).toHaveLength(1);
  expect(scan.issues).toContainEqual({
    kind: "enumeration",
    code: "pagination",
  });
});
it("caps unexhausted pagination at 20 pages", async () => {
  fetchMock.mockImplementation(async () => {
    return page([record()], `page-${fetchMock.mock.calls.length}`);
  });
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(fetchMock).toHaveBeenCalledTimes(20);
  expect(scan.enumerationComplete).toBe(false);
  expect(scan.holdings).toHaveLength(1);
});
it("rejects malformed cursors, pages and foreign owner/network records explicitly", async () => {
  fetchMock.mockResolvedValueOnce(page([record()], "next"));
  fetchMock.mockResolvedValueOnce(
    Response.json({
      data: {
        tokens: "bad",
      },
    }),
  );
  const malformed = await scanHoldings(42161, owner, "fixture-key");
  expect(malformed.holdings).toHaveLength(1);
  expect(malformed.enumerationComplete).toBe(false);
  fetchMock.mockResolvedValue(
    page(
      [
        record({
          address: address,
        }),
        record({
          network: "eth-mainnet",
        }),
        record({
          tokenAddress: "bad",
        }),
      ],
      undefined,
      {
        pageKey: 4,
      },
    ),
  );
  const foreign = await scanHoldings(42161, owner, "fixture-key");
  expect(foreign.holdings).toEqual([]);
  expect(foreign.enumerationComplete).toBe(false);
});
it("marks conflicting duplicates incomplete instead of summing balances", async () => {
  fetchMock.mockResolvedValue(
    page([
      record(),
      record({
        tokenBalance: "3",
      }),
    ]),
  );
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(scan.holdings).toHaveLength(1);
  expect(scan.holdings[0].rawBalance).toBe("2");
  expect(scan.enumerationComplete).toBe(false);
});
it("aborts on cancellation rather than returning a complete cached scan", async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation(async () => {
    controller.abort();
    return page([record()]);
  });
  await expect(scanHoldings(42161, owner, "fixture-key", controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("times out a page and preserves earlier pages", async () => {
  vi.useFakeTimers();
  fetchMock.mockResolvedValueOnce(page([record()], "next"));
  fetchMock.mockImplementationOnce((_url, init) => {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener(
        "abort",
        () => {
          reject(new Error("aborted"));
        },
        {
          once: true,
        },
      );
    });
  });
  const pending = scanHoldings(42161, owner, "fixture-key");
  await vi.advanceTimersByTimeAsync(10001);
  const scan = await pending;
  expect(scan.holdings).toHaveLength(1);
  expect(scan.enumerationComplete).toBe(false);
  expect(scan.issues).toContainEqual({
    kind: "enumeration",
    code: "timeout",
  });
});
it("enforces the overall scan deadline independently of page count", async () => {
  const now = vi.spyOn(Date, "now");
  now.mockReturnValue(0);
  fetchMock.mockImplementation(async () => {
    now.mockReturnValue(fetchMock.mock.calls.length * 9000);
    return page([record()], `next-${fetchMock.mock.calls.length}`);
  });
  const scan = await scanHoldings(42161, owner, "fixture-key");
  expect(fetchMock.mock.calls.length).toBeLessThan(20);
  expect(scan.holdings).toHaveLength(1);
  expect(scan.issues).toContainEqual({
    kind: "enumeration",
    code: "timeout",
  });
});
it("validates balance integers and uint8 decimals without silent defaults", () => {
  expect(rawBalance("0xff")).toBe("255");
  expect(rawBalance((2n ** 256n).toString())).toBeNull();
  expect(rawBalance("-1")).toBeNull();
  expect(rawBalance("1.5")).toBeNull();
  expect(validDecimals(0)).toBe(true);
  expect(validDecimals(255)).toBe(true);
  expect(validDecimals("18")).toBe(false);
});
it("client rejects a scan for another account/chain and malformed holding metadata", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      chainId: 1,
      owner,
      holdings: [],
      enumerationComplete: true,
      issues: [],
    }),
  );
  expect((await fetchHoldings(42161, owner)).enumerationComplete).toBe(false);
  fetchMock.mockResolvedValue(
    Response.json({
      chainId: 42161,
      owner,
      holdings: [null],
      enumerationComplete: true,
      issues: [],
    }),
  );
  expect((await fetchHoldings(42161, owner)).issues[0].code).toBe("malformed");
});
it("client propagates cancellation and sanitizes failed requests", async () => {
  const controller = new AbortController();
  controller.abort();
  fetchMock.mockRejectedValue(new Error("provider-secret"));
  await expect(fetchHoldings(42161, owner, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  const failed = await fetchHoldings(42161, owner);
  expect(failed.enumerationComplete).toBe(false);
  expect(JSON.stringify(failed)).not.toContain("provider-secret");
});
