// Consumer Storybook config — dogfood @qijenchen/storybook-config shared preset
// 2026-05-23 fix per Group D audit:stories glob 必 consumer-relative,不 reuse `sharedStoryGlobs`(那是 DS-internal paths)
import type { StorybookConfig } from '@storybook/react-vite'
import {
  sharedAddons,
  sharedFramework,
  sharedDocsConfig,
  sharedTypescriptConfig,
} from '@qijenchen/storybook-config/preset'

const config: StorybookConfig = {
  // Consumer apps stories(不含 DS internal — DS docs 看 DS repo storybook deploy)
  stories: [
    '../apps/**/*.mdx',
    '../apps/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: sharedAddons,
  framework: sharedFramework,
  docs: sharedDocsConfig,
  typescript: sharedTypescriptConfig,
}

export default config
