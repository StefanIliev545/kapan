import type { Meta, StoryObj } from "@storybook/react";
import { parseUnits } from "viem";
import { CollateralSelector } from "./CollateralSelector";
import type { CollateralToken, CollateralWithAmount } from "./CollateralSelector";

const createCollateral = (
  symbol: CollateralToken["symbol"],
  address: CollateralToken["address"],
  decimals: CollateralToken["decimals"],
  balance: number,
  supported: boolean,
): CollateralToken => ({
  symbol,
  address,
  decimals,
  balance,
  rawBalance: parseUnits(balance.toString(), decimals),
  supported,
});

const strk = createCollateral("STRK", "0x00000000000000000000000000000000000000a1", 18, 425.72, true);
const usdc = createCollateral("USDC", "0x00000000000000000000000000000000000000b2", 6, 1289.45, true);
const eth = createCollateral("ETH", "0x00000000000000000000000000000000000000c3", 18, 0.32, false);
const usdt = createCollateral("USDT", "0x00000000000000000000000000000000000000d4", 6, 0, true);

const withAmount = (token: CollateralToken, amount: string): CollateralWithAmount => ({
  token: token.address,
  amount: parseUnits(amount, token.decimals),
  symbol: token.symbol,
  decimals: token.decimals,
  maxAmount: token.rawBalance,
  supported: token.supported,
});

const meta: Meta<typeof CollateralSelector> = {
  title: "Collateral/CollateralSelector",
  component: CollateralSelector,
  parameters: {
    layout: "centered",
  },
  args: {
    onCollateralSelectionChange: (selection: CollateralWithAmount[]) => {
      console.info("Selection updated", selection.map(item => ({ token: item.symbol, amount: item.amount.toString() })));
    },
    onMaxClick: (token: string, maxAmount: bigint, formatted: string) => {
      console.info(`Max clicked for ${token}`, maxAmount.toString(), formatted);
    },
    marketToken: "0x1111111111111111111111111111111111111111",
    selectedProtocol: "Vesu",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const defaultCollaterals = [strk, usdc, eth, usdt];

export const Default: Story = {
  args: {
    collaterals: defaultCollaterals,
    isLoading: false,
    initialSelectedCollaterals: [
      withAmount(strk, "120"),
      withAmount(usdc, "450"),
    ],
  },
};

export const Loading: Story = {
  args: {
    collaterals: defaultCollaterals,
    isLoading: true,
    initialSelectedCollaterals: [],
  },
};

export const NoCollateral: Story = {
  args: {
    collaterals: [],
    isLoading: false,
    initialSelectedCollaterals: [],
  },
};

export const AmountsHidden: Story = {
  args: {
    collaterals: defaultCollaterals,
    isLoading: false,
    hideAmounts: true,
    initialSelectedCollaterals: [withAmount(usdc, "300")],
  },
};
