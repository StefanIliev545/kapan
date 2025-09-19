import type { Meta, StoryObj } from "@storybook/react";
import { WithdrawModal } from "./WithdrawModal";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "USDT",
  icon: "/logos/usdt.svg",
  address: "0x000000000000000000000000000000000000usdt",
  currentRate: 3.9,
  usdPrice: 1,
  decimals: 6,
};

const meta: Meta<typeof WithdrawModal> = {
  title: "Modals/WithdrawModal",
  component: WithdrawModal,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const supplyBalance = 125_000n * 10n ** 6n; // 125k tokens with 6 decimals

const noop = () => {};

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    supplyBalance,
  },
};

export const WithPositionContext: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    supplyBalance,
    position: new PositionManager(42_000, 8_750),
  },
};
