import type { Preview } from "@storybook/react";
import React, { useEffect } from "react";
import "../src/globals.css";
import { TooltipProvider } from "../src/design-system/components/Tooltip/tooltip";

function ThemeDecorator({ theme, density, children }: {
  theme: string; density: string; children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
  }, [theme, density]);

  return <>{children}</>;
}

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
      const theme = (context.globals.theme ?? 'light') as string;
      const density = (context.globals.density ?? 'md') as string;
      return (
        <ThemeDecorator theme={theme} density={density}>
          <TooltipProvider delayDuration={500} skipDelayDuration={300}>
            <Story />
          </TooltipProvider>
        </ThemeDecorator>
      );
    },
  ],
};

export default preview;
