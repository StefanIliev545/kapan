import type { Meta, StoryObj } from "@storybook/react";
import { MarketRow } from "./MarketRow";

const meta: Meta<typeof MarketRow> = {
  title: "Markets/MarketRow",
  component: MarketRow,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const createReadResult = (protocol: string, rate: bigint) => ({
  data: [protocol, rate] as const,
  isLoading: false,
  isFetching: false,
  error: undefined,
  refetch: async () => ({ data: [protocol, rate] } as unknown),
});

export const EvmMarket: Story = {
  args: {
    icon: "/logos/usdc.svg",
    name: "USDC",
    supplyRate: "4.6%",
    borrowRate: "5.8%",
    price: "1.00",
    utilization: "63",
    address: "0xusdc",
    networkType: "evm",
    protocol: "Aave",
  },
  parameters: {
    storybookMocks: {
      useNetworkAwareReadContract: ({ functionName }: { functionName: string }) => {
        if (functionName === "findOptimalSupplyRate") {
          return createReadResult("Compound", 5_200_000_000n);
        }
        if (functionName === "findOptimalBorrowRate") {
          return createReadResult("Spark", 6_100_000_000n);
        }
        return undefined;
      },
    },
  },
};

export const StarknetMarket: Story = {
  args: {
    icon: "/logos/strk.svg",
    name: "STRK",
    supplyRate: "6.1%",
    borrowRate: "7.4%",
    price: "1.32",
    utilization: "71",
    address: "0xstrk",
    networkType: "starknet",
    protocol: "Vesu",
    allowDeposit: true,
  },
};
