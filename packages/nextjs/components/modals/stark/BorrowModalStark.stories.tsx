import type { Meta, StoryObj } from "@storybook/react";
import { BorrowModalStark } from "./BorrowModalStark";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "USDC",
  icon: "/logos/usdc.svg",
  address: "0x0usdcstark",
  currentRate: 4.5,
  usdPrice: 1,
  decimals: 6,
};

const noop = () => {};

const vesuContext: VesuContext = {
  poolId: 1n,
  counterpartToken: "0x0strk",
};

const meta: Meta<typeof BorrowModalStark> = {
  title: "Modals/Stark/BorrowModalStark",
  component: BorrowModalStark,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const storybookMocks = {
  useTokenBalance: ({ tokenAddress, network }: { tokenAddress: string; network: "evm" | "stark" }) => {
    if (network !== "stark" || tokenAddress !== sampleToken.address) return undefined;
    return {
      balance: 0n,
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
    currentDebt: 0,
  },
  parameters: {
    storybookMocks,
  },
};

export const WithDebt: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    vesuContext,
    currentDebt: 1.75,
    position: new PositionManager(9_500, 2_300),
  },
  parameters: {
    storybookMocks,
  },
};
