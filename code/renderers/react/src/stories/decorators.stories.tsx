import React, { FC } from 'react';
import type { ComponentStory, ComponentMeta } from '@storybook/react';

const Component: FC = () => <p>Story</p>;

export default {
  component: Component,
  decorators: [
    (Story) => (
      <>
        <p>Component Decorator</p>
        <Story />
      </>
    ),
  ],
} as ComponentMeta<typeof Component>;

export const All: ComponentStory<typeof Component> = {
  decorators: [
    (Story) => (
      <>
        <p>Local Decorator</p>
        <Story />
      </>
    ),
  ],
};
