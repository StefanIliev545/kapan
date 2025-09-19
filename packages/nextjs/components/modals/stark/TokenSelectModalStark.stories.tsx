import type { Meta, StoryObj } from "@storybook/react";
import { TokenSelectModalStark } from "./TokenSelectModalStark";
import type { TokenMetadata } from "~~/utils/protocols";

const toFelt = (value: string): bigint => {
  let result = 0n;
  for (const char of value) {
    result = (result << 8n) + BigInt(char.charCodeAt(0));
  }
  return result;
};

const token = (symbol: string, address: number, overrides?: Partial<TokenMetadata>) => ({
  address: BigInt(address),
  symbol: toFelt(symbol),
  decimals: 18,
  rate_accumulator: 0n,
  utilization: 45_000_000_000_000_000n,
  fee_rate: 0n,
  price: { value: 1_000_000_000_000_000_000n, is_valid: true },
  total_nominal_debt: 0n,
  last_rate_accumulator: 0n,
  reserve: 0n,
  scale: 1_000_000_000_000_000_000n,
  ...overrides,
});

const baseTokens = [
  {
    ...token("STRK", 0x01, {
      price: { value: 1_200_000_000_000_000_000n, is_valid: true },
    }),
    borrowAPR: 0.045,
    supplyAPY: 0.032,
  },
  {
    ...token("ETH", 0x02, {
      price: { value: 3_300_000_000_000_000_000n, is_valid: true },
    }),
    borrowAPR: 0.061,
    supplyAPY: 0.042,
  },
  {
    ...token("USDC", 0x03, {
      price: { value: 1_000_000_000_000_000_000n, is_valid: true },
      decimals: 6,
    }),
    borrowAPR: 0.039,
    supplyAPY: 0.021,
  },
  {
    ...token("DAI", 0x04, {
      price: { value: 1_000_000_000_000_000_000n, is_valid: true },
    }),
    borrowAPR: 0.041,
    supplyAPY: 0.025,
  },
];

const meta = {
  title: "Modals/TokenSelectModalStark",
  component: TokenSelectModalStark,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onClose: () => undefined,
    protocolName: "Vesu",
    tokens: baseTokens,
  },
} satisfies Meta<typeof TokenSelectModalStark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Borrow: Story = {
  args: {
    action: "borrow",
  },
};

export const Deposit: Story = {
  args: {
    action: "deposit",
  },
};

export const WithoutCollateralAsset: Story = {
  args: {
    action: "borrow",
    collateralAsset: `0x${BigInt(0x02).toString(16).padStart(64, "0")}`,
  },
};
