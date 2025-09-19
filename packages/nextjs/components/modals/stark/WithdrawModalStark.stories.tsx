import type { Meta, StoryObj } from "@storybook/react";
import { WithdrawModalStark } from "./WithdrawModalStark";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "ETH",
  icon: "/logos/eth.svg",
  address: "0x0ethstark",
  currentRate: 3.1,
  usdPrice: 3200,
  decimals: 18,
};

const vesuContext: VesuContext = {
  poolId: 1n,
  counterpartToken: "0x0usdcstark",
};

const meta: Meta<typeof WithdrawModalStark> = {
  title: "Modals/Stark/WithdrawModalStark",
  component: WithdrawModalStark,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const supplyBalance = 6n * 10n ** 18n; // 6 ETH supplied

const noop = () => {};

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    vesuContext,
    supplyBalance,
  },
};

export const WithPositionContext: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    vesuContext,
    supplyBalance,
    position: new PositionManager(24_000, 6_400),
  },
};
