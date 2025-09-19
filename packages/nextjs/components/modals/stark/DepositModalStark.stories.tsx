import type { Meta, StoryObj } from "@storybook/react";
import { DepositModalStark } from "./DepositModalStark";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { PositionManager } from "~~/utils/position";

const sampleToken = {
  name: "STRK",
  icon: "/logos/strk.svg",
  address: "0x0123abc",
  currentRate: 7.2,
  usdPrice: 1.8,
  decimals: 18,
};

const noop = () => {};

const vesuContext: VesuContext = {
  poolId: 1n,
  counterpartToken: "0x0counter",
};

const meta: Meta<typeof DepositModalStark> = {
  title: "Modals/Stark/DepositModalStark",
  component: DepositModalStark,
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
      balance: 420n * 10n ** 18n,
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
    vesuContext,
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
    position: new PositionManager(14_000, 3_200),
  },
  parameters: {
    storybookMocks,
  },
};
