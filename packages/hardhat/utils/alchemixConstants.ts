/**
 * Alchemix protocol identifiers — TypeScript mirror of
 * `contracts/v2/gateways/alchemix/AlchemixConstants.sol`.
 *
 * Used by deploy scripts and fork tests so that the on-chain registry key, the
 * KapanViewRouter constant, and the bytes4 baked into trigger params all stay
 * in lockstep. If you bump the gateway version, change all three files together:
 *
 *   - this file
 *   - contracts/v2/gateways/alchemix/AlchemixConstants.sol
 *   - packages/nextjs/utils/alchemix/protocolConstants.ts
 */
import { ethers } from "ethers";

export const ALCHEMIX_GATEWAY_NAME = "alchemix-v3" as const;

export const ALCHEMIX_PROTOCOL_ID = ethers.keccak256(
  ethers.toUtf8Bytes(ALCHEMIX_GATEWAY_NAME),
).slice(0, 10) as `0x${string}`;
