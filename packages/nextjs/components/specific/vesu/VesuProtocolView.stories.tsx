// VesuProtocol.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { VesuProtocolView } from '~~/components/specific/vesu/VesuProtocolView';

const meta = {
  title: 'Protocols/Vesu',
  component: VesuProtocolView,
} satisfies Meta<typeof VesuProtocolView>;

export default meta;

type Story = StoryObj<typeof VesuProtocolView>;

export const Default: Story = {};
