import type { Meta, StoryObj } from '@storybook/react'
import { User, Bell, Shield } from 'lucide-react'
import { Separator } from './separator'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { MenuItem } from '@/design-system/components/Menu/menu-item'

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
// Settings page / overview panel 的分段 rows。**每個 row 消費 MenuItem**(Family 1 item-anatomy
// 正式消費者),有 icon prefix + label + description;Separator 切出 row group 之間的視覺分段。
// 對應 iOS Settings / Notion Workspace settings / Linear user settings canonical。
export const Horizontal: Story = {
  name: '水平',
  render: () => (
    <div role="group" aria-label="settings sections demo" className="border border-border rounded-lg max-w-md overflow-hidden">
      <MenuItem role="presentation"
        startIcon={User}
        description="Email、時區、顯示語言"
      >
        帳號設定
      </MenuItem>
      <Separator />
      <MenuItem role="presentation"
        startIcon={Bell}
        description="Email / 推播通知規則"
      >
        通知
      </MenuItem>
      <Separator />
      <MenuItem role="presentation"
        startIcon={Shield}
        description="資料分享範圍、權限層級"
      >
        隱私
      </MenuItem>
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
    // @layout-space-magic-ok: 同一行 meta 文字 ↔ 分隔線的行內微間距(layoutSpace.spec.md:166 micro 間距)
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
       * 若拉大 gap 反而讓 heading 看似「分離」,與 items 的歸屬關係變弱。世界級 idiom:
       * iOS Settings / Notion properties / Ant Descriptions 皆採相等 gap。
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
