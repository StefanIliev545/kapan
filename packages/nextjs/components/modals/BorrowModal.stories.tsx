import type { Meta, StoryObj } from "@storybook/react";
import { BorrowModal } from "./BorrowModal";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "ETH",
  icon: "/logos/eth.svg",
  address: "0x000000000000000000000000000000000000000e",
  currentRate: 5.4,
  usdPrice: 3200,
  decimals: 18,
};

const noop = () => {};

const meta: Meta<typeof BorrowModal> = {
  title: "Modals/BorrowModal",
  component: BorrowModal,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const storybookMocks = {
  useTokenBalance: ({ tokenAddress, network }: { tokenAddress: string; network: "evm" | "stark" }) => {
    if (network !== "evm" || tokenAddress !== sampleToken.address) return undefined;
    return {
      balance: 0n,
      decimals: 18,
    };
  },
};

export const NewBorrow: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    currentDebt: 0,
  },
  parameters: {
    storybookMocks,
  },
};

export const ManagingDebt: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    currentDebt: 2.5,
    position: new PositionManager(18_000, 5_500),
  },
  parameters: {
    storybookMocks,
  },
};
