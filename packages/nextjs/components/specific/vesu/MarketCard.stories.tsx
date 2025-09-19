import type { Meta, StoryObj } from "@storybook/react";
import { MarketCard, type MarketCardProps } from "./MarketCard";

const mockRates = (protocol: string) => ({
  supply: [protocol === "Vesu" ? "Aave" : protocol, BigInt(4_820_000_000)],
  borrow: [protocol === "Vesu" ? "Compound" : protocol, BigInt(3_950_000_000)],
});

const meta: Meta<MarketCardProps> = {
  title: "Markets/MarketCard",
  component: MarketCard,
  parameters: {
    layout: "centered",
    storybookMocks: {
      useNetworkAwareReadContract: ({ functionName, args }) => {
        const protocol = "Vesu";
        const rates = mockRates(protocol);
        const payload = functionName === "findOptimalSupplyRate" ? rates.supply : rates.borrow;
        return {
          data: payload,
          isLoading: false,
          isFetching: false,
          error: undefined,
          status: "success",
          refetch: async () => ({ data: payload }),
        };
      },
    },
  },
  args: {
    icon: "/logos/strk.svg",
    name: "STRK",
    supplyRate: "4.82%",
    borrowRate: "3.95%",
    price: "1.21",
    utilization: "57",
    address: "0x051fcafe",
    networkType: "evm",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHighUtilization: Story = {
  args: {
    supplyRate: "7.35%",
    borrowRate: "6.18%",
    utilization: "83",
    price: "2.05",
  },
};

export const WithAltAsset: Story = {
  args: {
    icon: "/logos/usdc.svg",
    name: "USDC",
    supplyRate: "2.12%",
    borrowRate: "3.45%",
    price: "1.00",
    utilization: "48",
  },
};
