import type { Preview } from "@storybook/react";
import React from "react";
import "../src/globals.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        showName: true,
      },
    },
    density: {
      name: 'Density',
      description: 'UI density (ui-size + layout-space)',
      defaultValue: 'md',
      toolbar: {
        icon: 'component',
        items: [
          { value: 'md', title: 'Density: md' },
          { value: 'lg', title: 'Density: lg' },
        ],
        showName: true,
      },
    },
  },

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
  },

  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? 'light';
      const density = context.globals.density ?? 'md';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-density', density);
      document.body.style.background = 'var(--canvas)';
      return React.createElement(Story);
    },
  ],
};

export default preview;
