import { useMemo } from "react";
import { formatUnits } from "viem";
import type { Selected } from "./useSelectedCollaterals";

const RAW_PRICE_DECIMALS = 18;
const BPS_DEN = 10_000n;

export type Allocation = Selected & {
  usd: number;
  weight: number;      // 0..1
  repayAmount: bigint; // bigint portion of total debt
};

export type AllocMeta = { rows: Allocation[]; lastNonZeroIndex: number };

export function useDebtAllocations(
  selected: Selected[],
  priceByAddress: Record<string, bigint>,
  debtAmountRaw: bigint,        // parseUnits(debtAmount, debtDecimals)
  isDebtMaxClicked: boolean,
): AllocMeta {
  return useMemo<AllocMeta>(() => {
    // USD per collateral
    const rowsWithUsd = selected.map(s => {
      const priceRaw = priceByAddress[s.lower]; // 1e18 fixed
      const price = priceRaw ? Number(formatUnits(priceRaw, RAW_PRICE_DECIMALS)) : 0;
      const amount = Number(formatUnits(s.amountRaw, s.decimals ?? 18));
      return { ...s, usd: amount * price };
    });

    const totalUsd = rowsWithUsd.reduce((a, b) => a + b.usd, 0);
    const withWeights = rowsWithUsd.map(r => ({ ...r, weight: totalUsd > 0 ? r.usd / totalUsd : 0 }));

    // Repay bigint portions in BPS, floor then fix remainder
    const bps = withWeights.map(r => Math.floor(r.weight * 10_000));
    const repay = bps.map(b => (debtAmountRaw * BigInt(b)) / BPS_DEN);

    const sum = repay.reduce((a, b) => a + b, 0n);
    const remainder = debtAmountRaw - sum;
    if (remainder > 0n && repay.length > 0) repay[0] += remainder;

    // find last non-zero index (for repay_all)
    const last = (() => {
      for (let i = repay.length - 1; i >= 0; i--) if (repay[i] > 0n) return i;
      return -1;
    })();

    // attach repay amounts
    const rows: Allocation[] = withWeights.map((r, i) => ({ ...r, repayAmount: repay[i] ?? 0n }));

    // if user clicked "MAX debt", only the last non-zero should carry `repay_all` in your builder
    return { rows, lastNonZeroIndex: isDebtMaxClicked ? last : -1 };
  }, [selected, priceByAddress, debtAmountRaw, isDebtMaxClicked]);
}

