import React, { FC } from 'react';

export const Button: FC<{ onClick: () => void }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick}>
    {children}
  </button>
);
