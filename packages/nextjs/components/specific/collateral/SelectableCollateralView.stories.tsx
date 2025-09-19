import type { Meta, StoryObj } from "@storybook/react";
import { SelectableCollateralView } from "./SelectableCollateralView";

const meta: Meta<typeof SelectableCollateralView> = {
  title: "Collateral/SelectableCollateralView",
  component: SelectableCollateralView,
  parameters: {
    layout: "centered",
  },
  args: {
    onCollateralToggle: (symbol: string) => {
      console.info(`Toggled ${symbol}`);
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const baseCollaterals = [
  { symbol: "STRK", balance: 425.72, address: "0x00000000000000000000000000000000000000a1", decimals: 18 },
  { symbol: "USDC", balance: 1289.45, address: "0x00000000000000000000000000000000000000b2", decimals: 6 },
  { symbol: "ETH", balance: 0.32, address: "0x00000000000000000000000000000000000000c3", decimals: 18 },
  { symbol: "USDT", balance: 0, address: "0x00000000000000000000000000000000000000d4", decimals: 6 },
];

export const Default: Story = {
  args: {
    collaterals: baseCollaterals,
  },
};

export const WithSelections: Story = {
  args: {
    collaterals: baseCollaterals.map((collateral, index) => ({
      ...collateral,
      selected: index % 2 === 0,
    })),
  },
};
