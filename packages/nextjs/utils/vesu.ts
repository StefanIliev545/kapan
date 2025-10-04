import { CairoOption, CairoOptionVariant, type BigNumberish } from "starknet";

export type VesuProtocolKey = "vesu" | "vesu_v2";

const normalizeHexAddress = (value: string | bigint): string => {
  const hex = typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/i, "");
  return `0x${hex.padStart(64, "0")}`;
};

export interface VesuContextV1 {
  protocolKey: "vesu";
  poolId: bigint;
  counterpartToken: string;
}

export interface VesuContextV2 {
  protocolKey: "vesu_v2";
  poolAddress: string;
  positionCounterpartToken: string;
}

export type VesuContext = VesuContextV1 | VesuContextV2;

export const isVesuContextV1 = (context: VesuContext): context is VesuContextV1 =>
  context.protocolKey === "vesu";

export const isVesuContextV2 = (context: VesuContext): context is VesuContextV2 =>
  context.protocolKey === "vesu_v2";

export const createVesuContextV1 = (
  poolId: bigint | string,
  counterpartToken: string,
): VesuContextV1 => ({
  protocolKey: "vesu",
  poolId: typeof poolId === "bigint" ? poolId : BigInt(poolId),
  counterpartToken: normalizeHexAddress(counterpartToken),
});

export const createVesuContextV2 = (
  poolAddress: string | bigint,
  positionCounterpartToken: string,
): VesuContextV2 => ({
  protocolKey: "vesu_v2",
  poolAddress: normalizeHexAddress(poolAddress),
  positionCounterpartToken: normalizeHexAddress(positionCounterpartToken),
});

export const createVesuContext = (
  protocolKey: VesuProtocolKey,
  poolKey: string | bigint,
  counterpartToken: string,
): VesuContext =>
  protocolKey === "vesu"
    ? createVesuContextV1(poolKey, counterpartToken)
    : createVesuContextV2(poolKey, counterpartToken);

export const normalizeStarknetAddress = normalizeHexAddress;

const toBigNumberish = (value: string | bigint): BigNumberish =>
  typeof value === "bigint" ? value : BigInt(value);

export const buildVesuContextOption = (
  context?: VesuContext,
): CairoOption<BigNumberish[]> => {
  if (!context) {
    return new CairoOption<BigNumberish[]>(CairoOptionVariant.None);
  }

  if (isVesuContextV2(context)) {
    console.log("v2 context", context);
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
