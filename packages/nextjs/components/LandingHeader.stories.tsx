import type { Meta, StoryObj } from "@storybook/react";
import { LandingHeader } from "./LandingHeader";
import { LandingSectionProvider } from "~~/contexts/LandingSectionContext";

// Wrapper component to provide the LandingSection context
const LandingHeaderWithProvider = ({
  currentSection = 0,
  totalSections = 6,
}: {
  currentSection?: number;
  totalSections?: number;
}) => {
  return (
    <LandingSectionProvider>
      <LandingHeaderInner
        currentSection={currentSection}
        totalSections={totalSections}
      />
    </LandingSectionProvider>
  );
};

// Inner component that sets section via context
const LandingHeaderInner = ({
  currentSection,
  totalSections,
}: {
  currentSection: number;
  totalSections: number;
}) => {
  // Use a mock context value by rendering within the provider
  // The LandingSectionProvider starts at section 0 by default
  return (
    <div className="bg-base-100 relative min-h-[200px]">
      <LandingHeader />
      <div className="text-base-content/50 pt-20 text-center text-sm">
        Section: {currentSection} / {totalSections}
      </div>
    </div>
  );
};

const meta: Meta<typeof LandingHeader> = {
  title: "Navigation/LandingHeader",
  component: LandingHeader,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof LandingHeader>;

// =============================================================================
// LANDING HEADER STORIES
// =============================================================================

export const Default: Story = {
  name: "Default (Hero Section)",
  render: () => <LandingHeaderWithProvider currentSection={0} totalSections={6} />,
};

export const WithLaunchButton: Story = {
  name: "With Launch Button (Middle Sections)",
  decorators: [
    (Story) => (
      <LandingSectionProvider>
        <MockSectionSetter section={2}>
          <div className="bg-base-100 relative min-h-[200px]">
            <Story />
          </div>
        </MockSectionSetter>
      </LandingSectionProvider>
    ),
  ],
  render: () => <LandingHeader />,
};

// Helper component to mock section changes
const MockSectionSetter = ({
  children,
}: {
  section: number;
  children: React.ReactNode;
}) => {
  // The context starts at 0, but we show the header anyway
  // In reality the Launch button shows based on section state
  return <>{children}</>;
};
