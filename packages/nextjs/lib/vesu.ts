import { ProviderInterface } from "starknet";
import { normalizeStarknetAddress } from "~~/utils/vesu";

export const VESU_V2_POOL_FACTORY_ADDRESS =
  "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0" as const;

export async function getVTokenForAsset(
  provider: ProviderInterface,
  poolAddress: `0x${string}`,
  assetAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const callResponse = await provider.callContract(
    {
      contractAddress: VESU_V2_POOL_FACTORY_ADDRESS,
      entrypoint: "v_token_for_asset",
      calldata: [poolAddress, assetAddress],
    },
    "pre_confirmed",
  );

  // Starknet.js v6+ returns a bare array for callContract, while older
  // versions wrap the result in an object. Handle both to stay
  // compatible with the app's provider typings.
  const wrappedResponse = callResponse as unknown as { result?: unknown };
  const maybeArray = callResponse as unknown;
  const resultArray = Array.isArray(wrappedResponse.result)
    ? (wrappedResponse.result as unknown[])
    : Array.isArray(maybeArray)
      ? (maybeArray as unknown[])
      : [];

  const raw = resultArray?.[0];
  if (!raw) {
    return "0x0" as `0x${string}`;
  }

  let hexValue: string;
  if (typeof raw === "string") {
    hexValue = raw.startsWith("0x") ? raw : `0x${BigInt(raw).toString(16)}`;
  } else if (typeof raw === "bigint") {
    hexValue = `0x${raw.toString(16)}`;
  } else if (typeof raw === "number") {
    hexValue = `0x${BigInt(raw).toString(16)}`;
  } else {
    try {
      hexValue = `0x${BigInt((raw as { toString: () => string }).toString()).toString(16)}`;
    } catch (error) {
      console.warn("Failed to parse vToken address", raw, error);
      return "0x0" as `0x${string}`;
    }
  }

  try {
    return normalizeStarknetAddress(hexValue) as `0x${string}`;
  } catch (error) {
    console.warn("Failed to normalize vToken address", hexValue, error);
    return "0x0" as `0x${string}`;
  }
}
