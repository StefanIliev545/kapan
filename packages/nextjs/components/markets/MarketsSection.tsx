import { FC, useMemo, useState } from "react";
import { ListBulletIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
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
  protocol: string;
}

interface MarketsSectionProps {
  title: string;
  markets: MarketData[];
  extra?: React.ReactNode;
}

export const MarketsSection: FC<MarketsSectionProps> = ({ title, markets, extra }) => {
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  const marketItems = useMemo(
    () =>
      markets.map(m =>
        viewMode === "grid" ? <MarketCard key={m.address} {...m} /> : <MarketRow key={m.address} {...m} />,
      ),
    [markets, viewMode],
  );

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body p-4">
        <div className="flex items-center justify-between border-b border-base-200 pb-2 mb-4">
          <h2 className="card-title text-lg">{title}</h2>
          <div className="join">
            <button
              className={`btn btn-xs join-item ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("list")}
              aria-label="List view"
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
            <button
              className={`btn btn-xs join-item ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
          </div>
        </div>
        {extra}
        <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>{marketItems}</div>
      </div>
    </div>
  );
};

export default MarketsSection;
