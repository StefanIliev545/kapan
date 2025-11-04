import { getAddress as getEvmAddress, isAddress as isEvmAddress } from "viem";
import { validateAndParseAddress } from "starknet";

/**
 * Attempts to normalize a user-provided address for either EVM or Starknet networks.
 * Returns a checksum address for EVM inputs or the canonical Starknet representation when valid.
 */
export const normalizeUserAddress = (value: string | null | undefined): `0x${string}` | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    if (isEvmAddress(trimmed as `0x${string}`)) {
      return getEvmAddress(trimmed as `0x${string}`) as `0x${string}`;
    }
  } catch {
    // If getAddress throws we fall back to Starknet validation below.
  }

  try {
    return validateAndParseAddress(trimmed) as `0x${string}`;
  } catch {
    return undefined;
  }
};

export const isValidUserAddress = (value: string | null | undefined): value is `0x${string}` => {
  return normalizeUserAddress(value) !== undefined;
};
