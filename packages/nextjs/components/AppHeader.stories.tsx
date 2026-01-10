import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./AppHeader";

const meta: Meta<typeof AppHeader> = {
  title: "Navigation/AppHeader",
  component: AppHeader,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof AppHeader>;

// =============================================================================
// APP HEADER STORIES
// =============================================================================

export const Default: Story = {
  name: "Default",
  render: () => <AppHeader />,
};

export const OnPositionsPage: Story = {
  name: "Positions Page (with search bar)",
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/app",
      },
    },
  },
  render: () => <AppHeader />,
};

export const OnMarketsPage: Story = {
  name: "Markets Page",
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/markets",
      },
    },
  },
  render: () => <AppHeader />,
};
