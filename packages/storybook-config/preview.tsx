// Shared Storybook preview config(2026-05-22 Phase 2 team-distribution-roadmap)
// Consumer product workspace use:`.storybook/preview.tsx` import { sharedPreview } from '@qijenchen/storybook-config'
// DS repo dogfood:`.storybook/preview.tsx` 直接 import 此 default export

import type { Preview } from '@storybook/react'
import React, { useEffect } from 'react'
// 2026-05-26 fix:改 import 已 published npm package(consumer node_modules layout works),
// 不再 relative path `../design-system/src/...`(monorepo-only path,published 後 consumer 看不到)
import { TooltipProvider } from '@qijenchen/design-system'

export const sharedGlobalTypes = {
  theme: {
    name: '主題',
    description: '全域顯示主題',
    defaultValue: 'light',
    toolbar: {
      icon: 'circlehollow',
      items: [
        { value: 'light', icon: 'sun', title: '淺色' },
        { value: 'dark', icon: 'moon', title: '深色' },
      ],
      showName: true,
    },
  },
  density: {
    name: '介面密度',
    description: '全域元件尺寸與版面留白密度',
    defaultValue: 'md',
    toolbar: {
      icon: 'component',
      items: [
        { value: 'md', title: '標準（md）' },
        { value: 'lg', title: '寬鬆（lg）' },
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
        [
          'Tokens',
          'Components', ['*', ['展示', '設計規格', '設計原則']],
          'Patterns',
          'Internal', ['*', ['展示', '設計規格', '設計原則']],
          'Internal Patterns',
          '*',
        ],
        'Apps',
        '*',
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
