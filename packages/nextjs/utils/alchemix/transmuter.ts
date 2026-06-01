/**
 * Alchemix V3 Transmuter — ABI subset, deployed addresses, and small helpers.
 *
 * The deployed Transmuter is **ERC-721 Enumerable** (this differs materially from the
 * v3-poc source on GitHub which uses ERC-1155 with a `_positions[user][nonce]` mapping —
 * we verified by reading the deployed bytecode + verified ABI). Each position is one NFT;
 * `tokenOfOwnerByIndex(user, i)` enumerates the user's positions, and `getPosition(id)`
 * returns the staking-data tuple. The transmuter binds a *single* alchemist via the
 * `alchemist()` getter, so the position struct is just `{ amount, startBlock, maturationBlock }`
 * — the alchemist is implicit.
 *
 * Position discovery flow (see hook):
 *   1. `balanceOf(user)` → N
 *   2. `tokenOfOwnerByIndex(user, i)` for i ∈ [0, N) → tokenIds[]
 *   3. `getPosition(tokenId)` for each → StakingPosition[]
 *
 * Steps (2) and (3) batch via Multicall3 in one RPC each, so total RPC count is ~3
 * regardless of how many positions the user holds.
 */
import type { Address } from "viem";

/** Maps `alchemist address` → `transmuter address` for each Alchemix V3 market. */
export const ALCHEMIX_TRANSMUTER_BY_ALCHEMIST: Record<string, Address | undefined> = {
  // Arbitrum — alUSD market: verified on-chain via alchemist.transmuter()
  "0x930750a3510e703535e943e826aba3c364ffc1de": "0x693b7594ae0633d9c5574d0da46a040f92f5b281",
  // Arbitrum — alETH market: address provided by Alchemix team (alchemist's public
  // transmuter() getter doesn't expose it via the standard selector on V3, so we hard-code).
  "0xded3a04612ff12b57317abe38e68026fc9d28114": "0x2584E8b0616b3E750492c9629a3b27679C410cb9",
};

/** Look up the transmuter for a given alchemist; case-insensitive. */
export function getTransmuterForAlchemist(alchemist: string | undefined): Address | undefined {
  if (!alchemist) return undefined;
  return ALCHEMIX_TRANSMUTER_BY_ALCHEMIST[alchemist.toLowerCase()];
}

/**
 * StakingPosition struct — matches the deployed contract layout (3 fields). Earlier docs
 * referenced 5-field versions; those are stale. The alchemist + yieldToken are global to
 * the transmuter (one transmuter per alchemist), not per-position.
 */
export interface TransmuterStakingPosition {
  /** Synthetic-token amount the user staked (debtDecimals — 18 for both alUSD and alETH). */
  amount: bigint;
  /** Block at which the position was created. */
  startBlock: bigint;
  /** Block at which transmutation completes (claimable in full). */
  maturationBlock: bigint;
}

/**
 * Minimal Transmuter ABI — only what the read hook needs. Hand-written from the verified
 * Arbiscan ABI rather than the GitHub source because the deployed contract diverges from
 * the v3-poc dev/immunefi_audit branches.
 */
export const TRANSMUTER_ABI = [
  // ERC-721 enumeration — primary discovery path
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  // Position data — single id, returns the 3-field StakingPosition tuple
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "startBlock", type: "uint256" },
          { name: "maturationBlock", type: "uint256" },
        ],
      },
    ],
  },
  // Global getters
  {
    type: "function",
    name: "alchemist",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "timeToTransmute",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
