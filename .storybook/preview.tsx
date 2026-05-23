// 2026-05-22 Phase 2 team-distribution-roadmap:dogfood `@qijenchen/storybook-config`
// 共用 globalTypes + parameters + decorators 從 package import,本檔僅 re-export 給 Storybook
import '../src/globals.css'
import preview from '../packages/storybook-config/preview'

export default preview
