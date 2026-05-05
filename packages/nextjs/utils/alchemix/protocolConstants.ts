/**
 * Alchemix protocol identifiers — TypeScript mirror of
 * `packages/hardhat/contracts/v2/gateways/alchemix/AlchemixConstants.sol`.
 *
 * Two distinct concepts, intentionally separated:
 *
 * - `ALCHEMIX_GATEWAY_NAME` is the on-chain registry key. KapanRouter and KapanViewRouter
 *   both look up the gateway by this exact string, so anything that builds an instruction
 *   targeting alchemix (`createProtocolInstruction(name, …)`, `encodeApprove(idx, name)`,
 *   trigger params via `getProtocolId(name)`) must use this constant — never a hand-typed
 *   "alchemix" / "Alchemix V3" / etc.
 *
 * - `ALCHEMIX_PROTOCOL_ID` is the bytes4 trigger identifier — `keccak256(name)[0:4]`.
 *   This is what gets baked into LimitPriceTrigger / LtvTrigger / AutoLeverageTrigger
 *   static data and what KapanViewRouter compares against to dispatch.
 *
 * - `ALCHEMIX_DISPLAY_LABEL` is the user-facing slug ("alchemix") used by `KapanProtocol`,
 *   `PROTOCOL_ICONS`, appData tagging. It lives in the UI layer and never touches the
 *   on-chain registry, so versioning the gateway doesn't drag the brand label through.
 *
 * Bump the gateway name here AND in AlchemixConstants.sol when shipping a new gateway
 * deployment — they have to agree, byte-for-byte, or orders silently target the wrong
 * registry slot.
 */
import { keccak256, toHex, type Hex } from "viem";

export const ALCHEMIX_GATEWAY_NAME = "alchemix-v3" as const;

export const ALCHEMIX_PROTOCOL_ID: Hex = keccak256(toHex(ALCHEMIX_GATEWAY_NAME)).slice(0, 10) as Hex;

export const ALCHEMIX_DISPLAY_LABEL = "alchemix" as const;
