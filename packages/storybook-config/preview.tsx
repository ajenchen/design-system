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
  docs: {
    // Technical probes stay addressable by direct URL and remain in the story
    // index for a11y/interaction runners, but do not teach readers in Autodocs.
    stories: {
      filter: (story: { tags?: string[] }) => !story.tags?.includes('test-only'),
    },
    // Storybook 8.6 docs 生命週期競態(2026-09-10 user:「剛進 storybook 時,點進範例裡,很常會出現此時不應該出現的選單在左上角」):
    // `CsfDocsRender.renderToElement` 先 `await` DocsRenderer chunk、`DocsRenderer.render` 再 `await` @mdx-js/react chunk,
    // 兩段 await 之後都不再檢查這次 render 是否已被 teardown(core preview-api index.js:4985-5000;teardownRender 要等第一段
    // await 之後才掛上,所以 teardown 當下根本沒東西可取消)。第一次進站 chunk 沒快取(DocsRenderer 888 KB),user 在 Docs 頁
    // 還在載入時點進 story → docs 在 `#storybook-docs[hidden]` 裡渲染成殭屍:裡面所有預設開啟的浮層 portal 到 body、錨點
    // 0×0,被定位到視窗左上角 (0, 8) 還搶走焦點,直到 reload 才消失(AgentPanel「歷史浮層開啟」快照就是 user 看到的那個)。
    // 守衛:render 前後都看 View 是否已把 docs 容器藏起來(`showStory()` 給 `#storybook-docs` 加 `hidden`,index.js:5533-5534;
    // `prepareForDocs()` 會在任何 docs render 之前同步拿掉它,所以守衛不會誤殺正常 docs)。閘:`scripts/storybook-docs-race-invariant.mjs`。
    renderer: async () => {
      const { DocsRenderer } = await import('@storybook/addon-docs')
      const renderer = new DocsRenderer()
      const render = renderer.render
      renderer.render = async (context, docsParameter, element) => {
        if (element.hasAttribute('hidden')) return
        await render(context, docsParameter, element)
        if (element.hasAttribute('hidden')) renderer.unmount(element)
      }
      return renderer
    },
  },
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
