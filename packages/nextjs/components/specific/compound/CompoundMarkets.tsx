import { FC } from "react";
import { MarketsSection } from "~~/components/markets/MarketsSection";
import { useCompoundMarketData } from "~~/hooks/useCompoundMarketData";

interface CompoundMarketsProps {
  viewMode: "list" | "grid";
  search: string;
  chainId?: number;
}

export const CompoundMarkets: FC<CompoundMarketsProps> = ({ viewMode, search, chainId }) => {
  const markets = useCompoundMarketData({ chainId });

  return <MarketsSection title="Compound Markets" markets={markets} viewMode={viewMode} search={search} />;
};

export default CompoundMarkets;
