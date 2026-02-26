import { FC, useMemo } from "react";
import { MarketCard } from "./MarketCard";
import { MarketRow } from "./MarketRow";

export interface MarketData {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string;
  networkType: "evm" | "starknet";
  network: "arbitrum" | "base" | "optimism" | "linea" | "starknet" | "ethereum";
  protocol: "aave" | "nostra" | "venus" | "vesu" | "compound" | "morpho" | "euler";
  allowDeposit?: boolean;
  poolName?: string;
  /** Total value locked in USD (for display and sorting) */
  tvlUsd?: number;
  /** External link to market on protocol's app */
  marketUrl?: string;
}

interface MarketsSectionProps {
  title: string;
  markets: MarketData[];
  viewMode: "list" | "grid";
  search: string;
  extra?: React.ReactNode;
}

export const MarketsSection: FC<MarketsSectionProps> = ({ title, markets, viewMode, search, extra }) => {
  const filteredMarkets = useMemo(() => {
    if (!search) return markets;
    const lower = search.toLowerCase();
    return markets.filter(m => m.name.toLowerCase().includes(lower));
  }, [markets, search]);

  const marketItems = useMemo(
    () =>
      filteredMarkets.map(m =>
        viewMode === "grid" ? <MarketCard key={m.address} {...m} /> : <MarketRow key={m.address} {...m} />,
      ),
    [filteredMarkets, viewMode],
  );

  if (filteredMarkets.length === 0) return null;

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <h2 className="card-title mb-4 text-lg">{title}</h2>
        {extra}
        <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
          {marketItems}
        </div>
      </div>
    </div>
  );
};

export default MarketsSection;
