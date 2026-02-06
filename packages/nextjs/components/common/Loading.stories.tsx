import type { Meta, StoryObj } from "@storybook/react";
import {
  ButtonLoading,
  LoadingAlert,
  LoadingOverlay,
  LoadingSpinner,
  SectionLoading,
  SkeletonCircle,
  SkeletonLine,
  SkeletonRow,
} from "./Loading";

const meta: Meta<typeof LoadingSpinner> = {
  title: "Common/Loading",
  component: LoadingSpinner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;

// LoadingSpinner stories
export const Spinner: StoryObj<typeof LoadingSpinner> = {
  args: {
    size: "md",
  },
};

export const SpinnerWithLabel: StoryObj<typeof LoadingSpinner> = {
  args: {
    size: "md",
    label: "Loading data...",
  },
};

export const SpinnerSizes: StoryObj = {
  render: () => (
    <div className="flex items-center gap-4">
      <LoadingSpinner size="xs" />
      <LoadingSpinner size="sm" />
      <LoadingSpinner size="md" />
      <LoadingSpinner size="lg" />
    </div>
  ),
};

// LoadingOverlay stories
export const Overlay: StoryObj<typeof LoadingOverlay> = {
  render: () => (
    <div className="w-64">
      <LoadingOverlay label="Loading content..." />
    </div>
  ),
};

// ButtonLoading stories
export const ButtonLoadingIndicator: StoryObj<typeof ButtonLoading> = {
  render: () => (
    <button className="btn btn-primary flex items-center gap-2">
      <ButtonLoading size="xs" />
      Processing...
    </button>
  ),
};

// LoadingAlert stories
export const Alert: StoryObj<typeof LoadingAlert> = {
  render: () => (
    <div className="w-80">
      <LoadingAlert message="Fetching quote from 1inch..." />
    </div>
  ),
};

export const AlertVariants: StoryObj = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <LoadingAlert message="Info loading..." variant="info" />
      <LoadingAlert message="Warning loading..." variant="warning" />
      <LoadingAlert message="Neutral loading..." variant="neutral" />
    </div>
  ),
};

// Skeleton stories
export const Skeletons: StoryObj = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div>
        <p className="mb-2 text-sm">SkeletonLine:</p>
        <SkeletonLine width="w-32" />
      </div>
      <div>
        <p className="mb-2 text-sm">SkeletonCircle:</p>
        <SkeletonCircle />
      </div>
      <div>
        <p className="mb-2 text-sm">SkeletonRow:</p>
        <SkeletonRow />
      </div>
    </div>
  ),
};

// SectionLoading stories
export const Section: StoryObj<typeof SectionLoading> = {
  render: () => (
    <div className="w-96">
      <SectionLoading title="Markets" rows={3} />
    </div>
  ),
};
