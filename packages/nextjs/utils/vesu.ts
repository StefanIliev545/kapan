import { CairoOption, CairoOptionVariant, type BigNumberish } from "starknet";

export interface VesuContextV1 {
  poolId: bigint;
  counterpartToken: string;
}

export interface VesuContextV2 {
  poolAddress: string;
  positionCounterpartToken: string;
}

export type VesuContext = VesuContextV1 | VesuContextV2;

export const isVesuContextV1 = (context: VesuContext): context is VesuContextV1 =>
  "poolId" in context;

export const isVesuContextV2 = (context: VesuContext): context is VesuContextV2 =>
  "poolAddress" in context;

const toBigNumberish = (value: string | bigint): BigNumberish =>
  typeof value === "bigint" ? value : BigInt(value);

export const buildVesuContextOption = (
  context?: VesuContext,
): CairoOption<BigNumberish[]> => {
  if (!context) {
    return new CairoOption<BigNumberish[]>(CairoOptionVariant.None);
  }

  if (isVesuContextV2(context)) {
    return new CairoOption<BigNumberish[]>(CairoOptionVariant.Some, [
      toBigNumberish(context.poolAddress),
      toBigNumberish(context.positionCounterpartToken),
    ]);
  }

  return new CairoOption<BigNumberish[]>(CairoOptionVariant.Some, [
    context.poolId,
    toBigNumberish(context.counterpartToken),
  ]);
};
