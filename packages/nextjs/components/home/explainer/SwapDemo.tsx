"use client";

import { Flex, Text } from "@radix-ui/themes";
import DataCycle from "../../ui/DataCycle";
import SwitchCollateralCard from "./SwitchCollateralCard";

const SwapDemo = () => {
  const cycles = [
    [
      {
        sellToken: { name: "USDC", icon: "/logos/usdc.svg", decimals: 6 },
        sellAmount: "1,000.00",
        sellUsd: 1000,
        buyToken: { name: "USDT", icon: "/logos/usdt.svg", decimals: 6 },
        buyAmount: "1,000.00",
        buyUsd: 1000,
        avnuFeeAmount: "0.10",
        avnuFeeUsd: 0.1,
        networkFeeUsd: 0.05,
      },
      {
        sellToken: { name: "USDC", icon: "/logos/usdc.svg", decimals: 6 },
        sellAmount: "1,000.00",
        sellUsd: 1000,
        buyToken: { name: "WBTC", icon: "/logos/wbtc.svg", decimals: 8 },
        buyAmount: "0.0150",
        buyUsd: 1000,
        avnuFeeAmount: "0.05",
        avnuFeeUsd: 0.05,
        networkFeeUsd: 0.04,
      },
      {
        sellToken: { name: "USDC", icon: "/logos/usdc.svg", decimals: 6 },
        sellAmount: "1,000.00",
        sellUsd: 1000,
        buyToken: { name: "ETH", icon: "/logos/weth.svg", decimals: 18 },
        buyAmount: "0.3125",
        buyUsd: 1000,
        avnuFeeAmount: "0.06",
        avnuFeeUsd: 0.06,
        networkFeeUsd: 0.05,
      },
    ],
    [
      {
        sellToken: { name: "USDT", icon: "/logos/usdt.svg", decimals: 6 },
        sellAmount: "800.00",
        sellUsd: 800,
        buyToken: { name: "WBTC", icon: "/logos/wbtc.svg", decimals: 8 },
        buyAmount: "0.0119",
        buyUsd: 800,
        avnuFeeAmount: "0.08",
        avnuFeeUsd: 0.08,
        networkFeeUsd: 0.06,
      },
      {
        sellToken: { name: "USDT", icon: "/logos/usdt.svg", decimals: 6 },
        sellAmount: "800.00",
        sellUsd: 800,
        buyToken: { name: "ETH", icon: "/logos/weth.svg", decimals: 18 },
        buyAmount: "0.2500",
        buyUsd: 800,
        avnuFeeAmount: "0.06",
        avnuFeeUsd: 0.06,
        networkFeeUsd: 0.05,
      },
      {
        sellToken: { name: "USDT", icon: "/logos/usdt.svg", decimals: 6 },
        sellAmount: "800.00",
        sellUsd: 800,
        buyToken: { name: "USDC", icon: "/logos/usdc.svg", decimals: 6 },
        buyAmount: "800.00",
        buyUsd: 800,
        avnuFeeAmount: "0.07",
        avnuFeeUsd: 0.07,
        networkFeeUsd: 0.05,
      },
    ],
  ];

  return (
    <div className="mt-6 md:mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start md:items-center">
        {/* Left panel cycles through modal-like switch cards only */}
        <DataCycle items={cycles} intervalMs={3500} animation="slideX" render={(options) => (
          <Flex direction={{ initial: "column", md: "row" }} gap="3" className="justify-center">
            <SwitchCollateralCard options={options} />
          </Flex>
        )} />

        {/* Right: copy */}
        <div className="md:pl-4">
          <Text size="4" wrap="pretty" align="center" className="text-base-content/80 max-w-2xl mx-auto">
            Kapan supports swapping collateral and debt asset types inside the protocols without having to close and reopen the positions.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default SwapDemo;


