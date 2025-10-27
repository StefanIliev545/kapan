"use client";

import BorrowProtocolMini from "./BorrowProtocolMini";

const BorrowDemo = () => {
  return (
    <div className="mt-6 md:mt-8">
      <BorrowProtocolMini
        protocolName="Aave"
        protocolIcon="/logos/aave.svg"
        networkType="evm"
        supplies={[
          { icon: "/logos/usdc.svg", name: "USDC", tokenAddress: "0xa0b8...", tokenPrice: 100000000n, tokenDecimals: 6, balance: 12000, tokenBalance: BigInt(12000 * 10 ** 6), currentRate: 3.4 },
          { icon: "/logos/usdt.svg", name: "USDT", tokenAddress: "0xdAC1...", tokenPrice: 100000000n, tokenDecimals: 6, balance: 7500, tokenBalance: BigInt(7500 * 10 ** 6), currentRate: 3.1 },
          { icon: "/logos/dai.svg", name: "DAI", tokenAddress: "0x6B17...", tokenPrice: 100000000n, tokenDecimals: 18, balance: 500, tokenBalance: BigInt(500 * 10 ** 18), currentRate: 2.9 },
        ]}
        borrows={[
          {
            token: {
              icon: "/logos/usdt.svg",
              name: "USDT",
              tokenAddress: "0xdAC1...",
              tokenPrice: 100000000n,
              tokenDecimals: 6,
              balance: 800,
              tokenBalance: BigInt(800 * 10 ** 6),
              currentRate: 4.9,
            },
            best: { protocol: "Aave", rate: 4.9 },
          },
          {
            token: {
              icon: "/logos/weth.svg",
              name: "ETH",
              tokenAddress: "0xeeee...",
              tokenPrice: 320000000000n,
              tokenDecimals: 18,
              balance: 2.1 * 3200,
              tokenBalance: BigInt(2.1 * 10 ** 18),
              currentRate: 3.1,
            },
            best: { protocol: "Compound", rate: 2.6 },
          },
          {
            token: {
              icon: "/logos/wbtc.svg",
              name: "BTC",
              tokenAddress: "0xbbbb...",
              tokenPrice: 6700000000000n,
              tokenDecimals: 8,
              balance: 0.25 * 67000,
              tokenBalance: BigInt(0.25 * 10 ** 8),
              currentRate: 2.8,
            },
            best: { protocol: "Aave", rate: 2.2 },
          },
          {
            token: {
              icon: "/logos/wsteth.svg",
              name: "wstETH",
              tokenAddress: "0xws...",
              tokenPrice: 340000000000n,
              tokenDecimals: 18,
              balance: 1.6 * 3400,
              tokenBalance: BigInt(1.6 * 10 ** 18),
              currentRate: 2.1,
            },
            best: { protocol: "Compound", rate: 1.8 },
          },
          {
            token: {
              icon: "/logos/reth.svg",
              name: "rETH",
              tokenAddress: "0xre...",
              tokenPrice: 340000000000n,
              tokenDecimals: 18,
              balance: 1.2 * 3400,
              tokenBalance: BigInt(1.2 * 10 ** 18),
              currentRate: 2.0,
            },
            best: { protocol: "Aave", rate: 1.6 },
          },
        ]}
      />
    </div>
  );
};

export default BorrowDemo;


