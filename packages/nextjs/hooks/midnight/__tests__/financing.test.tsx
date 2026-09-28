import { useMidnightFinancing } from "../useMidnightFinancing";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "~~/utils/midnight/__tests__/live-base-fixture.json";
import { type MidnightQuote, bookSchema, quoteSchema } from "~~/utils/midnight/types";

const mocks = vi.hoisted(() => ({
  quote: undefined as unknown,
  ready: true,
  health: 1.5,
  fetching: false,
  markets: [] as unknown[],
}));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: "0x0000000000000000000000000000000000000001" }) }));
vi.mock("../useMidnight", () => ({
  useMidnightMarkets: () => ({ data: mocks.markets }),
  useMidnightQuote: () => ({ data: mocks.quote, isFetching: mocks.fetching }),
  useMidnightGateway: () => ({ ready: mocks.ready }),
  useMidnightRisk: () => ({ data: { healthFactor: mocks.health }, isFetching: false }),
}));
const market = bookSchema.parse(fixture.market),
  now = 1790515500;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  mocks.markets = [market];
  mocks.quote = {
    ...quoteSchema.parse(fixture.quote),
    market,
    assets: "1000000",
    fetchedAt: now,
    settlementFee: "0",
    consumed: fixture.quote.takeable_offers.map(() => "0"),
  } satisfies MidnightQuote;
  mocks.ready = true;
  mocks.health = 1.5;
  mocks.fetching = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function params() {
  return {
    chainId: 8453,
    loan: market.loan_token,
    assets: 1000000n,
    collaterals: [{ address: market.collaterals[0].token, amount: 1000n }],
    enabled: true,
  };
}
describe("Fixed financing selection", () => {
  it("requires an explicit maturity choice before becoming actionable", () => {
    const { result } = renderHook(() => useMidnightFinancing(params()));
    expect(result.current.ready).toBe(false);
    act(() => result.current.setSelectedId(market.market_id));
    expect(result.current.ready).toBe(true);
  });
  it("invalidates the old quote immediately when the amount changes", () => {
    const { result, rerender } = renderHook(p => useMidnightFinancing(p), { initialProps: params() });
    act(() => result.current.setSelectedId(market.market_id));
    rerender({ ...params(), assets: 2000000n });
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/no longer matches/);
  });
  it("drops a market that cannot accept a changed collateral selection", () => {
    const { result, rerender } = renderHook(p => useMidnightFinancing(p), { initialProps: params() });
    act(() => result.current.setSelectedId(market.market_id));
    rerender({ ...params(), collaterals: [{ address: "0x0000000000000000000000000000000000000001", amount: 1n }] });
    expect(result.current.selected).toBeUndefined();
    expect(result.current.ready).toBe(false);
  });
  it("blocks insufficient health, quote refreshes and unavailable gateways", () => {
    const { result, rerender } = renderHook(() => useMidnightFinancing({ ...params(), market }));
    expect(result.current.ready).toBe(true);
    mocks.health = 1.04;
    rerender();
    expect(result.current.ready).toBe(false);
    mocks.health = 1.5;
    mocks.ready = false;
    rerender();
    expect(result.current.ready).toBe(false);
    mocks.ready = true;
    mocks.fetching = true;
    rerender();
    expect(result.current.ready).toBe(false);
  });
  it("excludes the current market when refinancing a fixed loan", () => {
    const { result } = renderHook(() => useMidnightFinancing({ ...params(), excludeMarketId: market.market_id }));
    expect(result.current.candidates).toHaveLength(0);
  });
});
