import type { Meta, StoryObj } from "@storybook/react";
import { Header, HeaderMenuLinks } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Navigation/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof Header>;

// =============================================================================
// HEADER STORIES
// =============================================================================

export const Default: Story = {
  render: () => <Header />,
};

// =============================================================================
// HEADER MENU LINKS STORIES
// =============================================================================

export const MenuLinksDesktop: StoryObj<typeof HeaderMenuLinks> = {
  name: "Menu Links (Desktop)",
  render: () => (
    <div className="bg-base-100 p-4">
      <ul className="flex space-x-2">
        <HeaderMenuLinks />
      </ul>
    </div>
  ),
};

export const MenuLinksMobile: StoryObj<typeof HeaderMenuLinks> = {
  name: "Menu Links (Mobile)",
  render: () => (
    <div className="bg-base-100 p-4">
      <ul className="flex flex-col space-y-2">
        <HeaderMenuLinks isMobile />
      </ul>
    </div>
  ),
};
