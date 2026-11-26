/**
 * DsImportSmoke.stories.tsx — DS 公開 API import smoke + 連到 DS canonical Storybook 的入口
 *
 * Per user 2026-05-27 verbatim「確保跟 ds repo 一模一樣」+「全盤避免 minimal mock 抹平」+ M31 codex synthesis.
 *
 * 規則(SSOT):
 *   1. DS owns per-component canonical pixels — 全部 manifest-discovered public components 的三層 stories(展示/設計規格/設計原則)在 DS Storybook
 *   2. PW(consumer template)只 owns 真實業務 composition demos(AppShell Dashboard 等)
 *   3. 想看「所有 DS 元件」default render → link 連 DS deployed Storybook(2026-06-03 移除壞掉+冗餘的 iframe 嵌入:在合併部署裡 iframe 等於把同一 Storybook 嵌進自己 → X-Frame-Options SAMEORIGIN 下渲染失敗)
 *   4. **禁** PW 重寫 `<DS.X minimal props>` — 必 drift(2026-05-27 5+ bug 錨例:CircularProgress size=32 / RadioGroup raw item 沒 SelectionItem / DataTable one-col / LinkInput placeholder mock / Empty 缺 icon)
 *   5. Mechanical 強制:hook check_consumer_app_invariants.sh(r1 no-DS-catalog / r2 story baseline)
 *
 * 2026-11-27(上游判定 E18):原檔名 AllDsComponents.stories.tsx 是 catalog 檔名,逼出 consumer-catalog-allow 標記,再加 anatomy-exempt
 * 與兩個 layout-space-magic-ok 標記,範本每建一個 app 就帶進 4 個會被計數的豁免標記。改名成 import smoke 的名字、外框與 code block 改用
 * layout-space token 與語意色後,這個檔 0 個豁免標記(回歸測試 scripts/test-setup-governance.mjs「template import smoke」)。
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import * as DS from '@qijenchen/design-system'

// Dynamic export count(不寫死數字,隨 DS public API 增減)— import smoke only, no render
const allKeys = Object.keys(DS).sort()
const components = allKeys.filter(k => /^[A-Z]/.test(k))
const hooks = allKeys.filter(k => k.startsWith('use'))
const constants = allKeys.filter(k => /^[A-Z_]+$/.test(k))
const utils = allKeys.filter(k => !/^[A-Z]/.test(k) && !k.startsWith('use'))

const DS_STORYBOOK_URL = 'https://ajenchen-design-system.netlify.app/'

const meta: Meta = {
  title: 'Apps/template/All DS Components (Portal)',
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj

export const ImportSmoke: Story = {
  name: 'DS 公開 API import smoke',
  tags: ['test-only'],
  render: () => (
    // 外框內距與「標題 → 第一塊內容、內容之間」都 = loose,跟著密度走(DS `layoutSpace.spec.md` 規則 3「標題區 → 內容」第 3 題)
    <div className="p-[var(--layout-space-loose)] space-y-[var(--layout-space-loose)]" data-testid="all-ds-import-smoke">
      <h1 className="text-h3">DS Public API — Import Smoke</h1>
      <p className="text-body">
        Imports resolved: <span data-testid="total">{allKeys.length}</span> exports
        ({components.length} components / {hooks.length} hooks / {constants.length} constants / {utils.length} utils).
      </p>
      <p className="text-caption text-fg-secondary">
        本 story 只驗 import 全部解析。**禁** render DS components in PW(per codex M31 synthesis 2026-05-27).
        Per-component visual canonical → DS deployed Storybook:{' '}
        {/* 連結字走 Action—Primary canonical(text-primary + hover 換色,不用 underline;
            r3 C20 pattern,對齊 principles stories LinkTo 同款 — 2026-07-14 dim-71 修) */}
        <a href={DS_STORYBOOK_URL} target="_blank" rel="noopener" className="text-primary hover:text-primary-hover font-medium">
          ajenchen-design-system.netlify.app
        </a>
      </p>
      <details className="text-caption">
        <summary className="cursor-pointer">Full export list ({allKeys.length})</summary>
        {/* export 清單 code block:內距與上距 = tight、底色與圓角照 DS 內 <pre> 既有寫法(bg-canvas rounded-md)【AI 推導 2026-11-27】 */}
        <pre className="mt-[var(--layout-space-tight)] p-[var(--layout-space-tight)] bg-canvas rounded-md text-fg-secondary break-all">{allKeys.join(', ')}</pre>
      </details>
    </div>
  ),
}
