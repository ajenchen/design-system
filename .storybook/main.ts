// 2026-05-22 Phase 2 team-distribution-roadmap:dogfood `@qijenchen/storybook-config`
// 共用 addons + framework + docs config 從 package import；canonical ds-devmode 亦由 shared preset 單一路徑載入
// 2026-05-26 改用 npm package path(`@qijenchen/storybook-config/preset`)而非 monorepo relative —
// 真正 dogfood consumer code path,確保 published package 也跑得起來(monorepo `workspaces:` 自動 resolve)
import type { StorybookConfig } from '@storybook/react-vite'
import {
  sharedAddons,
  sharedFeatures,
  sharedFramework,
  sharedDocsConfig,
  sharedTypescriptConfig,
  sharedStoryGlobs,
} from '@qijenchen/storybook-config/preset'

const config: StorybookConfig = {
  // 2026-05-29 Phase 2 monorepo 2-scenario arch:
  // DS-internal stories(sharedStoryGlobs)+ product apps stories(apps/**)。
  // Scenario A(直 fork DS)在同個 Storybook 看 DS docs + 自己產品 apps。
  // Namespace 區隔:`Design System/...`(DS internal)vs `Apps/<name>/...`(per check_consumer_app_story_title.sh enforced)。
  stories: [...sharedStoryGlobs, '../apps/**/*.stories.@(tsx|mdx)'],

  addons: [
    ...sharedAddons,
    // 2026-05-26 DS-internal HTML viewer addon(2026-05-26 移出 shared preset 因 consumer 缺 peer deps)。
    // 9.x 起它的 preview 直接 import `prettier/standalone`(peer `prettier ^3.7.1`),根 devDependencies 有 prettier 才 load 得起來。
    '@whitespace/storybook-addon-html',
  ],

  features: sharedFeatures,
  framework: sharedFramework,
  docs: sharedDocsConfig,
  typescript: sharedTypescriptConfig,
}

export default config
