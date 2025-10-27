"use client";

import { Flex, Text } from "@radix-ui/themes";
import DataCycle from "../../ui/DataCycle";
import MovePositionDemoCard from "./MovePositionDemoCard";

const RefinanceDemo = () => {
  const cycles = [
    {
      from: { name: "Nostra", icon: "/logos/nostra.svg" },
      to: { name: "Vesu", icon: "/logos/vesu.svg" },
      collateral: { icon: "/logos/usdc.svg", name: "USDC", amount: "12,000.00", usd: 12000 },
      debt: { icon: "/logos/usdt.svg", name: "USDT", amount: "8,000.00", usd: 8000 },
    },
    {
      from: { name: "Vesu", icon: "/logos/vesu.svg" },
      to: { name: "VesuV2", icon: "/logos/vesu_full.svg" },
      collateral: { icon: "/logos/usdc.svg", name: "USDC", amount: "12,000.00", usd: 12000 },
      debt: { icon: "/logos/usdt.svg", name: "USDT", amount: "7,500.00", usd: 7500 },
    },
    {
      from: { name: "VesuV2", icon: "/logos/vesu_full.svg" },
      to: { name: "Vesu", icon: "/logos/vesu.svg" },
      collateral: { icon: "/logos/dai.svg", name: "DAI", amount: "500.00", usd: 500 },
      debt: { icon: "/logos/usdt.svg", name: "USDT", amount: "8,200.00", usd: 8200 },
    },
  ];

  return (
    <div className="mt-6 md:mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start md:items-center">
        <DataCycle items={cycles} intervalMs={3500} animation="slideX" render={(c) => (
          <MovePositionDemoCard from={c.from} to={c.to} collateral={c.collateral} debt={c.debt} />
        )} />

        <div className="md:pl-4">
          <Text size="4" wrap="pretty" align="center" className="text-base-content/80 max-w-2xl mx-auto">
            Refinance between protocols and vesu pools without closing positions or bringing extra capital. Move collateral and debt atomically to optimize rates.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default RefinanceDemo;


