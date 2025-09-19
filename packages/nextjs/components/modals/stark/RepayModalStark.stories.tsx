import type { Meta, StoryObj } from "@storybook/react";
import { RepayModalStark } from "./RepayModalStark";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "USDT",
  icon: "/logos/usdt.svg",
  address: "0x0usdtstark",
  currentRate: 5.1,
  usdPrice: 1,
  decimals: 6,
};

const vesuContext: VesuContext = {
  poolId: 1n,
  counterpartToken: "0x0ethstark",
};

const meta: Meta<typeof RepayModalStark> = {
  title: "Modals/Stark/RepayModalStark",
  component: RepayModalStark,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const debtBalance = 2_500n * 10n ** 6n; // 2,500 USDT debt

const noop = () => {};

const storybookMocks = {
  useTokenBalance: ({ tokenAddress, network }: { tokenAddress: string; network: "evm" | "stark" }) => {
    if (network !== "stark" || tokenAddress !== sampleToken.address) return undefined;
    return {
      balance: 8_000n * 10n ** 6n,
      decimals: 6,
    };
  },
};

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    vesuContext,
    debtBalance,
  },
  parameters: {
    storybookMocks,
  },
};

export const WithPositionContext: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    vesuContext,
    debtBalance,
    position: new PositionManager(19_000, 4_800),
  },
  parameters: {
    storybookMocks,
  },
};
