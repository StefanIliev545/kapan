import type { Meta, StoryObj } from "@storybook/react";
import { BaseModal } from "./BaseModal";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const meta: Meta<typeof BaseModal> = {
  title: "Modals/BaseModal",
  component: BaseModal,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof BaseModal>;

export const WithTitle: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    title: "Confirm Action",
    children: (
      <div className="space-y-4">
        <p className="text-base-content/70">
          Are you sure you want to proceed with this action? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Confirm</button>
        </div>
      </div>
    ),
  },
};

export const WithoutTitle: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    children: (
      <div className="space-y-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="bg-success/20 flex size-12 items-center justify-center rounded-full">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <h3 className="font-semibold">Transaction Successful</h3>
            <p className="text-base-content/70 text-sm">Your deposit has been confirmed</p>
          </div>
        </div>
        <button className="btn btn-primary w-full">Close</button>
      </div>
    ),
  },
};

export const Wide: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    title: "Select Token",
    maxWidthClass: "max-w-2xl",
    children: (
      <div className="space-y-2">
        {["USDC", "WETH", "WBTC", "DAI", "USDT"].map((token) => (
          <button
            key={token}
            className="btn btn-ghost w-full justify-start gap-3"
          >
            <div className="bg-base-300 size-8 rounded-full" />
            <span>{token}</span>
          </button>
        ))}
      </div>
    ),
  },
};

export const Loading: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    title: "Processing",
    children: (
      <div className="flex flex-col items-center gap-4 py-8">
        <span className="loading loading-spinner loading-lg" />
        <p className="text-base-content/70">Waiting for confirmation...</p>
      </div>
    ),
  },
};

export const Error: Story = {
  args: {
    isOpen: true,
    onClose: noop,
    title: "Transaction Failed",
    children: (
      <div className="space-y-4">
        <div className="alert alert-error">
          <span>User rejected the transaction</span>
        </div>
        <button className="btn btn-error w-full">Try Again</button>
      </div>
    ),
  },
};
