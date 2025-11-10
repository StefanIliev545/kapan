// PortfolioHeader.tsx
import { FC, useMemo } from "react";
import { ProtocolPosition } from "../ProtocolView";

type PortfolioHeaderProps = {
  protocols: Array<{
    suppliedPositions: ProtocolPosition[];
    borrowedPositions: ProtocolPosition[];
  }>;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(amount);

export const PortfolioHeader: FC<PortfolioHeaderProps> = ({ protocols }) => {
  const { totalSupplied, totalBorrowed, netBalance, utilizationPct } = useMemo(() => {
    let supplied = 0;
    let borrowedAbs = 0;
    let collateral = 0;

    for (const p of protocols) {
      supplied += p.suppliedPositions.reduce((a, x) => a + x.balance, 0);
      borrowedAbs += p.borrowedPositions.reduce((a, x) => a + Math.abs(x.balance), 0);
      collateral += p.borrowedPositions.reduce((a, x) => a + (x.collateralValue || 0), 0);
    }

    const totalSupplied = supplied;
    const totalBorrowed = borrowedAbs;
    const netBalance = supplied + collateral - borrowedAbs;

    // If nothing supplied, fall back to collateral for utilization baseline (like your ProtocolView)
    const baseline = totalSupplied > 0 ? totalSupplied : collateral;
    const utilizationPct = baseline > 0 ? (totalBorrowed / baseline) * 100 : 0;

    return { totalSupplied, totalBorrowed, netBalance, utilizationPct };
  }, [protocols]);

  const barWidth = Math.max(0, Math.min(100, utilizationPct));

  return (
    <div className="w-full card bg-base-100 shadow-lg rounded-lg mb-4">
      <div className="card-body p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="opacity-70">Total Supplied:</span>
              <span className="font-semibold">{formatCurrency(totalSupplied)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="opacity-70">Total Borrowed:</span>
              <span className="font-semibold">{formatCurrency(totalBorrowed)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="opacity-70">Net Balance:</span>
              <span className={`font-semibold ${netBalance >= 0 ? "text-success" : "text-error"}`}>
                {formatCurrency(netBalance)}
              </span>
            </span>
          </div>

          {/* Portfolio Utilization */}
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-70">Portfolio Utilization</span>
            <div className="w-40 h-1.5 bg-base-300 rounded-full overflow-hidden">
              <div
                className={`h-full ${barWidth < 50 ? "bg-success" : barWidth < 70 ? "bg-warning" : "bg-error"}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-xs font-medium">{barWidth.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
