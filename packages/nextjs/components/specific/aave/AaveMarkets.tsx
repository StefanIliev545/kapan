import { FC } from "react";
import { MarketsSection, MarketData } from "~~/components/markets/MarketsSection";

const mockMarkets: MarketData[] = [
  {
    icon: "/logos/usdc.svg",
    name: "USDC",
    supplyRate: "0.00%",
    borrowRate: "0.00%",
    price: "1.00",
    utilization: "0",
    address: "0x0",
    networkType: "evm",
    protocol: "aave",
  },
];

export const AaveMarkets: FC = () => {
  return <MarketsSection title="Aave Markets" markets={mockMarkets} />;
};

export default AaveMarkets;
