// @story-history: hasSizes 由 anatomy.stories.tsx SizeMatrix / 狀態(States)story 的 md/lg 對照 owns size showcase;Default scenario 由 四模式(Modes) / 狀態(States) / 搭配標籤(WithLabel)等真實業務情境 story 覆蓋,不另開抽象 Default/AllSizes。
import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'

const meta: Meta<typeof Switch> = {
  title: 'Design System/Components/Switch/展示',
  component: Switch,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: '立即切換單一設定的開啟或關閉狀態，支援受控、非受控與唯讀模式。變更會立即生效時使用；需要提交表單後才套用的多選項改用 Checkbox。' } },
  },
}
export default meta
type Story = StoryObj<typeof Switch>

/* ── 四模式 ── */
export const Modes: Story = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-sm">
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">edit</h3>
        <Switch defaultChecked aria-label="啟用通知(edit mode demo)" />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">view</h3>
        <Switch mode="view" checked />
        <p className="text-caption text-fg-muted mt-[var(--layout-space-tight)]">純視覺 勾/叉 icon；語意由 context（如 DataTable 表頭 + 行標籤）提供，view 不暴露獨立 aria-label。需螢幕報讀器可讀請用 edit / readonly。</p>
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">readonly</h3>
        <Switch readOnly checked aria-label="啟用通知(readonly demo)" />
      </div>
      <div>
        <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">disabled</h3>
        <Switch disabled checked aria-label="啟用通知(disabled demo)" />
      </div>
    </div>
  ),
}

/* ── 狀態 ── */
export const States: Story = {
  name: '狀態',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">md（預設）</p>
        <div className="flex items-center gap-[var(--layout-space-loose)]">
          <Switch aria-label="off" />
          <Switch defaultChecked aria-label="on" />
          <Switch disabled aria-label="disabled off" />
          <Switch disabled defaultChecked aria-label="disabled on" />
        </div>
        <div className="flex items-center gap-[var(--layout-space-loose)] mt-[var(--layout-space-tight)] text-footnote text-fg-muted">
          <span className="w-10 text-center">off</span>
          <span className="w-10 text-center">on</span>
          <span className="w-10 text-center">off+dis</span>
          <span className="w-10 text-center">on+dis</span>
        </div>
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">lg</p>
        <div className="flex items-center gap-[var(--layout-space-loose)]">
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
// (switch.spec.md「label / description 整合」canonical:一整列設定列,標題左 / 開關在列尾,自動 wire htmlFor)。
export const WithLabel: Story = {
  name: '搭配標籤',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)] max-w-sm">
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">size="{size}"</p>
          {/* 三列各管一件事的設定列:列與列之間 = loose(layoutSpace.spec.md 規則 3「跨範疇 + parallel」;2026-10-27 Q6 甲),
              列高 = 欄位高由元件自己給(switch.spec.md「label / description 整合」)。不是 :165「同質 list 的列間距」—— 沒有規格把一排獨立開關定成一組 */}
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Switch size={size} defaultChecked label="啟用通知" description="接收電子郵件和推播通知" />
            <Switch size={size} label="自動更新" />
            <Switch size={size} disabled label="維護模式（管理員限定）" />
          </div>
        </div>
      ))}
    </div>
  ),
}
