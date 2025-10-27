"use client";

import { Card, Text } from "@radix-ui/themes";
import { TokenActionCard } from "../../modals/TokenActionModal";
import DataCycle from "../../ui/DataCycle";

const LendDemo = () => {
  return (
    <div className="mt-6 md:mt-8 text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start md:items-center">
        <div className="flex flex-col gap-4 md:gap-5 justify-center order-2 md:order-1">
          <Card className="bg-base-100 text-base-content border border-base-300" size="1" variant="classic">
            <DataCycle
              intervalMs={3500}
              animation="zoom"
              items={[
                { token: { name: "USDC", icon: "/logos/usdc.svg", address: "0xa0b8...", currentRate: 3.4, usdPrice: 1, decimals: 6 }, apy: 3.4, protocol: "Aave", supplied: 0, balance: BigInt(5000 * 10 ** 6) },
                { token: { name: "ETH", icon: "/logos/weth.svg", address: "0xeeee...", currentRate: 2.9, usdPrice: 3200, decimals: 18 }, apy: 2.9, protocol: "Compound", supplied: 0.0, balance: BigInt(1.25 * 10 ** 18) },
                { token: { name: "WBTC", icon: "/logos/wbtc.svg", address: "0xbbbb...", currentRate: 2.2, usdPrice: 67000, decimals: 8 }, apy: 2.2, protocol: "Aave", supplied: 0.0, balance: BigInt(0.5 * 10 ** 8) },
                { token: { name: "rETH", icon: "/logos/reth.svg", address: "0xre...", currentRate: 3.8, usdPrice: 3400, decimals: 18 }, apy: 3.8, protocol: "Compound", supplied: 0.0, balance: BigInt(0.8 * 10 ** 18) },
              ]}
              render={(d) => (
                <TokenActionCard
                  action="Deposit"
                  apyLabel="Supply APY"
                  apy={d.apy}
                  token={d.token}
                  protocolName={d.protocol}
                  metricLabel="Supplied"
                  before={d.supplied}
                  balance={d.balance}
                  network="evm"
                />
              )}
            />
          </Card>
        </div>
        <div className="md:pl-4 order-1 md:order-2">
          <Text size="4" wrap="pretty" align="center" className="text-base-content/80 max-w-2xl mx-auto">
            You can deposit and withdraw assets into all integrated protocols and preview the impact on
            utilization to effectively manage your LTV.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LendDemo;


