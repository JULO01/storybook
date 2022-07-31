// TODO -- for now react, going to generalise
import React, { FC } from 'react';

import { action } from '@storybook/addon-actions';

// TODO -- this needs to be a generic component
const Button: FC<{ onClick: () => void }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick}>
    {children}
  </button>
);

export default {
  component: Button,
};

export const BasicExample = {
  args: { onClick: action('hello-world') },
};
