// @story-trait-rationale: hasSizes 由 anatomy.stories.tsx SizeMatrix / 狀態(States)story 的 md/lg 對照 owns size showcase;Default scenario 由 四模式(Modes) / 狀態(States) / 搭配標籤(WithLabel)等真實業務情境 story 覆蓋,不另開抽象 Default/AllSizes。
import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'

const meta: Meta<typeof Switch> = {
  title: 'Design System/Components/Switch/展示',
  component: Switch,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Switch>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6 max-w-sm">
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">edit</h3>
        <Switch defaultChecked aria-label="啟用通知(edit mode demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">view</h3>
        <Switch mode="view" checked />
        <p className="text-caption text-fg-muted mt-1">純視覺 勾/叉 icon；語意由 context（如 DataTable 表頭 + 行標籤）提供，view 不暴露獨立 aria-label。需螢幕報讀器可讀請用 edit / readonly。</p>
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">readonly</h3>
        <Switch readOnly checked aria-label="啟用通知(readonly demo)" />
      </div>
      <div>
        <h3 className="text-body font-bold text-foreground mb-2">disabled</h3>
        <Switch disabled checked aria-label="啟用通知(disabled demo)" />
      </div>
    </div>
  ),
}

/* ── 狀態 ── */
export const States: Story = {
  name: '狀態',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-caption text-fg-muted mb-2">md（預設）</p>
        <div className="flex items-center gap-6">
          <Switch aria-label="off" />
          <Switch defaultChecked aria-label="on" />
          <Switch disabled aria-label="disabled off" />
          <Switch disabled defaultChecked aria-label="disabled on" />
        </div>
        <div className="flex items-center gap-6 mt-1 text-[10px] text-fg-muted">
          <span className="w-10 text-center">off</span>
          <span className="w-10 text-center">on</span>
          <span className="w-10 text-center">off+dis</span>
          <span className="w-10 text-center">on+dis</span>
        </div>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-2">lg</p>
        <div className="flex items-center gap-6">
          <Switch size="lg" aria-label="off" />
          <Switch size="lg" defaultChecked aria-label="on" />
          <Switch size="lg" disabled aria-label="disabled off" />
          <Switch size="lg" disabled defaultChecked aria-label="disabled on" />
        </div>
      </div>
    </div>
  ),
}

/* ── 搭配標籤 ── */
// 2026-07-14 dim-68 修:原直用 internal <SelectionItem control={...}>(selection-item.spec.md
// 明定僅 Checkbox / RadioGroup 消費路徑;Switch 不在其中)→ 改公開 `<Switch label description>`
// (switch.spec.md「label / description 整合」canonical:label 左 / switch 右,自動 wire htmlFor)。
export const WithLabel: Story = {
  name: '搭配標籤',
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-1">size="{size}"</p>
          <div className="grid gap-2">
            <Switch size={size} defaultChecked label="啟用通知" description="接收電子郵件和推播通知" />
            <Switch size={size} label="自動更新" />
            <Switch size={size} disabled label="維護模式（管理員限定）" />
          </div>
        </div>
      ))}
    </div>
  ),
}
