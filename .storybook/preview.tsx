// 2026-05-22 Phase 2 team-distribution-roadmap:dogfood `@qijenchen/storybook-config`
// 共用 globalTypes + parameters + decorators 從 package import,本檔僅 re-export 給 Storybook
// 2026-05-26 改 npm package import path(`@qijenchen/storybook-config/preview`),同 consumer code path
import '../src/globals.css'
import preview from '@qijenchen/storybook-config/preview'

// Keep the default export statically object-shaped so Storybook's config parser can inspect it
// without emitting a false CSF parsing warning for an imported identifier.
export default { ...preview }
