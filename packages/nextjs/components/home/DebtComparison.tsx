import Image from "next/image";
import Link from "next/link";
import { FiTrendingDown, FiArrowRight } from "react-icons/fi";
import { MockData } from "../../types/mockData";

interface DebtComparisonProps {
  mockData: MockData;
  savingsPercentage: string;
}

const formatCurrency = (value: number): string => {
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

const DebtComparison = ({ mockData, savingsPercentage }: DebtComparisonProps) => {
  // Calculate annual interest for both protocols
  const aaveAnnualInterest = Math.round(mockData.aaveDebt * (mockData.aaveRate / 100));
  const compoundAnnualInterest = Math.round(mockData.aaveDebt * (mockData.compoundRate / 100));
  const totalSavings = aaveAnnualInterest - compoundAnnualInterest;

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold mb-6 text-center">Protocol Interest Rate Comparison</h2>
      
      <div className="card bg-base-200 shadow-lg mb-6">
        <div className="card-body p-4">
          <div className="flex items-center gap-6">
            <div className="avatar">
              <div className="w-16 rounded-full bg-base-100 p-2">
                <Image src="/logos/usdc.svg" alt="USDC Logo" width={64} height={64} />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-semibold">Active USDC Debt Position</h3>
                <div className="badge badge-secondary">Aave V3</div>
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold text-primary">{formatCurrency(mockData.aaveDebt)}</div>
                <div className="text-sm font-medium">outstanding debt</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Current Protocol */}
              <div className="flex-1 w-full">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-base-100 p-3 flex items-center justify-center flex-shrink-0">
                    <Image src="/logos/aave.svg" alt="Aave Logo" width={40} height={40} />
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <span className="text-xl font-bold">Aave</span>
                    <div className="badge badge-lg badge-secondary px-3">{mockData.aaveRate}% APR</div>
                  </div>
                </div>
                <div className="text-sm font-medium mb-2">Current Annual Interest</div>
                <div className="text-3xl font-bold text-neutral">{formatCurrency(aaveAnnualInterest)}</div>
              </div>

              {/* Arrow */}
              <div className="hidden md:flex items-center text-base-content/60">
                <FiArrowRight size={32} />
              </div>

              {/* Target Protocol */}
              <div className="flex-1 w-full">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-base-100 p-3 flex items-center justify-center flex-shrink-0">
                    <Image src="/logos/compound.svg" alt="Compound Logo" width={40} height={40} />
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    <span className="text-xl font-bold">Compound</span>
                    <div className="badge badge-lg badge-primary px-3">{mockData.compoundRate}% APR</div>
                  </div>
                </div>
                <div className="text-sm font-medium mb-2">Potential Annual Interest</div>
                <div className="text-3xl font-bold text-primary">{formatCurrency(compoundAnnualInterest)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <div className="flex items-center gap-4">
              <FiTrendingDown className="w-8 h-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-1">Protocol-Wide Annual Savings</h3>
                <div className="text-sm space-y-1 opacity-80">
                  <p>Moving this position to Compound would reduce interest costs by {savingsPercentage}%</p>
                  <p className="text-primary text-lg font-semibold">Total Savings: {formatCurrency(totalSavings)} per year</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Link href="/app" className="w-full">
          <button className="btn btn-primary w-full btn-lg">View Debt Positions</button>
        </Link>
      </div>
    </div>
  );
};

export default DebtComparison; 