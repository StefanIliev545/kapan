"use client";

import { Card, Heading, Text } from "@radix-ui/themes";
import { BorrowPosition } from "../../BorrowPosition";
import DataCycle from "../../ui/DataCycle";

const OverviewDemo = () => {
  return (
    <div className="mt-6 md:mt-8 text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start md:items-center">
        <div className="flex flex-col gap-4 md:gap-5 justify-center">
          <Card className="bg-base-100 text-base-content border border-base-300" size="1" variant="classic">
            <DataCycle
              intervalMs={3500}
              animation="slideX"
              items={[
                [
                  { icon: "/logos/usdc.svg", name: "USDC", balance: -1200, tokenBalance: BigInt(1200 * 10 ** 6), rate: 5.2, optimal: { protocol: "Compound", rate: 3.8 }, address: "0xa0b8...", decimals: 6 },
                  { icon: "/logos/usdt.svg", name: "USDT", balance: -800, tokenBalance: BigInt(800 * 10 ** 6), rate: 4.9, optimal: { protocol: "Aave", rate: 4.9 }, address: "0xdAC1...", decimals: 6 },
                ],
                [
                  { icon: "/logos/weth.svg", name: "ETH", balance: -2.1, tokenBalance: BigInt(2.1 * 10 ** 18), rate: 3.1, optimal: { protocol: "Compound", rate: 2.6 }, address: "0xeeee...", decimals: 18 },
                  { icon: "/logos/wbtc.svg", name: "BTC", balance: -0.25, tokenBalance: BigInt(0.25 * 10 ** 8), rate: 2.8, optimal: { protocol: "Aave", rate: 2.2 }, address: "0xbbbb...", decimals: 8 },
                ],
                [
                  { icon: "/logos/wsteth.svg", name: "wstETH", balance: -1.6, tokenBalance: BigInt(1.6 * 10 ** 18), rate: 2.1, optimal: { protocol: "Compound", rate: 1.8 }, address: "0xws...", decimals: 18 },
                  { icon: "/logos/reth.svg", name: "rETH", balance: -1.2, tokenBalance: BigInt(1.2 * 10 ** 18), rate: 2.0, optimal: { protocol: "Aave", rate: 1.6 }, address: "0xre...", decimals: 18 },
                ],
              ]}
              render={(pair) => (
                <div className="grid grid-cols-1 gap-3 p-1">
                  {pair.map(t => (
                    <BorrowPosition
                      key={t.name}
                      icon={t.icon}
                      name={t.name}
                      balance={-Math.abs(t.balance)}
                      tokenBalance={t.tokenBalance}
                      currentRate={t.rate}
                      protocolName="Aave"
                      tokenAddress={t.address}
                      tokenPrice={100000000n}
                      tokenDecimals={t.decimals}
                      networkType="evm"
                      availableActions={{ borrow: false, repay: false, move: false, close: false, swap: false }}
                      actionsDisabled
                      suppressDisabledMessage
                      demoOptimalOverride={{ protocol: t.optimal.protocol, rate: t.optimal.rate }}
                    />
                  ))}
                </div>
              )}
            />
          </Card>
        </div>
        <div className="md:pr-4">
          <Text size="4" wrap="pretty" align="center" className="text-base-content/80 max-w-2xl mx-auto">
            With Kapan you can view your positions across protocols and find how the interest rates compare.
            No need to switch between tabs and manually figure out the best opportunity. Kapan contracts are non custodial and reroute to the underlying protocol. This means anything
            you do on Kapan is also visible on the protocol&apos;s front end itself.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default OverviewDemo;


