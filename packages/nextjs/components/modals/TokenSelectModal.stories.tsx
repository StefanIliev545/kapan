import type { Meta, StoryObj } from "@storybook/react";
import { TokenSelectModal } from "./TokenSelectModal";
import type { ProtocolPosition } from "../ProtocolView";

const baseTokens: ProtocolPosition[] = [
  {
    icon: "/logos/usdc.svg",
    name: "USDC",
    balance: 18_500,
    tokenBalance: 18_500n * 10n ** 6n,
    currentRate: 4.3,
    tokenAddress: "0xusdc",
    tokenDecimals: 6,
    tokenPrice: 1_00000000n,
    tokenSymbol: "USDC",
  },
  {
    icon: "/logos/usdt.svg",
    name: "USDT",
    balance: 9_750,
    tokenBalance: 9_750n * 10n ** 6n,
    currentRate: 3.9,
    tokenAddress: "0xusdt",
    tokenDecimals: 6,
    tokenPrice: 1_00000000n,
    tokenSymbol: "USDT",
  },
  {
    icon: "/logos/dai.svg",
    name: "DAI",
    balance: 12_200,
    tokenBalance: 12_200n * 10n ** 18n,
    currentRate: 4.7,
    tokenAddress: "0xdai",
    tokenDecimals: 18,
    tokenPrice: 1_00000000n,
    tokenSymbol: "DAI",
  },
  {
    icon: "/logos/wbtc.svg",
    name: "WBTC",
    balance: 65_000,
    tokenBalance: 2n * 10n ** 8n,
    currentRate: 1.1,
    tokenAddress: "0xwbtc",
    tokenDecimals: 8,
    tokenPrice: 65_000_00000000n,
    tokenSymbol: "WBTC",
  },
];

const meta: Meta<typeof TokenSelectModal> = {
  title: "Modals/TokenSelectModal",
  component: TokenSelectModal,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const noop = () => {};

const storybookMocks = {
  useTokenBalance: ({ tokenAddress, network }: { tokenAddress: string; network: "evm" | "stark" }) => {
    if (network !== "evm") return undefined;
    if (tokenAddress === "0xusdc") {
      return { balance: 25_000n * 10n ** 6n, decimals: 6 };
    }
    if (tokenAddress === "0xusdt") {
      return { balance: 12_000n * 10n ** 6n, decimals: 6 };
    }
    if (tokenAddress === "0xdai") {
      return { balance: 15n * 10n ** 18n, decimals: 18 };
    }
    if (tokenAddress === "0xwbtc") {
      return { balance: 3n * 10n ** 8n, decimals: 8 };
    }
    if (tokenAddress === "0xeth") {
      return { balance: 8n * 10n ** 18n, decimals: 18 };
    }
    return undefined;
  },
};

export const SupplyTokens: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    tokens: baseTokens,
    protocolName: "Vesu",
    isBorrow: false,
  },
  parameters: {
    storybookMocks,
  },
};

const borrowTokens: ProtocolPosition[] = [
  {
    icon: "/logos/usdc.svg",
    name: "USDC",
    balance: 0,
    tokenBalance: 0n,
    currentRate: 5.6,
    tokenAddress: "0xusdc",
    tokenDecimals: 6,
    tokenPrice: 1_00000000n,
    tokenSymbol: "USDC",
  },
  {
    icon: "/logos/eth.svg",
    name: "ETH",
    balance: 0,
    tokenBalance: 0n,
    currentRate: 2.8,
    tokenAddress: "0xeth",
    tokenDecimals: 18,
    tokenPrice: 3_200_00000000n,
    tokenSymbol: "ETH",
  },
];

export const BorrowTokens: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    tokens: borrowTokens,
    protocolName: "Vesu",
    isBorrow: true,
  },
  parameters: {
    storybookMocks,
  },
};
