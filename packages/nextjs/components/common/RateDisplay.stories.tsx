import type { Meta, StoryObj } from "@storybook/react";
import { RateDisplay, SupplyAPY, BorrowAPR, NetAPY } from "./RateDisplay";

const meta: Meta<typeof RateDisplay> = {
  title: "Common/RateDisplay",
  component: RateDisplay,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof RateDisplay>;

// Basic positive rate
export const PositiveRate: Story = {
  args: {
    rate: 3.5,
    type: "apy",
  },
};

// Negative rate
export const NegativeRate: Story = {
  args: {
    rate: -2.1,
    type: "net",
    variant: "auto",
    showSign: true,
  },
};

// Zero rate
export const ZeroRate: Story = {
  args: {
    rate: 0,
    type: "apy",
  },
};

// With label
export const WithLabel: Story = {
  args: {
    rate: 4.2,
    type: "apr",
    showLabel: true,
    labelPosition: "before",
  },
};

// Label positions
export const LabelPositions: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm">Label before:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="before" />
      </div>
      <div>
        <p className="mb-2 text-sm">Label after:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="after" />
      </div>
      <div>
        <p className="mb-2 text-sm">Label above:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="above" />
      </div>
    </div>
  ),
};

// Different sizes
export const Sizes: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="w-12 text-sm">xs:</span>
        <RateDisplay rate={3.5} size="xs" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-12 text-sm">sm:</span>
        <RateDisplay rate={3.5} size="sm" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-12 text-sm">md:</span>
        <RateDisplay rate={3.5} size="md" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-12 text-sm">lg:</span>
        <RateDisplay rate={3.5} size="lg" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-12 text-sm">xl:</span>
        <RateDisplay rate={3.5} size="xl" />
      </div>
    </div>
  ),
};

// Color variants
export const Variants: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">default:</span>
        <RateDisplay rate={3.5} variant="default" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">success:</span>
        <RateDisplay rate={3.5} variant="success" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">error:</span>
        <RateDisplay rate={3.5} variant="error" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">muted:</span>
        <RateDisplay rate={3.5} variant="muted" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">auto (+):</span>
        <RateDisplay rate={3.5} variant="auto" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-16 text-sm">auto (-):</span>
        <RateDisplay rate={-2.1} variant="auto" />
      </div>
    </div>
  ),
};

// Rate comparison with old rate
export const RateComparison: Story = {
  args: {
    rate: 3.2,
    oldRate: 4.8,
    type: "apr",
    showLabel: true,
    label: "Borrow APR",
  },
};

// Net APY with auto coloring
export const NetAPYAutoColor: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="w-24 text-sm">Positive:</span>
        <RateDisplay rate={2.1} type="net" variant="auto" showSign />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-24 text-sm">Negative:</span>
        <RateDisplay rate={-1.5} type="net" variant="auto" showSign />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="w-24 text-sm">Zero:</span>
        <RateDisplay rate={0} type="net" variant="auto" showSign />
      </div>
    </div>
  ),
};

// Shorthand components
export const ShorthandComponents: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm">SupplyAPY:</p>
        <SupplyAPY rate={5.2} showLabel />
      </div>
      <div>
        <p className="mb-2 text-sm">BorrowAPR:</p>
        <BorrowAPR rate={4.8} showLabel />
      </div>
      <div>
        <p className="mb-2 text-sm">NetAPY (positive):</p>
        <NetAPY rate={0.4} showLabel />
      </div>
      <div>
        <p className="mb-2 text-sm">NetAPY (negative):</p>
        <NetAPY rate={-0.6} showLabel />
      </div>
    </div>
  ),
};

// Custom decimal places
export const CustomDecimals: Story = {
  args: {
    rate: 3.14159,
    decimals: 4,
    type: "apy",
    showLabel: true,
  },
};
