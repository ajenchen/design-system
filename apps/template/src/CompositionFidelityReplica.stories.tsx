// @composition-fidelity-mode: pixel
// @story-baseline: @qijenchen/design-system/components/Button/button.stories.tsx#IconOnly
//
// Composition Fidelity 哨兵 replica(2026-06-11 deep-audit R2 #6,per composition-fidelity.md 層 3)
//
// 此 story 是 DS canonical `button.stories.tsx#IconOnly` 的「忠實複製 replica」— 層 3 identity diff
// 的明確 opt-in(檔頭第 1 行 mode 標記 = pixel;此註解刻意不重寫可被 regex 解析的標記字面,對齊 App.tsx 慣例)。
// CI(composition-fidelity.yml)對「DS 端原 story」
// vs「本 replica 在 consumer 環境 render」做 pixel + DOM dual-track diff:
//   - 抓 consumer 環境組裝 drift(CSS aggregator 漏載 / Tailwind utility 沒生成 / token 沒 resolve /
//     published package 與 DS HEAD render 偏移)— 這正是 2026-05-27「byte-identity 不夠,要 visual diff」初衷
//   - 跟產品 demo(App.tsx,內容刻意不同 = conformance-only)不同:replica 內容必須與 DS 原 story 逐字一致
//
// 維護規則:DS `button.stories.tsx#IconOnly` 改動時本檔必同步(CI 紅 = 提醒同步,非誤報)。
// 禁改成「自己的內容」— 內容一旦刻意不同,請移除 @composition-fidelity-mode 退回 conformance-only。
import type { Meta, StoryObj } from '@storybook/react'
import { Plus, Trash2, Search, Settings, Download, Maximize2 } from 'lucide-react'
import { Button } from '@qijenchen/design-system'

const meta: Meta<typeof Button> = {
  title: 'Apps/template/Composition Fidelity Replica',
  component: Button,
}
export default meta
type Story = StoryObj<typeof Button>

// render tree 逐字複製 DS button.stories.tsx#IconOnly(只換 import 來源為 published package)
export const IconOnlyReplica: Story = {
  name: 'Button 純圖示 — DS canonical 忠實複製',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">variants — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"   startIcon={Plus}     aria-label="新增" />
        <Button size="sm" iconOnly variant="secondary" startIcon={Download}  aria-label="下載" />
        <Button size="sm" iconOnly variant="tertiary"  startIcon={Search}    aria-label="搜尋" />
        <Button size="sm" iconOnly variant="text"      startIcon={Settings}  aria-label="設定" />
        <Button size="sm" iconOnly variant="text" pressed startIcon={Maximize2} aria-label="全螢幕（開啟中）" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">danger — size="sm"</p>
        <Button size="sm" iconOnly variant="primary"    danger startIcon={Trash2} aria-label="永久刪除" />
        <Button size="sm" iconOnly variant="secondary" danger startIcon={Trash2} aria-label="刪除（有確認）" />
        <Button size="sm" iconOnly variant="text"      danger startIcon={Trash2} aria-label="刪除" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="w-full text-caption text-fg-muted">sizes — variant="text"</p>
        <Button size="xs" iconOnly variant="text" startIcon={Settings} aria-label="設定 xs" />
        <Button size="sm" iconOnly variant="text" startIcon={Settings} aria-label="設定 sm" />
        <Button size="md" iconOnly variant="text" startIcon={Settings} aria-label="設定 md" />
        <Button size="lg" iconOnly variant="text" startIcon={Settings} aria-label="設定 lg" />
      </div>
    </div>
  ),
}
