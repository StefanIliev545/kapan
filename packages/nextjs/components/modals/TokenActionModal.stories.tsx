import type { Meta, StoryObj } from "@storybook/react";
import { TokenActionModal, type TokenActionModalProps } from "./TokenActionModal";
import { PositionManager } from "~~/utils/position";

const meta: Meta<
  Omit<TokenActionModalProps, "balance" | "percentBase" | "max"> & {
    balance: string;
    percentBase?: string;
    max?: string;
  }
> = {
  title: "Modals/TokenActionModal",
  component: TokenActionModal,
  parameters: {
    layout: "centered",
    controls: { exclude: ["balance", "percentBase", "max", "position"] },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const render = (
  args: Story["args"],
  overrides: Partial<TokenActionModalProps> = {},
): JSX.Element => {
  const { balance, percentBase, max, ...rest } = args ?? {};

  return (
    <TokenActionModal
      {...(rest as unknown as TokenActionModalProps)}
      {...overrides}
      balance={balance ? BigInt(balance) : 0n}
      percentBase={percentBase ? BigInt(percentBase) : undefined}
      max={max ? BigInt(max) : undefined}
    />
  );
};

export const Deposit: Story = {
  args: {
    isOpen: true,
    action: "Deposit",
    apyLabel: "Supply APY",
    apy: 4.82,
    token: {
      name: "STRK",
      icon: "/logos/strk.svg",
      address: "0x051f...cafe",
      currentRate: 4.82,
      usdPrice: 1.21,
      decimals: 18,
    },
    protocolName: "Vesu",
    metricLabel: "Total supplied",
    before: 1.75,
    balance: "500000000000000000000", // 500 STRK
    network: "evm",
  },
  render: args => render(args, {
    onConfirm: async amount => {
      // Simulate a lightweight async confirmation for Storybook interactions
      await new Promise(resolve => setTimeout(resolve, 600));
      console.info(`Confirmed deposit of ${amount} STRK`);
    },
  }),
};

export const Borrow: Story = {
  args: {
    isOpen: true,
    action: "Borrow",
    apyLabel: "Borrow APR",
    apy: 5.6,
    token: {
      name: "USDC",
      icon: "/logos/usdc.svg",
      address: "0x0usdc",
      currentRate: 5.6,
      usdPrice: 1,
      decimals: 6,
    },
    protocolName: "Vesu",
    metricLabel: "Borrowed",
    before: 2500,
    balance: "0",
    percentBase: "1000000000", // 1000 USDC
    max: "1000000000",
    network: "evm",
    position: new PositionManager(3000, 1200),
  },
  render: args => render(args, {
    onConfirm: async (amount, isMax) => {
      await new Promise(resolve => setTimeout(resolve, 400));
      console.info(`Borrow request: ${amount} USDC${isMax ? " (max)" : ""}`);
    },
  }),
};

export const RepaySuccess: Story = {
  args: {
    isOpen: true,
    action: "Repay",
    apyLabel: "Borrow APR",
    apy: 3.4,
    token: {
      name: "ETH",
      icon: "/logos/eth.svg",
      address: "0xeth",
      currentRate: 3.4,
      usdPrice: 3300,
      decimals: 18,
    },
    protocolName: "Vesu",
    metricLabel: "Outstanding debt",
    before: 1.85,
    balance: "750000000000000000", // 0.75 ETH
    network: "evm",
  },
  render: args => render(args, {
    onConfirm: async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      console.info("Repay flow finished");
    },
  }),
};
