import { midnightMarketId, sameAddress } from "./encoding";
import { tickToPrice } from "./tick";
import {
  MIDNIGHT_ADDRESSES,
  type MidnightMarket,
  type MidnightQuote,
  type MidnightTradeBounds,
  WAD,
  YEAR,
} from "./types";
import { zeroAddress } from "viem";

export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const min = (a: bigint, b: bigint) => (a < b ? a : b);
export function validateMarket(m: MidnightMarket, chainId: number) {
  if (
    m.chain_id !== chainId ||
    !MIDNIGHT_ADDRESSES[chainId] ||
    !sameAddress(m.midnight, MIDNIGHT_ADDRESSES[chainId]) ||
    midnightMarketId(m).toLowerCase() !== m.market_id.toLowerCase()
  )
    throw new Error("Midnight market identity does not match this network.");
}
export function matchingMarkets(
  markets: MidnightMarket[],
  loan: string,
  collaterals: string[],
  now = Math.floor(Date.now() / 1000),
) {
  return markets
    .filter(
      m =>
        m.maturity > now + 300 &&
        sameAddress(m.loan_token, loan) &&
        sameAddress(m.enter_gate, zeroAddress) &&
        collaterals.every(token => m.collaterals.some(c => sameAddress(c.token, token))),
    )
    .sort((a, b) => a.maturity - b.maturity || a.market_id.localeCompare(b.market_id));
}
export function validateQuote(q: MidnightQuote, market: MidnightMarket, assets: bigint) {
  validateMarket(market, market.chain_id);
  if (
    q.assets !== assets.toString() ||
    q.market.market_id.toLowerCase() !== market.market_id.toLowerCase() ||
    midnightMarketId(q.market) !== midnightMarketId(market) ||
    q.takeable_offers.length > 32 ||
    q.consumed.length !== q.takeable_offers.length
  )
    throw new Error("The offer quote no longer matches this request.");
  for (const t of q.takeable_offers) {
    if (
      !t.offer.buy ||
      t.market_id.toLowerCase() !== market.market_id.toLowerCase() ||
      midnightMarketId(t.offer.market).toLowerCase() !== market.market_id.toLowerCase()
    )
      throw new Error("The quote contains an offer for another market or side.");
  }
}
/** Mirrors the gateway's exact cash targeting, fee deductions and maker-group caps. */
export function previewBorrow(q: MidnightQuote, assets: bigint, priceLimit: bigint, now: number, user?: string) {
  let received = 0n,
    units = 0n;
  const usedByGroup = new Map<string, bigint>();
  const fee = BigInt(q.settlementFee);
  for (let i = 0; i < q.takeable_offers.length && received < assets; i++) {
    const t = q.takeable_offers[i],
      o = t.offer;
    if (now < o.start || now > o.expiry || (user && sameAddress(user, o.maker))) continue;
    const price = tickToPrice(o.tick);
    if (price <= fee) continue;
    const net = price - fee;
    if (net < priceLimit) continue;
    const key = `${o.maker.toLowerCase()}:${o.group.toLowerCase()}`;
    const used = usedByGroup.get(key) ?? BigInt(q.consumed[i]);
    const maxUnits = BigInt(o.max_units),
      maxAssets = BigInt(o.max_assets);
    if ((maxAssets === 0n) === (maxUnits === 0n)) continue;
    const cap = maxUnits ? maxUnits : maxAssets;
    if (used >= cap) continue;
    const available = maxUnits ? cap - used : ceilDiv((cap - used + 1n) * WAD, price) - 1n;
    const fill = min(ceilDiv((assets - received) * WAD, net), min(BigInt(t.units), available));
    const cash = (fill * net) / WAD;
    if (cash === 0n) continue;
    received += cash;
    units += fill;
    usedByGroup.set(key, used + (maxUnits ? fill : (fill * price) / WAD));
  }
  if (received !== assets)
    throw new Error(
      "Not enough lender offers at your rate and price limits. Try a smaller amount or another maturity.",
    );
  return {
    units,
    assets: received,
    apr: ceilDiv((units - assets) * WAD * YEAR, assets * BigInt(q.market.maturity - now)),
  };
}
export function borrowingBounds(
  q: MidnightQuote,
  assets: bigint,
  maxApr: bigint,
  slippageBps = 50,
  now = Math.floor(Date.now() / 1000),
  user?: string,
): { bounds: MidnightTradeBounds; units: bigint; assets: bigint; apr: bigint } {
  validateQuote(q, q.market, assets);
  if (assets <= 0n || maxApr < 0n || now >= q.market.maturity || now - q.fetchedAt > 60 || q.fetchedAt > now + 30)
    throw new Error("Refresh the fixed-rate quote before continuing.");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500)
    throw new Error("Invalid financing tolerance.");
  const priceLimit = (BigInt(q.average_best_price) * BigInt(10000 - slippageBps)) / 10000n;
  if (priceLimit <= 0n || priceLimit > WAD) throw new Error("Invalid financing price.");
  const preview = previewBorrow(q, assets, priceLimit, now, user);
  const term = BigInt(q.market.maturity - now);
  const rateMax = assets + (assets * ((maxApr * term) / YEAR)) / WAD;
  const maxUnits = min((assets * WAD) / priceLimit, rateMax);
  if (preview.units > maxUnits) throw new Error("The available fixed APR exceeds your maximum APR.");
  return {
    ...preview,
    bounds: {
      maxApr,
      minHealthFactor: (105n * WAD) / 100n,
      priceLimit,
      maxUnits,
      deadline: BigInt(Math.min(now + 120, q.market.maturity - 1)),
    },
  };
}
