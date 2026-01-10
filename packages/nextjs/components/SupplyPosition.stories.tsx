import type { Meta, StoryObj } from "@storybook/react";
import { SupplyPosition } from "./SupplyPosition";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

// =============================================================================
// MOCK DATA
// =============================================================================

const mockToken = {
  name: "USDC",
  icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  currentRate: 3.5,
  usdPrice: 1.0,
  decimals: 6,
};

const mockWethToken = {
  name: "WETH",
  icon: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  currentRate: 2.1,
  usdPrice: 3500,
  decimals: 18,
};

// =============================================================================
// META
// =============================================================================

const meta: Meta<typeof SupplyPosition> = {
  title: "Position/SupplyPosition",
  component: SupplyPosition,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SupplyPosition>;

// =============================================================================
// BASIC SUPPLY POSITIONS
// =============================================================================

export const SupplyUSDC: Story = {
  name: "Supply USDC - 5000 Balance",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
    />
  ),
};

export const SupplyWETH: Story = {
  name: "Supply WETH - 2 ETH Balance",
  render: () => (
    <SupplyPosition
      icon={mockWethToken.icon}
      name={mockWethToken.name}
      tokenAddress={mockWethToken.address}
      tokenPrice={BigInt("350000000000")}
      tokenDecimals={mockWethToken.decimals}
      tokenBalance={BigInt("2000000000000000000")}
      currentRate={mockWethToken.currentRate}
      protocolName="Compound"
      networkType="evm"
      chainId={42161}
    />
  ),
};

export const SupplyExpanded: Story = {
  name: "Supply Position - Expanded",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      defaultExpanded={true}
    />
  ),
};

// =============================================================================
// PROTOCOL VARIATIONS
// =============================================================================

export const SupplyOnCompound: Story = {
  name: "Supply on Compound",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("10000000000")}
      currentRate={4.2}
      protocolName="Compound"
      networkType="evm"
      chainId={42161}
    />
  ),
};

export const SupplyOnMorpho: Story = {
  name: "Supply on Morpho",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("25000000000")}
      currentRate={5.1}
      protocolName="Morpho"
      networkType="evm"
      chainId={42161}
    />
  ),
};

// =============================================================================
// SPECIAL CASES
// =============================================================================

export const SupplyZeroBalance: Story = {
  name: "Supply - Zero Balance",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt(0)}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
    />
  ),
};

export const SupplyWithQuickDeposit: Story = {
  name: "Supply - With Quick Deposit Button",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      showQuickDepositButton={true}
    />
  ),
};

export const SupplyWithInfoDropdown: Story = {
  name: "Supply - With Info Dropdown",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      showInfoDropdown={true}
    />
  ),
};

export const SupplyMoveDisabled: Story = {
  name: "Supply - Move Disabled",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      disableMove={true}
      defaultExpanded={true}
    />
  ),
};

export const SupplyActionsDisabled: Story = {
  name: "Supply - Actions Disabled",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      actionsDisabled={true}
      actionsDisabledReason="Wallet not connected"
      defaultExpanded={true}
    />
  ),
};

export const SupplyWithSubtitle: Story = {
  name: "Supply - With Subtitle",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Morpho"
      networkType="evm"
      chainId={42161}
      subtitle="USDC/WETH Market"
    />
  ),
};

export const SupplyWithExtraStats: Story = {
  name: "Supply - With Extra Stats",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      extraStats={[
        { label: "Utilization", value: "78%" },
      ]}
    />
  ),
};

// =============================================================================
// CUSTOM ACTIONS
// =============================================================================

export const SupplyCustomActions: Story = {
  name: "Supply - Custom Actions",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      onDeposit={noop}
      onWithdraw={noop}
      onMove={noop}
      defaultExpanded={true}
    />
  ),
};

export const SupplyLimitedActions: Story = {
  name: "Supply - Limited Actions (Deposit Only)",
  render: () => (
    <SupplyPosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      currentRate={mockToken.currentRate}
      protocolName="Aave"
      networkType="evm"
      chainId={42161}
      availableActions={{
        deposit: true,
        withdraw: false,
        move: false,
      }}
      defaultExpanded={true}
    />
  ),
};
