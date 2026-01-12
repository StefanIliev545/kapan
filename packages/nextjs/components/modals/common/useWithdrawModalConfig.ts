import { useMemo } from "react";
import { formatUnits } from "viem";
import type { TokenInfo } from "../TokenActionModal";
import type { PositionManager } from "~~/utils/position";

/**
 * Configuration for withdraw modal that is shared between EVM and Starknet versions.
 */
export interface WithdrawModalConfigParams {
  token: TokenInfo;
  supplyBalance: bigint;
}

/**
 * Return type for the withdraw modal configuration hook.
 */
export interface WithdrawModalConfig {
  /** Decimal places for the token */
  decimals: number;
  /** Current supply balance formatted as a number */
  before: number;
  /** Maximum input value with 1% buffer for dust */
  maxInput: bigint;
  /** Common props to pass to TokenActionModal */
  commonModalProps: {
    action: "Withdraw";
    apyLabel: string;
    metricLabel: string;
    before: number;
    percentBase: bigint;
    max: bigint;
  };
}

/**
 * Common base props shared between EVM and Starknet withdraw modals.
 */
export interface WithdrawModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  position?: PositionManager;
}

/**
 * Hook that computes common configuration values for withdraw modals.
 * This extracts the duplicated logic between WithdrawModal and WithdrawModalStark.
 */
export function useWithdrawModalConfig({
  token,
  supplyBalance,
}: WithdrawModalConfigParams): WithdrawModalConfig {
  const decimals = token.decimals ?? 18;

  const before = useMemo(
    () => (decimals ? Number(formatUnits(supplyBalance, decimals)) : 0),
    [decimals, supplyBalance]
  );

  const maxInput = useMemo(
    () => (supplyBalance * 101n) / 100n,
    [supplyBalance]
  );

  const commonModalProps = useMemo(
    () => ({
      action: "Withdraw" as const,
      apyLabel: "Supply APY",
      metricLabel: "Total supplied",
      before,
      percentBase: supplyBalance,
      max: maxInput,
    }),
    [before, supplyBalance, maxInput]
  );

  return {
    decimals,
    before,
    maxInput,
    commonModalProps,
  };
}
