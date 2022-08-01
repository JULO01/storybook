import React, { ComponentType, ReactElement } from 'react';
import { ArgsStoryFn } from '@storybook/csf';

import { Button } from './Button';

const Components = { Button };

type ReactFrameworkOrString = {
  component: ComponentType | keyof typeof Components;
  storyResult: ReactElement<unknown>;
};

export const render: ArgsStoryFn<ReactFrameworkOrString> = (args, context) => {
  const { id, component } = context;
  if (!component) {
    throw new Error(
      `Unable to render story ${id} as the component annotation is missing from the default export`
    );
  }

  let Component;
  if (typeof component === 'string') {
    if (!Object.keys(Components).includes(component)) {
      throw new Error(`Unable to render story ${id}: unknown component name ${component}`);
    }
    Component = Components[component];
  } else {
    Component = component;
  }

  return <Component {...(args as any)} />;
};
