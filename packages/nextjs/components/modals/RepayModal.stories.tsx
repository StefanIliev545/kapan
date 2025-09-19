import type { Meta, StoryObj } from "@storybook/react";
import { RepayModal } from "./RepayModal";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "DAI",
  icon: "/logos/dai.svg",
  address: "0x000000000000000000000000000000000000dai",
  currentRate: 6.2,
  usdPrice: 1,
  decimals: 18,
};

const meta: Meta<typeof RepayModal> = {
  title: "Modals/RepayModal",
  component: RepayModal,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const debtBalance = 3n * 10n ** 18n; // 3 DAI debt

const noop = () => {};

const storybookMocks = {
  useTokenBalance: ({ tokenAddress, network }: { tokenAddress: string; network: "evm" | "stark" }) => {
    if (network !== "evm" || tokenAddress !== sampleToken.address) return undefined;
    return {
      balance: 8n * 10n ** 18n,
      decimals: 18,
    };
  },
};

export const Default: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
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
    debtBalance,
    position: new PositionManager(12_000, 3_500),
  },
  parameters: {
    storybookMocks,
  },
};
