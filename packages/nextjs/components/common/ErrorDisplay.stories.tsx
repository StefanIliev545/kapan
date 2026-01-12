import type { Meta, StoryObj } from "@storybook/react";
import { ErrorDisplay, WarningDisplay, InfoDisplay } from "./ErrorDisplay";

const meta: Meta<typeof ErrorDisplay> = {
  title: "Common/ErrorDisplay",
  component: ErrorDisplay,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof ErrorDisplay>;

// Basic error message
export const Error: Story = {
  args: {
    message: "Transaction failed. Please try again.",
    variant: "error",
  },
};

// Warning message
export const Warning: Story = {
  args: {
    message: "Output may not cover the full amount",
    variant: "warning",
  },
};

// Info message
export const Info: Story = {
  args: {
    message: "Your transaction is being processed",
    variant: "info",
  },
};

// Inline error (for form validation)
export const Inline: Story = {
  args: {
    message: "Invalid amount entered",
    variant: "inline",
  },
};

// Different sizes
export const Sizes: StoryObj = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <ErrorDisplay message="Small error message" size="sm" />
      <ErrorDisplay message="Medium error message (default)" size="md" />
      <ErrorDisplay message="Large error message with shadow" size="lg" />
    </div>
  ),
};

// All variants together
export const AllVariants: StoryObj = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <ErrorDisplay message="This is an error message" variant="error" />
      <ErrorDisplay message="This is a warning message" variant="warning" />
      <ErrorDisplay message="This is an info message" variant="info" />
      <ErrorDisplay message="This is an inline error" variant="inline" />
    </div>
  ),
};

// Error with long text
export const LongMessage: Story = {
  args: {
    message: "The transaction could not be completed because the network is congested. Please wait a few minutes and try again. If the problem persists, contact support.",
    variant: "error",
    breakAll: true,
  },
};

// Without icon
export const NoIcon: Story = {
  args: {
    message: "Error without icon",
    variant: "error",
    hideIcon: true,
  },
};

// Shorthand components
export const WarningShorthand: StoryObj<typeof WarningDisplay> = {
  render: () => (
    <div className="w-80">
      <WarningDisplay message="This uses the WarningDisplay shorthand" />
    </div>
  ),
};

export const InfoShorthand: StoryObj<typeof InfoDisplay> = {
  render: () => (
    <div className="w-80">
      <InfoDisplay message="This uses the InfoDisplay shorthand" />
    </div>
  ),
};

// Error object handling
export const ErrorObject: Story = {
  render: () => (
    <div className="w-80">
      <ErrorDisplay message={{ message: "Error object message is extracted" } as Error} />
    </div>
  ),
};
