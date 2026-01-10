import type { Meta, StoryObj } from "@storybook/react";
import { ProtocolSelector, ProtocolOption } from "./ProtocolSelector";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const meta: Meta<typeof ProtocolSelector> = {
  title: "Common/ProtocolSelector",
  component: ProtocolSelector,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof ProtocolSelector>;

// Mock protocol data
const protocols: ProtocolOption[] = [
  { name: "aave", supplyRate: 3.5, borrowRate: 4.2 },
  { name: "compound", supplyRate: 4.2, borrowRate: 5.1, isOptimal: true },
  { name: "morpho", supplyRate: 2.8, borrowRate: 3.5 },
];

const protocolsWithDisabled: ProtocolOption[] = [
  { name: "aave", supplyRate: 3.5, borrowRate: 4.2 },
  { name: "compound", supplyRate: 4.2, borrowRate: 5.1, isOptimal: true },
  { name: "morpho", supplyRate: 2.8, borrowRate: 3.5, disabled: true, disabledReason: "Insufficient liquidity" },
];

// Dropdown variant (default)
export const Dropdown: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={protocols}
        selectedProtocol="aave"
        onSelect={noop}
        label="Select Protocol"
      />
    </div>
  ),
};

// Dropdown with no selection
export const DropdownNoSelection: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={protocols}
        selectedProtocol=""
        onSelect={noop}
        label="Select Protocol"
        placeholder="Choose a protocol..."
      />
    </div>
  ),
};

// Grid variant
export const Grid: Story = {
  render: () => (
    <div className="w-96">
      <ProtocolSelector
        variant="grid"
        protocols={protocols}
        selectedProtocol="compound"
        onSelect={noop}
        label="Select Protocol"
        rateType="supply"
      />
    </div>
  ),
};

// Grid variant with rate badges
export const GridWithRateBadges: Story = {
  render: () => (
    <div className="w-96">
      <ProtocolSelector
        variant="grid"
        protocols={protocols}
        selectedProtocol="compound"
        onSelect={noop}
        label="Select Protocol"
        currentRate={3.0}
        rateType="supply"
        showRateBadges
      />
    </div>
  ),
};

// Tiles variant
export const Tiles: Story = {
  render: () => (
    <div className="w-96">
      <ProtocolSelector
        variant="tiles"
        protocols={protocols}
        selectedProtocol="aave"
        onSelect={noop}
        label="Protocol"
      />
    </div>
  ),
};

// Compact mode
export const Compact: Story = {
  render: () => (
    <div className="w-72">
      <ProtocolSelector
        protocols={protocols}
        selectedProtocol="aave"
        onSelect={noop}
        label="Protocol"
        compact
      />
    </div>
  ),
};

// Loading state
export const Loading: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={[]}
        selectedProtocol=""
        onSelect={noop}
        label="Select Protocol"
        isLoading
      />
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={protocols}
        selectedProtocol="aave"
        onSelect={noop}
        label="Select Protocol"
        disabled
      />
    </div>
  ),
};

// With disabled protocols
export const WithDisabledProtocols: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={protocolsWithDisabled}
        selectedProtocol="aave"
        onSelect={noop}
        label="Select Protocol"
      />
    </div>
  ),
};

// Borrow rate type
export const BorrowRates: Story = {
  render: () => (
    <div className="w-80">
      <ProtocolSelector
        protocols={protocols}
        selectedProtocol="compound"
        onSelect={noop}
        label="Select Borrow Protocol"
        rateType="borrow"
      />
    </div>
  ),
};

// All variants comparison
export const AllVariants: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-8 p-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Dropdown</h3>
        <div className="w-80">
          <ProtocolSelector
            variant="dropdown"
            protocols={protocols}
            selectedProtocol="aave"
            onSelect={noop}
          />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Grid</h3>
        <div className="w-96">
          <ProtocolSelector
            variant="grid"
            protocols={protocols}
            selectedProtocol="compound"
            onSelect={noop}
            rateType="supply"
          />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Tiles</h3>
        <div className="w-96">
          <ProtocolSelector
            variant="tiles"
            protocols={protocols}
            selectedProtocol="morpho"
            onSelect={noop}
          />
        </div>
      </div>
    </div>
  ),
};
