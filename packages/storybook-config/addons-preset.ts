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
  '@whitespace/storybook-addon-html',
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
