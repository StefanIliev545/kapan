"use client";

import Image from "next/image";

/**
 * Dashboard preview for landing page - simplified mock cards
 * that look like the real ProtocolView but without the complex state
 */

const MockPosition = ({ 
  icon, 
  name, 
  balance, 
  rate, 
  isDebt = false 
}: { 
  icon: string; 
  name: string; 
  balance: string; 
  rate: string; 
  isDebt?: boolean;
}) => (
  <div className="flex items-center justify-between py-3 px-4 bg-base-200/30 rounded">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 relative">
        <Image src={icon} alt={name} fill className="object-contain" />
      </div>
      <div>
        <div className="text-sm font-medium text-base-content">{name}</div>
        <div className={`text-xs ${isDebt ? "text-error/70" : "text-success/70"}`}>
          {rate} APY
        </div>
      </div>
    </div>
    <div className={`text-right ${isDebt ? "text-error/80" : "text-base-content/80"}`}>
      <div className="text-sm font-semibold">{isDebt ? "-" : ""}{balance}</div>
    </div>
  </div>
);

const MockProtocolCard = ({
  name,
  icon,
  balance,
  netApy,
  utilization,
  supplies,
  borrows,
  className = "",
}: {
  name: string;
  icon: string;
  balance: string;
  netApy: string;
  utilization: number;
  supplies: Array<{ icon: string; name: string; balance: string; rate: string }>;
  borrows: Array<{ icon: string; name: string; balance: string; rate: string }>;
  className?: string;
}) => (
  <div className={`bg-base-200/20 border border-base-content/10 rounded-lg overflow-hidden ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-base-content/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 relative">
            <Image src={icon} alt={name} fill className="object-contain" />
          </div>
          <div>
            <div className="text-xs text-base-content/40 uppercase tracking-wider">Protocol</div>
            <div className="text-lg font-bold text-base-content">{name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-base-content/40 uppercase tracking-wider">Balance</div>
          <div className="text-lg font-bold text-success">{balance}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-base-content/40">Net APY </span>
          <span className="text-success font-medium">{netApy}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base-content/40">Utilization</span>
          <div className="w-16 h-1.5 bg-base-content/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-success rounded-full" 
              style={{ width: `${utilization}%` }} 
            />
          </div>
          <span className="text-success font-medium">{utilization}%</span>
        </div>
      </div>
    </div>

    {/* Positions */}
    <div className="p-4 space-y-4">
      {/* Supplied */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-4 bg-success rounded-full" />
          <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Supplied</span>
          <span className="text-xs px-2 py-0.5 bg-success/10 text-success rounded">{supplies.length} {supplies.length === 1 ? "Asset" : "Assets"}</span>
        </div>
        <div className="space-y-2">
          {supplies.map((s, i) => (
            <MockPosition key={i} {...s} />
          ))}
        </div>
      </div>

      {/* Borrowed */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-4 bg-error rounded-full" />
          <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Borrowed</span>
          <span className="text-xs px-2 py-0.5 bg-error/10 text-error rounded">{borrows.length} {borrows.length === 1 ? "Asset" : "Assets"}</span>
        </div>
        <div className="space-y-2">
          {borrows.map((b, i) => (
            <MockPosition key={i} {...b} isDebt />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const DashboardPreview = () => {
  return (
    <div className="relative w-full max-w-5xl mx-auto px-4">
      {/* Two cards side by side with perspective */}
      <div className="flex flex-col lg:flex-row gap-6 justify-center items-stretch">
        {/* Aave card */}
        <div className="relative flex-1 max-w-lg">
          <MockProtocolCard
            name="Aave"
            icon="/logos/aave.svg"
            balance="$16,650.80"
            netApy="1.39%"
            utilization={25}
            supplies={[
              { icon: "/logos/eth.svg", name: "ETH", balance: "$12,450.80", rate: "2.40%" },
              { icon: "/logos/wsteth.svg", name: "wstETH", balance: "$4,200.00", rate: "1.80%" },
            ]}
            borrows={[
              { icon: "/logos/usdc.svg", name: "USDC", balance: "$4,200.00", rate: "5.20%" },
            ]}
          />
          {/* Fade to right on desktop */}
          <div className="hidden lg:block absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-base-100 pointer-events-none" />
          {/* Fade to bottom */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-base-100 to-transparent pointer-events-none" />
        </div>

        {/* Compound card - hidden on mobile */}
        <div className="relative flex-1 max-w-lg hidden lg:block">
          <MockProtocolCard
            name="Compound"
            icon="/logos/compound.svg"
            balance="$21,200.00"
            netApy="3.15%"
            utilization={18}
            supplies={[
              { icon: "/logos/usdc.svg", name: "USDC", balance: "$25,000.00", rate: "4.10%" },
            ]}
            borrows={[
              { icon: "/logos/weth.svg", name: "WETH", balance: "$3,800.00", rate: "3.80%" },
            ]}
          />
          {/* Fade to left */}
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-l from-transparent to-base-100 pointer-events-none" />
          {/* Fade to bottom */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-base-100 to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
};

export default DashboardPreview;
