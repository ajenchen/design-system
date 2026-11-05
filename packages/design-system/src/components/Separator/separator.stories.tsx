import type { Meta, StoryObj } from '@storybook/react'
import { User, Bell, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Separator } from './separator'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { ItemPrefix, ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'

const meta: Meta<typeof Separator> = {
  title: 'Design System/Components/Separator/展示',
  component: Separator,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '用於 consumer 手動指定的內容群組邊界，必要時可輸出 separator 語意。元件內固定的 header / footer 分隔改用 CSS `border-divider`，自動分隔相鄰群組用結構規則，控件外框則使用 `--border`。',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Separator>

/* ── Horizontal(預設)──────────────────────────────────────────────── */
// 帳號設定總覽的分段:每一段是一列靜態資訊(圖示 + 標題 + 說明,item-anatomy 的 ItemPrefix + ItemContent)。
// 這幾列不可點 → 沒有滑過底色、不出手指游標(D17「如果row不能被點擊就不會有hover底色吧？」;稽核 M026:原本用選單列 MenuItem,
// 滑過會變色、點了卻沒反應)。外層不另包手刻卡片;Separator 切出段與段之間的邊界,段 ↔ 分隔線 = loose
// (並列的段落,layoutSpace.spec.md 規則 3;同下方「在 DescriptionList 區塊之間」)。
const SettingsSection = ({ icon: Icon, label, description }: { icon: LucideIcon; label: string; description: string }) => (
  // 圖示 ↔ 文字 8px = 列內 prefix ↔ content(item-anatomy.spec.md「消費元件預設」prefix ↔ content gap 8px,行內 item 的 micro 幾何)
  <div className="inline-flex items-start gap-2">
    <ItemPrefix><Icon size={16} aria-hidden /></ItemPrefix>
    <ItemContent label={label} description={description} mode="scanning" />
  </div>
)

export const Horizontal: Story = {
  name: '水平',
  render: () => (
    <div className="flex max-w-md flex-col gap-[var(--layout-space-loose)]">
      <SettingsSection icon={User} label="帳號設定" description="Email、時區、顯示語言" />
      <Separator />
      <SettingsSection icon={Bell} label="通知" description="Email / 推播通知規則" />
      <Separator />
      <SettingsSection icon={Shield} label="隱私" description="資料分享範圍、權限層級" />
    </div>
  ),
}

/* ── Vertical（垂直分隔，同一列內的內容群組）──────────────────────────────── */
// 文件頁首的 meta 列:作者與更新時間 / 頁數 / 檔案大小三組資訊,
// consumer 手動放 vertical Separator 分組。父層給確定高度(h-4),Separator 的 h-full 才有長度
// (separator.spec.md「邊界案例」Vertical 方向)。
// 2026-10-01:原本示範 toolbar 按鈕群之間放 Separator —— 那正是 separator.spec.md「邊界案例」明文排除的
// 情境(toolbar / action region 群組分隔不走 Separator,唯一實作是 ButtonGroup + ButtonDivider),改成合法的內容分組。
// 文字用 text-fg-secondary:這列是可讀的資訊,不是裝飾說明(a11y 對比 ≥ 4.5:1)。
export const Vertical: Story = {
  name: '垂直',
  render: () => (
    // @layout-space-magic-ok: 同一行 meta 文字 ↔ 分隔線 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 的「垂直」範例同為 gap-2)
    <div className="flex h-4 items-center gap-2 text-caption text-fg-secondary">
      <span>陳雅婷 更新於 2026/04/18</span>
      <Separator orientation="vertical" />
      <span>12 頁</span>
      <Separator orientation="vertical" />
      <span>2.4 MB</span>
    </div>
  ),
}

// @story-history: InDropdownMenu retired 2026-07-14 per audit Dim 24 —
//   同一「重新命名/複製連結/分隔/刪除」選單完整重複 principles DecorativeSemanticRule
//   (separator.principles.stories.tsx)首例;且 menu 內分隔屬 DropdownMenuSeparator
//   (DropdownMenu owns 該 primitive,見 separator.spec.md 近親分界),非 consumer
//   手動放置 Separator 的場景 — canonical 範例由 DropdownMenu 展示層 owns。

/* ── 在 DescriptionList 之間 ────────────────────────────────────────── */
export const BetweenSections: Story = {
  name: '在 DescriptionList 區塊之間',
  render: () => (
    <div className="border border-border rounded-lg p-[var(--layout-space-loose)] max-w-md flex flex-col gap-[var(--layout-space-loose)]">
      {/*
       * heading → first-item gap 對齊 item → item gap(都是 layout-space-tight):
       * Gestalt proximity canonical —— 相同距離代表 heading 擁有下方 items;
       * 若拉大 gap 反而讓 heading 看似「分離」,與 items 的歸屬關係變弱。
       */}
      <div>
        <h3 className="text-h6 font-medium mb-[var(--layout-space-tight)]">基本資料</h3>
        <DescriptionList cols={1}>
          <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
          <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
        </DescriptionList>
      </div>
      <Separator />
      <div>
        <h3 className="text-h6 font-medium mb-[var(--layout-space-tight)]">團隊資訊</h3>
        <DescriptionList cols={1}>
          <DescriptionItem label="團隊">Design Systems</DescriptionItem>
          <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
        </DescriptionList>
      </div>
    </div>
  ),
}
