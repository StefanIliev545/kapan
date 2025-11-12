import { useMemo } from "react";
import { parseUnits } from "viem";

type BaseCol = { address: string; symbol: string; decimals: number; rawBalance: bigint; balance: number };

export type Selected = BaseCol & {
  lower: string;
  amountRaw: bigint;      // parsed from string input
  isMax: boolean;         // max button or equals full balance
};

export function useSelectedCollaterals(
  addedCollaterals: Record<string, string>,
  collateralIsMaxMap: Record<string, boolean>,
  collaterals: BaseCol[],
  toProtocol: string,
  debtTokenAddress: string,
) {
  return useMemo<Selected[]>(() => {
    const lowerDebt = debtTokenAddress.toLowerCase();
    return Object.entries(addedCollaterals)
      .map(([addr, amt]) => {
        const lower = (addr ?? "").toLowerCase();
        const col = collaterals.find(c => c.address.toLowerCase() === lower);
        if (!col) return null;
        // For Vesu/V2 targets skip debt token as collateral
        if (toProtocol === "Vesu" || toProtocol === "VesuV2") {
          if (lower === lowerDebt) return null;
        }
        const amountRaw = parseUnits(amt || "0", col.decimals ?? 18);
        const clickedMax = collateralIsMaxMap[lower] === true;
        const isMax = clickedMax || amountRaw === col.rawBalance;
        return { ...col, lower, amountRaw, isMax };
      })
      .filter((x): x is Selected => !!x);
  }, [addedCollaterals, collateralIsMaxMap, collaterals, toProtocol, debtTokenAddress]);
}

