import type { Meta, StoryObj } from "@storybook/react";
import { parseUnits } from "viem";
import { CollateralAmounts } from "./CollateralAmounts";
import type { CollateralWithAmount } from "./CollateralSelector";

const createCollateral = (
  symbol: string,
  address: string,
  decimals: number,
  max: string,
  amount: string,
  supported = true,
): CollateralWithAmount => ({
  token: address,
  symbol,
  decimals,
  maxAmount: parseUnits(max, decimals),
  amount: parseUnits(amount, decimals),
  supported,
});

const meta: Meta<typeof CollateralAmounts> = {
  title: "Collateral/CollateralAmounts",
  component: CollateralAmounts,
  parameters: {
    layout: "centered",
  },
  args: {
    onChange: (updated: CollateralWithAmount[]) => {
      console.info("Amounts changed", updated.map(item => ({ token: item.symbol, amount: item.amount.toString() })));
    },
    onMaxClick: (token: string, isMax: boolean) => {
      console.info(`Max ${isMax ? "set" : "cleared"} for ${token}`);
    },
    selectedProtocol: "Vesu",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const defaultSelection: CollateralWithAmount[] = [
  {
    ...createCollateral("STRK", "0x00000000000000000000000000000000000000a1", 18, "425.72", "125"),
    inputValue: "125",
  },
  {
    ...createCollateral("USDC", "0x00000000000000000000000000000000000000b2", 6, "1289.45", "320"),
    inputValue: "320",
  },
  {
    ...createCollateral("ETH", "0x00000000000000000000000000000000000000c3", 18, "0.50", "0"),
    supported: false,
  },
];

export const Default: Story = {
  args: {
    collaterals: defaultSelection,
  },
};

export const UnsupportedCollateral: Story = {
  args: {
    collaterals: [
      {
        ...createCollateral("USDT", "0x00000000000000000000000000000000000000d4", 6, "750", "0"),
        supported: false,
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    collaterals: [],
  },
};
