import type { Meta, StoryObj } from "@storybook/react";
import { ProtocolDropdownItem } from "./ProtocolDropdownItem";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const meta: Meta<typeof ProtocolDropdownItem> = {
  title: "Common/ProtocolDropdownItem",
  component: ProtocolDropdownItem,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof ProtocolDropdownItem>;

// Basic item
export const Default: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="aave"
        displayName="Aave V3"
        rate={3.5}
        onClick={noop}
      />
    </div>
  ),
};

// Optimal (best rate) item
export const Optimal: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="compound"
        displayName="Compound V3"
        rate={4.2}
        isOptimal
        onClick={noop}
      />
    </div>
  ),
};

// Better rate (green)
export const BetterRate: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="compound"
        displayName="Compound V3"
        rate={5.1}
        isRateBetter
        onClick={noop}
      />
    </div>
  ),
};

// Worse rate (red)
export const WorseRate: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="morpho"
        displayName="Morpho Blue"
        rate={2.8}
        isRateWorse
        onClick={noop}
      />
    </div>
  ),
};

// Selected item
export const Selected: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="aave"
        displayName="Aave V3"
        rate={3.5}
        isSelected
        onClick={noop}
      />
    </div>
  ),
};

// Disabled item
export const Disabled: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="venus"
        displayName="Venus"
        rate={3.2}
        disabled
        disabledReason="Insufficient liquidity"
        onClick={noop}
      />
    </div>
  ),
};

// Without rate
export const NoRate: Story = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 rounded-lg border">
      <ProtocolDropdownItem
        protocolName="zerolend"
        displayName="ZeroLend"
        onClick={noop}
      />
    </div>
  ),
};

// Multiple items in a list
export const MultipleItems: StoryObj = {
  render: () => (
    <div className="bg-base-100 border-base-200 w-80 overflow-hidden rounded-lg border">
      <ProtocolDropdownItem
        protocolName="compound"
        displayName="Compound V3"
        rate={4.2}
        isOptimal
        onClick={noop}
      />
      <ProtocolDropdownItem
        protocolName="aave"
        displayName="Aave V3"
        rate={3.5}
        isSelected
        onClick={noop}
      />
      <ProtocolDropdownItem
        protocolName="morpho"
        displayName="Morpho Blue"
        rate={2.8}
        isRateWorse
        onClick={noop}
      />
      <ProtocolDropdownItem
        protocolName="venus"
        displayName="Venus"
        rate={3.0}
        disabled
        disabledReason="Not available on this chain"
        onClick={noop}
      />
    </div>
  ),
};
