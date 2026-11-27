// Shared Storybook addons preset(2026-05-22 Phase 2 team-distribution-roadmap)
// Consumer product workspace use:`addons: ['@qijenchen/storybook-config/preset']`
// DS repo dogfood:`.storybook/main.ts` 直接 import 此 array spread
//
// 2026-11-25 Storybook 10.6.9 升級:
// - `@storybook/addon-essentials` 在 9.0 退役,Controls / Actions / Viewport / Backgrounds / Measure / Outline /
//   Toolbars / Highlight 併入 `storybook` 本體,不再列在 addons(MIGRATION.md「Essentials Addon: Viewport, Controls,
//   Interactions and Actions moved to core」);docs 要自己裝 `@storybook/addon-docs`(同段)。
// - 原本給 essentials 的 `{ outline: false, backgrounds: false }` 改成 main 設定的 `features`
//  (https://storybook.js.org/docs/api/main-config/main-config-features,10.6 版:`backgrounds` / `outline` 預設 true)。
// - `docs.autodocs` 在 9.0 移除,只認 story 的 `tags: ['autodocs']`(MIGRATION.md「Documentation Generation Changes」);
//   10.6 的 DocsOptions 型別只剩 `defaultName` / `docsMode`,本 repo 的 story 本來就用 tags,行為不變。

export const sharedAddons = [
  // Docs 頁(含 Code 面板);a11y 面板;story 之間的 linkTo
  '@storybook/addon-a11y',
  '@storybook/addon-docs',
  '@storybook/addon-links',
  // 2026-05-27 ship ds-devmode addon as part of storybook-config (per user 「fork user storybook 自動安裝 dev mode」directive)
  '@qijenchen/storybook-config/addons/ds-devmode/preset',
  // 2026-05-26 fix:`@whitespace/storybook-addon-html` 移出 shared preset(DS-internal only)
  // 該 addon 有 peer deps(9.x 起是 `prettier`)不在 storybook-config dependencies,
  // consumer install 後 bundler resolve fail。DS dogfood 仍可在 `.storybook/main.ts` 加為 internal addon。
] as const

// Outline + Backgrounds 關掉 — DS audit 用 token 量值,不需 outline overlay;畫布底色由 DS 主題 token 決定
export const sharedFeatures = {
  outline: false,
  backgrounds: false,
}

export const sharedFramework = {
  name: '@storybook/react-vite' as const,
  options: {},
}

// 10.x 的 docs 選項只剩 defaultName / docsMode;autodocs 由各 story 的 `tags: ['autodocs']` 決定
export const sharedDocsConfig = {}

export const sharedTypescriptConfig = {
  reactDocgen: 'react-docgen-typescript' as const,
}

export const sharedStoryGlobs = [
  '../packages/design-system/src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
]

// 2026-05-26 fix consumer fork-and-go canonical:default export bundles full config
// 對齊 consumer `.storybook/main.ts`:`import preset from '@qijenchen/storybook-config/preset'`
// → `{ ...preset, stories: [...] }` 整套 framework + addons + features + docs + typescript 一鍵繼承
// DS dogfood 走 named imports(sharedAddons / sharedFramework / etc.)— 雙路徑同 SSOT
const preset = {
  framework: sharedFramework,
  addons: sharedAddons,
  features: sharedFeatures,
  docs: sharedDocsConfig,
  typescript: sharedTypescriptConfig,
}

export default preset
