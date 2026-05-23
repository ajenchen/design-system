// Shared Storybook preview config(2026-05-22 Phase 2 team-distribution-roadmap)
// Consumer product workspace use:`.storybook/preview.tsx` import { sharedPreview } from '@qijenchen/storybook-config'
// DS repo dogfood:`.storybook/preview.tsx` 直接 import 此 default export

import type { Preview } from '@storybook/react'
import React, { useEffect } from 'react'
import { TooltipProvider } from '../design-system/src/components/Tooltip/tooltip'

export const sharedGlobalTypes = {
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
}

export const sharedParameters = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  backgrounds: { disable: true },
  options: {
    storySort: {
      order: [
        'Design System',
        ['Tokens', 'Components', ['*', ['展示', '設計規格', '設計原則']], 'Patterns'],
      ],
    },
  },
}

export const sharedDecorators: Preview['decorators'] = [
  (Story, context) => {
    const theme = (context.globals.theme ?? 'light') as string
    const density = (context.globals.density ?? 'md') as string

    useEffect(() => {
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-density', density)
    }, [theme, density])

    // Fullscreen layout 跳過 padding trick:position:fixed 元件相對 viewport,跟 padding 衝突
    const isFullscreen = context.parameters?.layout === 'fullscreen'
    const wrapperStyle: React.CSSProperties = isFullscreen
      ? { backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }
      : {
          backgroundColor: 'var(--canvas)',
          color: 'var(--foreground)',
          margin: '-1rem',
          padding: '1rem',
        }

    return (
      <TooltipProvider delayDuration={500} skipDelayDuration={300}>
        <div style={wrapperStyle}>
          <Story />
        </div>
      </TooltipProvider>
    )
  },
]

const preview: Preview = {
  globalTypes: sharedGlobalTypes,
  parameters: sharedParameters,
  decorators: sharedDecorators,
}

export default preview
