import type { Meta, StoryObj } from "@storybook/react";
import { BasePosition } from "./BasePosition";
import { PlusIcon, MinusIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

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

// Common actions for supply position
const supplyActions = [
  {
    key: "deposit",
    label: "Deposit",
    icon: <PlusIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Deposit tokens",
    variant: "ghost" as const,
  },
  {
    key: "withdraw",
    label: "Withdraw",
    icon: <MinusIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Withdraw tokens",
    variant: "ghost" as const,
  },
  {
    key: "move",
    label: "Move",
    icon: <ArrowRightIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Move supply to another protocol",
    variant: "ghost" as const,
    compactOnHover: true,
  },
];

// Common actions for borrow position
const borrowActions = [
  {
    key: "repay",
    label: "Repay",
    icon: <MinusIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Repay debt",
    variant: "ghost" as const,
  },
  {
    key: "borrow",
    label: "Borrow",
    icon: <PlusIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Borrow more tokens",
    variant: "ghost" as const,
  },
  {
    key: "move",
    label: "Move",
    icon: <ArrowRightIcon className="size-4" />,
    onClick: noop,
    disabled: false,
    title: "Move debt to another protocol",
    variant: "ghost" as const,
    compactOnHover: true,
  },
];

// =============================================================================
// META
// =============================================================================

const meta: Meta<typeof BasePosition> = {
  title: "Position/BasePosition",
  component: BasePosition,
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

type Story = StoryObj<typeof BasePosition>;

// =============================================================================
// SUPPLY POSITION STORIES
// =============================================================================

export const SupplyPositionCollapsed: Story = {
  name: "Supply Position - Collapsed",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={mockToken.currentRate}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
    />
  ),
};

export const SupplyPositionExpanded: Story = {
  name: "Supply Position - Expanded",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={mockToken.currentRate}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
      defaultExpanded={true}
    />
  ),
};

export const SupplyPositionWETH: Story = {
  name: "Supply Position - WETH",
  render: () => (
    <BasePosition
      icon={mockWethToken.icon}
      name={mockWethToken.name}
      tokenAddress={mockWethToken.address}
      tokenPrice={BigInt("350000000000")}
      tokenDecimals={mockWethToken.decimals}
      tokenBalance={BigInt("2000000000000000000")}
      protocolName="Compound"
      networkType="evm"
      currentRate={mockWethToken.currentRate}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
    />
  ),
};

// =============================================================================
// BORROW POSITION STORIES
// =============================================================================

export const BorrowPositionCollapsed: Story = {
  name: "Borrow Position - Collapsed",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("2000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={5.2}
      positionType="borrow"
      rateLabel="APR"
      actions={borrowActions}
      balanceClassName="text-error"
      isNegativeBalance={true}
    />
  ),
};

export const BorrowPositionExpanded: Story = {
  name: "Borrow Position - Expanded",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("2000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={5.2}
      positionType="borrow"
      rateLabel="APR"
      actions={borrowActions}
      balanceClassName="text-error"
      isNegativeBalance={true}
      defaultExpanded={true}
    />
  ),
};

export const BorrowPositionWithOptimalRate: Story = {
  name: "Borrow Position - Optimal Rate Available",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("2000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={5.2}
      positionType="borrow"
      rateLabel="APR"
      actions={borrowActions}
      balanceClassName="text-error"
      isNegativeBalance={true}
      optimalRateOverride={{ protocol: "Compound", rate: 3.8 }}
    />
  ),
};

// =============================================================================
// SPECIAL CASES
// =============================================================================

export const PositionNoBalance: Story = {
  name: "Position - No Balance",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt(0)}
      protocolName="Aave"
      networkType="evm"
      currentRate={3.5}
      positionType="borrow"
      rateLabel="APR"
      actions={borrowActions}
      balanceClassName="text-error"
      isNegativeBalance={true}
      showNoBalanceLabel={true}
      noBalanceText="No debt"
    />
  ),
};

export const PositionWithSubtitle: Story = {
  name: "Position - With Subtitle",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Morpho"
      networkType="evm"
      currentRate={4.2}
      positionType="supply"
      rateLabel="APY"
      subtitle="Morpho Blue Market"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
    />
  ),
};

export const PositionWithExtraStats: Story = {
  name: "Position - With Extra Stats",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={3.5}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
      extraStats={[
        { label: "Health", value: <span className="text-success">2.45</span> },
        { label: "LTV", value: "65%" },
      ]}
    />
  ),
};

export const PositionActionsDisabled: Story = {
  name: "Position - Actions Disabled",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={3.5}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions.map(a => ({ ...a, disabled: true }))}
      balanceClassName="text-success"
      isNegativeBalance={false}
      actionsDisabled={true}
      actionsDisabledReason="Wallet not connected"
      defaultExpanded={true}
    />
  ),
};

export const PositionHiddenBalance: Story = {
  name: "Position - Hidden Balance Column",
  render: () => (
    <BasePosition
      icon={mockToken.icon}
      name={mockToken.name}
      tokenAddress={mockToken.address}
      tokenPrice={BigInt(100000000)}
      tokenDecimals={mockToken.decimals}
      tokenBalance={BigInt("5000000000")}
      protocolName="Aave"
      networkType="evm"
      currentRate={3.5}
      positionType="supply"
      rateLabel="APY"
      actions={supplyActions}
      balanceClassName="text-success"
      isNegativeBalance={false}
      hideBalanceColumn={true}
    />
  ),
};
