import type { Meta, StoryObj } from "@storybook/react";
import { FloatingSocials } from "./FloatingSocials";

const meta: Meta<typeof FloatingSocials> = {
  title: "Components/FloatingSocials",
  component: FloatingSocials,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FloatingSocials>;

// Default state - note: this is a fixed positioned component
export const Default: Story = {
  render: () => (
    <div className="bg-base-200 relative h-screen w-full">
      <div className="p-8">
        <h1 className="mb-4 text-2xl font-bold">Page Content</h1>
        <p className="text-base-content/70">
          The FloatingSocials component is fixed to the bottom-left of the viewport.
          Scroll down to see how it stays in place.
        </p>
        <div className="h-[200vh]" />
      </div>
      <FloatingSocials />
    </div>
  ),
};

// Zoomed in view showing just the social links
export const ZoomedIn: Story = {
  render: () => (
    <div className="bg-base-200 relative h-64 w-full overflow-hidden">
      {/* Reset position for story display */}
      <div className="absolute bottom-0 left-0 p-4">
        <div className="pointer-events-auto flex flex-col gap-2 md:flex-row">
          <a
            href="https://discord.gg/Vjk6NhkxGv"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-base-100 dark:bg-base-200 floating-action border-base-300 flex items-center gap-1 rounded-full border px-3 py-2 text-sm"
          >
            <span className="flex size-5 items-center justify-center">D</span>
            <span className="text-base-content">Join our Discord</span>
          </a>
          <a
            href="https://t.me/+vYCKr2TrOXRiODg0"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-base-100 dark:bg-base-200 floating-action border-base-300 flex items-center gap-1 rounded-full border px-3 py-2 text-sm"
          >
            <span className="flex size-5 items-center justify-center">T</span>
            <span className="text-base-content">Join our Telegram</span>
          </a>
          <a
            href="https://x.com/KapanFinance"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-center bg-base-100 dark:bg-base-200 floating-action border-base-300 size-10 rounded-full border"
            title="Follow us on X"
            aria-label="Follow us on X"
          >
            <span className="flex size-4 items-center justify-center text-xs">X</span>
          </a>
        </div>
      </div>
    </div>
  ),
};
