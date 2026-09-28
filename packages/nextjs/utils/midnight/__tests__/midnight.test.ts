import { FlashLoanProvider, LendingOp, normalizeProtocolName } from "../../v2/instructionHelpers";
import { TRADE, collateralIndex, encodeMidnightContext, midnightMarketId } from "../encoding";
import { buildMidnightRepay, buildMidnightSwap } from "../flows";
import { borrowingBounds, matchingMarkets, previewBorrow, validateMarket, validateQuote } from "../quotes";
import { tickToPrice } from "../tick";
import { type MidnightQuote, WAD, bookSchema, quoteSchema } from "../types";
import fixture from "./live-base-fixture.json";
import { AbiCoder } from "ethers";
import { decodeAbiParameters, parseAbiParameters, zeroHash } from "viem";
import { describe, expect, it } from "vitest";

const market = bookSchema.parse(fixture.market),
  now = 1790515500;
function quote(): MidnightQuote {
  return {
    ...quoteSchema.parse(fixture.quote),
    market,
    assets: "1000000",
    fetchedAt: now,
    settlementFee: "0",
    consumed: fixture.quote.takeable_offers.map(() => "0"),
  };
}
const user = "0x0000000000000000000000000000000000000001" as const;
const ctxAbi = parseAbiParameters("bytes32,uint256,bytes");
const coder = AbiCoder.defaultAbiCoder();
function lending(data: string) {
  const [i] = coder.decode(
    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
    data,
  );
  return [i, i.context, i.input];
}

describe("Midnight offers and safeguards", () => {
  it("matches the live Base market ID and collateral order", () => {
    expect(midnightMarketId(market)).toBe(market.market_id);
    expect(() => validateMarket(market, 8453)).not.toThrow();
    expect(() => validateMarket({ ...market, collaterals: [...market.collaterals].reverse() }, 8453)).toThrow();
    expect(() => validateMarket(market, 1)).toThrow();
  });
  it("matches official orderbook tick prices exactly", () => {
    for (const b of market.bids) expect(tickToPrice(b.tick)).toBe(BigInt(b.price));
    expect(tickToPrice(3372)).toBe(WAD / 2n);
    expect(() => tickToPrice(6745)).toThrow();
  });
  it("keeps Midnight separate from Blue", () => {
    expect(normalizeProtocolName("Morpho Midnight")).toBe("morpho-midnight");
    expect(normalizeProtocolName("Morpho Blue")).toBe("morpho-blue");
  });
  it("only offers the same debt and every selected collateral before maturity", () => {
    expect(
      matchingMarkets(
        [market],
        market.loan_token,
        market.collaterals.map(c => c.token),
        now,
      ),
    ).toEqual([market]);
    expect(matchingMarkets([market], user, [], now)).toEqual([]);
    expect(matchingMarkets([market], market.loan_token, [user], now)).toEqual([]);
    expect(matchingMarkets([market], market.loan_token, [], market.maturity)).toEqual([]);
    expect(matchingMarkets([{ ...market, enter_gate: user }], market.loan_token, [], now)).toEqual([]);
  });
  it("targets exact cash while reporting the larger fixed debt", () => {
    const p = borrowingBounds(quote(), 1000000n, WAD, 50, now, user);
    expect(p.assets).toBe(1000000n);
    expect(p.units).toBeGreaterThan(p.assets);
    expect(p.bounds.maxUnits).toBeGreaterThanOrEqual(p.units);
    expect(p.apr).toBeGreaterThan(0n);
  });
  it("rejects stale, changed-amount, wrong-side and wrong-market quotes", () => {
    const q = quote();
    expect(() => borrowingBounds(q, 1000001n, WAD, 50, now)).toThrow();
    expect(() => borrowingBounds(q, 1000000n, WAD, 50, now + 61)).toThrow();
    q.takeable_offers[0].offer.buy = false;
    expect(() => validateQuote(q, market, 1000000n)).toThrow();
    const wrong = quote();
    wrong.takeable_offers[0].market_id = zeroHash;
    expect(() => validateQuote(wrong, market, 1000000n)).toThrow();
  });
  it("enforces APR independently from price and includes settlement fees", () => {
    expect(() => borrowingBounds(quote(), 1000000n, 0n, 50, now)).toThrow(/maximum APR/);
    const q = quote();
    q.settlementFee = (WAD / 1000n).toString();
    expect(previewBorrow(q, 1000000n, (WAD * 98n) / 100n, now).units).toBeGreaterThan(
      previewBorrow(quote(), 1000000n, (WAD * 98n) / 100n, now).units,
    );
  });
  it("does not count expired or self-matched offers", () => {
    const q = quote();
    q.takeable_offers = q.takeable_offers.slice(0, 1);
    q.consumed = ["0"];
    expect(() => previewBorrow(q, 1000000n, 0n, now, q.takeable_offers[0].offer.maker)).toThrow();
    expect(() => previewBorrow(q, 1000000n, 0n, q.takeable_offers[0].offer.expiry + 1)).toThrow();
  });
  it("does not double count a maker's shared group capacity", () => {
    const q = quote(),
      take = q.takeable_offers[0];
    take.offer.max_assets = "0";
    take.offer.max_units = "600000";
    take.units = "600000";
    q.takeable_offers = [take, structuredClone(take)];
    q.consumed = ["0", "0"];
    expect(() => previewBorrow(q, 1000000n, 0n, now)).toThrow(/Not enough/);
  });
  it("encodes the chosen collateral slot and complete bounded takes", () => {
    const q = quote(),
      p = borrowingBounds(q, 1000000n, WAD, 50, now);
    const decoded = decodeAbiParameters(ctxAbi, encodeMidnightContext(market.market_id, 1, q, p.bounds));
    expect(decoded[0]).toBe(market.market_id);
    expect(decoded[1]).toBe(1n);
    const [trade] = coder.decode([TRADE], decoded[2]);
    expect(trade.takes.length).toBe(q.takeable_offers.length);
    expect(trade.maxApr).toBe(WAD);
    expect(trade.maxUnits).toBe(p.bounds.maxUnits);
    expect(trade.takes[0].ratifierData).toBe(q.takeable_offers[0].ratifier_data);
    expect(() => collateralIndex(market, user)).toThrow();
  });
});
describe("Midnight wallet and aggregator instructions", () => {
  it("repays exact face debt with a refund and no financing offer", () => {
    const flow = buildMidnightRepay(user, market, 100n);
    expect(flow).toHaveLength(4);
    const [, context, ptr] = lending(flow[2].data);
    expect(ptr.index).toBe(0n);
    expect(decodeAbiParameters(ctxAbi, context)[2]).toBe("0x");
  });
  it("uses separate slots for collateral swaps", () => {
    const flow = buildMidnightSwap({
      mode: "collateral",
      user,
      market,
      tokenIn: market.collaterals[0].token,
      tokenOut: market.collaterals[1].token,
      amount: 100n,
      minOut: 90n,
      repay: 0n,
      swapData: "0x1234",
      swapRouter: "kyber",
      provider: FlashLoanProvider.Morpho,
    });
    const deposit = lending(flow[5].data),
      withdraw = lending(flow[6].data);
    expect(deposit[0].op).toBe(BigInt(LendingOp.DepositCollateral));
    expect(decodeAbiParameters(ctxAbi, deposit[1])[1]).toBe(1n);
    expect(decodeAbiParameters(ctxAbi, withdraw[1])[1]).toBe(0n);
    expect(deposit[2].index).toBe(3n);
    expect(withdraw[2].index).toBe(1n);
  });
  it("deleverages face debt and refunds swap surplus", () => {
    const flow = buildMidnightSwap({
      mode: "deleverage",
      user,
      market,
      tokenIn: market.collaterals[0].token,
      tokenOut: market.loan_token,
      amount: 100n,
      minOut: 95n,
      repay: 90n,
      swapData: "0x1234",
      swapRouter: "kyber",
      provider: FlashLoanProvider.Morpho,
    });
    expect(lending(flow[3].data)[2].index).toBe(0n);
    expect(lending(flow[7].data)[0].op).toBe(BigInt(LendingOp.Swap));
    expect(flow).toHaveLength(12);
  });
  it("rejects fee-bearing flash providers until exact fee sizing is supported", () => {
    expect(() =>
      buildMidnightSwap({
        mode: "collateral",
        user,
        market,
        tokenIn: market.collaterals[0].token,
        tokenOut: market.collaterals[1].token,
        amount: 100n,
        minOut: 90n,
        repay: 0n,
        swapData: "0x",
        swapRouter: "oneinch",
        provider: FlashLoanProvider.Aave,
      }),
    ).toThrow(/zero-fee/);
  });
  it("moves every selected collateral slot before borrowing the new fixed debt", () => {
    const destinationMarket = { ...market, loan_token: user };
    destinationMarket.market_id = midnightMarketId(destinationMarket);
    const flow = buildMidnightSwap({
      mode: "debt",
      user,
      market,
      destination: { market: destinationMarket, context: encodeMidnightContext(destinationMarket.market_id, 0) },
      collateralsToMove: market.collaterals.map(c => c.token),
      tokenIn: user,
      tokenOut: market.loan_token,
      amount: 100n,
      minOut: 95n,
      repay: 90n,
      swapData: "0x1234",
      swapRouter: "kyber",
      provider: FlashLoanProvider.Morpho,
    });
    expect(lending(flow[5].data)[0].op).toBe(BigInt(LendingOp.Repay));
    expect(lending(flow[9].data)[0].op).toBe(BigInt(LendingOp.DepositCollateral));
    expect(decodeAbiParameters(ctxAbi, lending(flow[13].data)[1])[0]).toBe(destinationMarket.market_id);
    const borrow = lending(flow[14].data);
    expect(borrow[0].op).toBe(BigInt(LendingOp.Borrow));
    expect(borrow[2].index).toBe(1n);
  });
});
