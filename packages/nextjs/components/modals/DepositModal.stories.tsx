import type { Meta, StoryObj } from "@storybook/react";
import { DepositModal } from "./DepositModal";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "USDC",
  icon: "/logos/usdc.svg",
  address: "0x000000000000000000000000000000000000usdc",
  currentRate: 4.82,
  usdPrice: 1,
  decimals: 6,
};

const noop = () => {};

const meta: Meta<typeof DepositModal> = {
  title: "Modals/DepositModal",
  component: DepositModal,
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
      balance: 750_000n * 10n ** 6n, // 750k USDC with 6 decimals
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
  },
  parameters: {
    storybookMocks,
  },
};

export const WithExistingPosition: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    token: sampleToken,
    protocolName: "Vesu",
    position: new PositionManager(25_000, 7_500),
  },
  parameters: {
    storybookMocks,
  },
};
