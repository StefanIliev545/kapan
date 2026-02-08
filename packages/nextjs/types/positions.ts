/**
 * Unified position data model with topology-based rendering.
 *
 * Three topologies cover all supported protocols:
 *   - "cross"    → Any collateral backs any debt (Aave, Venus)
 *   - "isolated" → 1 collateral : 1 debt per market (Morpho, Vesu)
 *   - "multi"    → N collaterals : 1 debt per sub-account (Euler, Compound V3)
 *
 * Adapter hooks (hooks/adapters/) transform each protocol's native data
 * into PositionGroup[], then unified components render them.
 */

// ── Discriminators ──────────────────────────────────────────────────

export type PositionTopology = "cross" | "isolated" | "multi";

export type ProtocolId =
  | "aave"
  | "compound"
  | "venus"
  | "morpho"
  | "euler"
  | "vesu"
  | "nostra";

export type NetworkFamily = "evm" | "starknet";

// ── Token-level position ────────────────────────────────────────────

export interface TokenPosition {
  /** On-chain token address */
  address: string;
  symbol: string;
  icon: string;
  decimals: number;

  /** Raw balance in token-native units (wei, etc.) */
  rawBalance: bigint;
  /** Balance denominated in USD */
  usdValue: number;
  /** Token price with 8-decimal precision (matches existing tokenPrice convention) */
  priceRaw: bigint;

  /** Current APY/APR as a percentage (e.g. 3.5 means 3.5%) */
  rate: number;
  rateLabel?: "APY" | "APR";

  /** Protocol-specific vault / market address (Euler vault, Morpho aToken, etc.) */
  vaultAddress?: string;
}

// ── Health / risk data ──────────────────────────────────────────────

export interface HealthData {
  /** Current loan-to-value ratio as percentage (0-100), null if no debt */
  currentLtv: number | null;
  /** Maximum LTV for new borrows (percentage) */
  maxLtv: number;
  /** Liquidation threshold LTV (percentage) */
  liquidationLtv: number;
  /** Health factor (> 1 is safe), null if no debt */
  healthFactor: number | null;
  isHealthy: boolean;
}

// ── Automation status ───────────────────────────────────────────────

export interface AutomationStatus {
  /** Auto-deleverage is actively protecting collateral side */
  adlActive: boolean;
  /** Auto-deleverage is protecting debt side */
  adlProtected: boolean;
}

// ── Position group ──────────────────────────────────────────────────

export interface PositionGroup {
  /** Unique key: market id, sub-account address, or `${protocol}-${chainId}` */
  id: string;
  protocol: ProtocolId;
  chainId: number;
  network: NetworkFamily;
  topology: PositionTopology;

  /** Human-readable label: "WETH/USDC", "Sub-account 0", protocol name, etc. */
  label?: string;

  collaterals: TokenPosition[];
  debts: TokenPosition[];
  health: HealthData | null;

  /**
   * Opaque protocol-specific context passed through to modals.
   * Each adapter hook stores what its modals need here.
   * The modal bridge (components/positions/modalBridge.ts) knows how to unpack it.
   */
  context: unknown;

  /** Automation status (ADL/auto-leverage) */
  automation?: AutomationStatus;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Sum USD values of all collateral positions in a group */
export function totalCollateralUsd(group: PositionGroup): number {
  return group.collaterals.reduce((sum, c) => sum + c.usdValue, 0);
}

/** Sum USD values of all debt positions in a group */
export function totalDebtUsd(group: PositionGroup): number {
  return group.debts.reduce((sum, d) => sum + d.usdValue, 0);
}

/** Net position value (collateral - debt) in USD */
export function netPositionUsd(group: PositionGroup): number {
  return totalCollateralUsd(group) - totalDebtUsd(group);
}

/**
 * Weighted-average rate across token positions.
 * Weights by USD value; returns 0 if total value is 0.
 */
export function weightedRate(positions: TokenPosition[]): number {
  const totalUsd = positions.reduce((s, p) => s + p.usdValue, 0);
  if (totalUsd === 0) return 0;
  return positions.reduce((s, p) => s + p.rate * (p.usdValue / totalUsd), 0);
}
