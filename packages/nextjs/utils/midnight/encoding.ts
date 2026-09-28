import type { MidnightMarket, MidnightQuote, MidnightTradeBounds } from "./types";
import { type Hex, concatHex, encodeAbiParameters, keccak256, parseAbiParameters, zeroAddress, zeroHash } from "viem";

// Matches MidnightTypes.sol and the pinned official Midnight ABI. No Blue contexts are reused.
export const MARKET =
  "(uint256 chainId,address midnight,address loanToken,(address token,uint256 lltv,uint256 liquidationCursor,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate)";
export const OFFER = `(${MARKET} market,bool buy,address maker,uint256 start,uint256 expiry,uint256 tick,bytes32 group,address callback,bytes callbackData,address receiverIfMakerIsSeller,address ratifier,bool reduceOnly,uint128 maxUnits,uint128 maxAssets,uint256 continuousFeeCap)`;
export const TAKE = `(${OFFER} offer,bytes ratifierData,uint256 maxUnits)`;
export const TRADE = `(uint256 deadline,uint256 maxUnits,uint256 minUnits,uint256 priceLimit,uint256 maxApr,uint256 minHealthFactor,address planProvider,bytes32 planKey,${TAKE}[] takes)`;
export function solidityMarket(m: Omit<MidnightMarket, "market_id" | "bids">) {
  return {
    chainId: BigInt(m.chain_id),
    midnight: m.midnight,
    loanToken: m.loan_token,
    collateralParams: m.collaterals.map(c => ({
      token: c.token,
      lltv: BigInt(c.lltv),
      liquidationCursor: BigInt(c.liquidation_cursor),
      oracle: c.oracle,
    })),
    maturity: BigInt(m.maturity),
    rcfThreshold: BigInt(m.rcf_threshold),
    enterGate: m.enter_gate,
    liquidatorGate: m.liquidator_gate,
  };
}
export function midnightMarketId(m: Omit<MidnightMarket, "market_id" | "bids">): Hex {
  const initHash = keccak256(
    concatHex(["0x600b380380600b5f395ff3", encodeAbiParameters(parseAbiParameters(MARKET), [solidityMarket(m)])]),
  );
  return keccak256(concatHex(["0xff", m.midnight as Hex, zeroHash, initHash]));
}
export function collateralIndex(m: MidnightMarket, token: string): number {
  const index = m.collaterals.findIndex(c => c.token.toLowerCase() === token.toLowerCase());
  if (index < 0) throw new Error("This fixed market does not accept the selected collateral.");
  return index;
}
export function encodeMidnightContext(
  marketId: Hex,
  index = 0,
  quote?: MidnightQuote,
  bounds?: MidnightTradeBounds,
): Hex {
  if (Boolean(quote) !== Boolean(bounds)) throw new Error("A borrowing quote and its bounds are both required.");
  const trade =
    quote && bounds
      ? encodeAbiParameters(parseAbiParameters(TRADE), [
          {
            ...bounds,
            minUnits: 0n,
            planProvider: zeroAddress,
            planKey: zeroHash,
            takes: quote.takeable_offers.map(t => ({
              offer: {
                market: solidityMarket(t.offer.market),
                buy: t.offer.buy,
                maker: t.offer.maker,
                start: BigInt(t.offer.start),
                expiry: BigInt(t.offer.expiry),
                tick: BigInt(t.offer.tick),
                group: t.offer.group,
                callback: t.offer.callback,
                callbackData: t.offer.callback_data,
                receiverIfMakerIsSeller: t.offer.receiver_if_maker_is_seller,
                ratifier: t.offer.ratifier,
                reduceOnly: t.offer.reduce_only,
                maxUnits: BigInt(t.offer.max_units),
                maxAssets: BigInt(t.offer.max_assets),
                continuousFeeCap: BigInt(t.offer.continuous_fee_cap),
              },
              ratifierData: t.ratifier_data,
              maxUnits: BigInt(t.units),
            })),
          },
        ])
      : "0x";
  return encodeAbiParameters(parseAbiParameters("bytes32,uint256,bytes"), [marketId, BigInt(index), trade]);
}
export function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}
