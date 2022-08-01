import { action } from '@storybook/addon-actions';

export default {
  component: 'Button',
  args: {
    children: 'Click Me!',
  },
};

export const BasicExample = {
  args: { onClick: action('hello-world') },
};
