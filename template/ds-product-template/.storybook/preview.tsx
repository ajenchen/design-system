// 2026-05-26 fix:import storybook.css(Tailwind v4 + DS tokens)
//   - 之前只 `import '@qijenchen/design-system/styles/tokens'` → tokens 載入但 Tailwind 沒跑
//   - 改用 storybook.css(含 `@import 'tailwindcss'` 觸發 utility class generation + tokens import)
//   - 對齊 DS repo `.storybook/preview.tsx` 走 `../src/globals.css` 同 pattern
import './storybook.css'
import basePreview from '@qijenchen/storybook-config/preview'
import type { Preview } from '@storybook/react'

// 2026-05-29 fix landing:published template 只有 Apps stories。Base storySort 以 "Design System" 起頭、
// 無 "Apps" 條目 → Apps stories 退化成字母序 → "All DS Components (Portal)" 排前 → Storybook 落在
// 技術性的 "316 export import smoke" story(user 抓「打開一片空白/技術頁」)。
// Override:Apps/template 內 "AppShell Dashboard"(真實產品 demo)排第一 = landing first story。
const preview: Preview = {
  ...basePreview,
  parameters: {
    ...basePreview.parameters,
    options: {
      ...basePreview.parameters?.options,
      storySort: {
        order: ['Apps', ['template', ['AppShell Dashboard', '*']]],
      },
    },
  },
}

export default preview
