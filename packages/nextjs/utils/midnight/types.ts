import type { Address, Hex } from "viem";
import { z } from "zod";

export const MIDNIGHT_PROTOCOL = "morpho-midnight";
export const MIDNIGHT_ADDRESSES: Record<number, Address> = {
  1: "0x471686c42792F93528B000beF54bC10E3aa2045f",
  8453: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
};
export const WAD = 10n ** 18n;
export const YEAR = 365n * 86400n;
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform(v => v as Address);
export const hexSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform(v => v as Hex);
export const idSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform(v => v as Hex);
export const uintSchema = z
  .string()
  .regex(/^\d+$/)
  .refine(v => BigInt(v) < 2n ** 256n);
const timestamp = z.number().int().nonnegative().safe();
export const collateralSchema = z.object({
  token: addressSchema,
  lltv: uintSchema,
  liquidation_cursor: uintSchema,
  oracle: addressSchema,
});
export const marketSchema = z.object({
  chain_id: z.number().int(),
  midnight: addressSchema,
  loan_token: addressSchema,
  collaterals: z.array(collateralSchema).min(1).max(128),
  maturity: timestamp,
  rcf_threshold: uintSchema,
  enter_gate: addressSchema,
  liquidator_gate: addressSchema,
});
export const bookSchema = marketSchema.extend({
  market_id: idSchema,
  bids: z
    .array(
      z.object({ tick: z.number().int(), price: uintSchema, units: uintSchema, assets: uintSchema, count: z.number() }),
    )
    .default([]),
});
export const offerSchema = z.object({
  market: marketSchema,
  buy: z.boolean(),
  maker: addressSchema,
  start: timestamp,
  expiry: timestamp,
  tick: z.number().int().min(0).max(6744),
  group: idSchema,
  callback: addressSchema,
  callback_data: hexSchema,
  receiver_if_maker_is_seller: addressSchema,
  ratifier: addressSchema,
  reduce_only: z.boolean(),
  max_units: uintSchema,
  max_assets: uintSchema,
  continuous_fee_cap: uintSchema,
});
export const takeSchema = z.object({
  market_id: idSchema,
  units: uintSchema,
  offer: offerSchema,
  ratifier_data: hexSchema,
});
export const quoteSchema = z.object({
  average_best_price: uintSchema,
  average_worst_price: uintSchema,
  available_assets: uintSchema,
  available_units: uintSchema,
  takeable_offers: z.array(takeSchema).min(1).max(32),
});
export const positionSchema = z.object({
  chain_id: z.number().int(),
  market_id: idSchema,
  user_address: addressSchema,
  loan_token: addressSchema,
  maturity: timestamp,
  credit: uintSchema,
  debt: uintSchema,
  pending_fee: uintSchema,
  collaterals: z.array(z.object({ token: addressSchema, amount: uintSchema })),
  effective_rate_wad: uintSchema.nullish(),
  cost_basis: uintSchema.nullish(),
  type: z.string().nullable(),
});
export type MidnightMarket = z.infer<typeof bookSchema>;
export type MidnightTake = z.infer<typeof takeSchema>;
export type MidnightQuote = z.infer<typeof quoteSchema> & {
  market: MidnightMarket;
  fetchedAt: number;
  assets: string;
  settlementFee: string;
  consumed: string[];
};
export type MidnightPosition = z.infer<typeof positionSchema> & { market: MidnightMarket };
export interface MidnightToken {
  address: Address;
  symbol: string;
  decimals: number;
}
export interface MidnightTradeBounds {
  maxApr: bigint;
  minHealthFactor: bigint;
  priceLimit: bigint;
  maxUnits: bigint;
  deadline: bigint;
}
export const supportedMidnightChain = (chainId: number) => Boolean(MIDNIGHT_ADDRESSES[chainId]);
