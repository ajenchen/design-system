// Shared Storybook addons preset(2026-05-22 Phase 2 team-distribution-roadmap)
// Consumer product workspace use:`addons: ['@qijenchen/storybook-config/preset']`
// DS repo dogfood:`.storybook/main.ts` 直接 import 此 array spread

export const sharedAddons = [
  // essentials 含 Controls / Actions / Viewport / Backgrounds / Measure / Highlight / Toolbars / Docs
  // Outline + Backgrounds disabled — DS audit 用 token 量值,不需 outline overlay
  {
    name: '@storybook/addon-essentials',
    options: { outline: false, backgrounds: false },
  },
  '@storybook/addon-a11y',
  '@storybook/addon-docs',
  '@storybook/addon-links',
  // 2026-05-27 ship ds-devmode addon as part of storybook-config (per user 「fork user storybook 自動安裝 dev mode」directive)
  '@qijenchen/storybook-config/addons/ds-devmode/preset',
  // 2026-05-26 fix:`@whitespace/storybook-addon-html` 移出 shared preset(DS-internal only)
  // 該 addon 有 peer deps `react-syntax-highlighter` + `prettier` 不在 storybook-config dependencies,
  // consumer install 後 bundler resolve fail。DS dogfood 仍可在 `.storybook/main.ts` 加為 internal addon。
] as const

export const sharedFramework = {
  name: '@storybook/react-vite' as const,
  options: {},
}

export const sharedDocsConfig = {
  autodocs: 'tag' as const,
}

export const sharedTypescriptConfig = {
  reactDocgen: 'react-docgen-typescript' as const,
}

export const sharedStoryGlobs = [
  '../packages/design-system/src/**/*.mdx',
  '../packages/design-system/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
]

// 2026-05-26 fix consumer fork-and-go canonical:default export bundles full config
// 對齊 consumer `.storybook/main.ts`:`import preset from '@qijenchen/storybook-config/preset'`
// → `{ ...preset, stories: [...] }` 整套 framework + addons + docs + typescript 一鍵繼承
// DS dogfood 走 named imports(sharedAddons / sharedFramework / etc.)— 雙路徑同 SSOT
const preset = {
  framework: sharedFramework,
  addons: sharedAddons,
  docs: sharedDocsConfig,
  typescript: sharedTypescriptConfig,
}

export default preset
