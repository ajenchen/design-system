// @anatomy-rationale:
//   ColorMatrix represented as StateBehavior「視覺狀態對照」段 — SegmentedControl
//     不分 variant 色彩(全 DS 統一 surface / fg-secondary unselected,primary
//     selected),色彩變化僅由 state 驅動。State 色彩矩陣(unselected / hover /
//     selected / disabled × bg / text / border / z-index)已由 StateBehavior(5.)
//     完整對照,獨立 ColorMatrix 會與 StateBehavior 重複。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AlignLeft, AlignCenter, AlignRight, List, LayoutGrid, Calendar } from 'lucide-react'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'
import { Badge } from '@/design-system/components/Badge/badge'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta<React.ComponentProps<typeof SegmentedControl> & { iconOnly?: boolean }> = {
  title: 'Design System/Components/SegmentedControl/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>SegmentedControl(role="group")+ N 個 Item(role="radio",N = 2-5)。Items 連體展示,基於 Radix ToggleGroup(type="single")。內部結構 mirror Button(gap-1、label px-1、badge gap-1)。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <SegmentedControl defaultValue="week">
            <SegmentedControlItem value="day">日</SegmentedControlItem>
            <SegmentedControlItem value="week">週</SegmentedControlItem>
            <SegmentedControlItem value="month">月</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <p className="text-footnote text-fg-muted mt-3">Items 之間 `-ml-px`(除第一個)讓相鄰 border 重疊成單一視覺線;第一個 `rounded-l-md`,最後一個 `rounded-r-md`,中間 `rounded-none`</p>
      </div>

      <div>
        <H3>Item 內部結構</H3>
        <Desc>[startIcon?] [label span px-1] [suffix gap-1:badge?]——跟 Button size sm/md/lg 的 `gap-1` 和 `px-1` label 完全對齊,視覺肌肉記憶直接複用。</Desc>
        <div className="flex flex-col gap-3 border border-border rounded-lg p-4 max-w-md">
          <SegmentedControl defaultValue="all">
            <SegmentedControlItem value="all" badge={<Badge count={12} variant="low" />}>全部</SegmentedControlItem>
            <SegmentedControlItem value="active" badge={<Badge count={3} variant="high" />}>進行中</SegmentedControlItem>
            <SegmentedControlItem value="done">已完成</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['SegmentedControl', '', '', ''],
                ['  value / defaultValue', 'string', '必填', '當前 value(Radix ToggleGroup type="single"),必須落在可選 item 上'],
                ['  onValueChange', '(value: string) => void', '—', '切換 callback'],
                ['  size', "'xs' | 'sm' | 'md' | 'lg'", "'md'", '對齊 --field-height-*(跟 Button / Input 同,field-height family 共享 default md)'],
                ['  fullWidth', 'boolean', 'false', 'hug content(false)vs 撐滿父容器並等分(true)'],
                ['  iconOnly', 'boolean', 'false', 'group-level:全部 icon-only(必須整組一致,不可混搭)'],
                ['  disabled', 'boolean', 'false', '整個 SegmentedControl 停用'],
                ['SegmentedControlItem', '', '', ''],
                ['  value', 'string', '必填', '唯一識別碼'],
                ['  startIcon', 'LucideIcon', '—', 'label 左側 icon'],
                ['  badge', 'ReactNode', '—', 'label 右側 badge(計數指示器,如「全部 12」)'],
                ['  aria-label', 'string', '(iconOnly 必填)', 'iconOnly 時必填(dev-mode runtime warn,非 TS 強制),自動渲染 tooltip'],
                ['  disabled', 'boolean', 'false', '單獨 item 停用(不得是當前 value)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切 SegmentedControl props 即時 render,取代 Figma inspect。改 `value` 看選中狀態、切 `size` 對照 field-height tier、切 `fullWidth` 看 hug vs 等分。' } },
  },
  args: {
    size: 'md',
    value: 'week',
    fullWidth: false,
    iconOnly: false,
    disabled: false,
  },
  argTypes: {
    size: { control: 'radio', options: ['xs', 'sm', 'md', 'lg'] },
    value: {
      control: 'radio',
      options: ['day', 'week', 'month'],
      description: '當前選中的 item value',
    },
    fullWidth: { control: 'boolean', description: 'false=hug content / true=撐滿父容器等分' },
    iconOnly: { control: 'boolean', description: 'group-level:全部 icon-only(必須整組一致)' },
    disabled: { control: 'boolean' },
  },
  render: (args) => (
    <div className="max-w-md">
      <SegmentedControl {...args}>
        {args.iconOnly ? (
          <>
            <SegmentedControlItem value="day" startIcon={AlignLeft} aria-label="日" />
            <SegmentedControlItem value="week" startIcon={AlignCenter} aria-label="週" />
            <SegmentedControlItem value="month" startIcon={AlignRight} aria-label="月" />
          </>
        ) : (
          <>
            <SegmentedControlItem value="day">日</SegmentedControlItem>
            <SegmentedControlItem value="week">週</SegmentedControlItem>
            <SegmentedControlItem value="month">月</SegmentedControlItem>
          </>
        )}
      </SegmentedControl>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>四種 Size — 對齊 field-height / button 系統</H3>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>Token</Th><Th>Padding</Th><Th>字體</Th><Th>Icon</Th></tr></thead>
            <tbody>
              <tr><Td mono>xs</Td><Td mono>--field-height-xs(固定)</Td><Td mono>px-2</Td><Td>text-caption</Td><Td mono>16</Td></tr>
              <tr><Td mono>sm</Td><Td mono>--field-height-sm</Td><Td mono>px-3</Td><Td>text-body</Td><Td mono>16</Td></tr>
              <tr><Td mono>md ★default</Td><Td mono>--field-height-md</Td><Td mono>px-3</Td><Td>text-body</Td><Td mono>16</Td></tr>
              <tr><Td mono>lg</Td><Td mono>--field-height-lg</Td><Td mono>px-3</Td><Td>text-body-lg</Td><Td mono>20</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4">
          {(['xs', 'sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="flex items-center gap-4">
              <span className="text-caption text-fg-muted font-mono w-14">{size}</span>
              <SegmentedControl size={size} defaultValue="a">
                <SegmentedControlItem value="a">日</SegmentedControlItem>
                <SegmentedControlItem value="b">週</SegmentedControlItem>
                <SegmentedControlItem value="c">月</SegmentedControlItem>
              </SegmentedControl>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>視覺狀態對照</H3>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Bg</Th><Th>Text</Th><Th>Border</Th><Th>Z-index</Th></tr></thead>
            <tbody>
              <tr><Td>Unselected</Td><Td><TokenCell token="--surface" display="bg-surface" /></Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>—</Td></tr>
              <tr><Td>Hover unselected</Td><Td><TokenCell token="--surface" display="bg-surface(不變)" /></Td><Td><TokenCell token="--foreground" display="text-foreground" /></Td><Td><TokenCell token="--border-hover" display="border-border-hover" /></Td><Td mono>z-[5](hover 邊框浮上)</Td></tr>
              <tr><Td>Selected</Td><Td><TokenCell token="--surface" display="bg-surface" /></Td><Td><TokenCell token="--primary-hover" display="text-primary-hover" /></Td><Td><TokenCell token="--primary-hover" display="border-primary-hover" /></Td><Td mono>z-10(浮在相鄰 item border 上)</Td></tr>
              <tr><Td>Disabled</Td><Td>灰化</Td><Td>灰化</Td><Td>—</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="text-caption text-fg-muted w-32">Normal(hover 測試)</span>
            <SegmentedControl defaultValue="b">
              <SegmentedControlItem value="a">日</SegmentedControlItem>
              <SegmentedControlItem value="b">週</SegmentedControlItem>
              <SegmentedControlItem value="c">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-caption text-fg-muted w-32">整組 disabled</span>
            <SegmentedControl defaultValue="b" disabled>
              <SegmentedControlItem value="a">日</SegmentedControlItem>
              <SegmentedControlItem value="b">週</SegmentedControlItem>
              <SegmentedControlItem value="c">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-caption text-fg-muted w-32">單獨 item disabled</span>
            <SegmentedControl defaultValue="a">
              <SegmentedControlItem value="a">日</SegmentedControlItem>
              <SegmentedControlItem value="b">週</SegmentedControlItem>
              <SegmentedControlItem value="c" disabled>月(beta)</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>
      </div>

      <div>
        <H3>Item 連體手法</H3>
        <Desc>Items 之間 `-ml-px`(除第一個)讓相鄰 border 重疊、視覺上只有一條線。Selected item 的 `z-10` 讓它的 border 浮在相鄰 item 之上,避免被重疊 border 切掉。第一個 item `rounded-l-md`,最後一個 `rounded-r-md`,中間 `rounded-none`。</Desc>
      </div>
    </div>
  ),
}

export const FullWidthMatrix: Story = {
  name: 'fullWidth 行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>fullWidth = false(預設,hug content)</H3>
        <Desc>寬度由 item 總寬決定,items 各自照內容寬度排列。Toolbar 場景 / 跟 Button 並排時使用。</Desc>
        <div className="flex items-center gap-4 border border-dashed border-divider rounded-md p-4">
          <SegmentedControl defaultValue="list">
            <SegmentedControlItem value="list" startIcon={List} aria-label="清單" />
            <SegmentedControlItem value="grid" startIcon={LayoutGrid} aria-label="格狀" />
            <SegmentedControlItem value="calendar" startIcon={Calendar} aria-label="行事曆" />
          </SegmentedControl>
          <span className="text-caption text-fg-muted">← 寬度 hug content</span>
        </div>
      </div>

      <div>
        <H3>fullWidth = true(撐滿父容器 + 等分)</H3>
        <Desc>所有 item 等分父容器寬度。小容器 / 狹窄上下文(mobile、Dialog、Sheet、Field row)使用。</Desc>
        <div className="flex flex-col gap-3 max-w-md">
          <div className="border border-dashed border-divider rounded-md p-4">
            <SegmentedControl defaultValue="day" fullWidth>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
          <div className="w-[280px] border border-dashed border-divider rounded-md p-4">
            <SegmentedControl defaultValue="day" fullWidth>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
            <span className="text-footnote text-fg-muted mt-2 block">↑ 固定 280px 容器:items 等分寬度</span>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const IconOnlyMatrix: Story = {
  name: '純圖示（群組層）',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>iconOnly 是 group-level,不是 item-level</H3>
        <Desc>**必須整組一致**:要嘛全部 icon-only,要嘛全部帶 label。混搭會讓使用者無法預測哪個 item 有 tooltip、哪個沒有,也破壞 segmented 的對稱感。iconOnly 時每個 item 變正方形(`aspect-square p-0`),必須設 aria-label(dev-mode runtime warn,非 TS 強制),自動渲染 tooltip。</Desc>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="text-caption text-fg-muted w-24">對齊選擇</span>
            <SegmentedControl iconOnly defaultValue="left">
              <SegmentedControlItem value="left" startIcon={AlignLeft} aria-label="靠左" />
              <SegmentedControlItem value="center" startIcon={AlignCenter} aria-label="置中" />
              <SegmentedControlItem value="right" startIcon={AlignRight} aria-label="靠右" />
            </SegmentedControl>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-caption text-fg-muted w-24">檢視模式</span>
            <SegmentedControl iconOnly defaultValue="list">
              <SegmentedControlItem value="list" startIcon={List} aria-label="清單" />
              <SegmentedControlItem value="grid" startIcon={LayoutGrid} aria-label="格狀" />
              <SegmentedControlItem value="calendar" startIcon={Calendar} aria-label="行事曆" />
            </SegmentedControl>
          </div>
        </div>
        <p className="text-footnote text-error font-medium mt-3">❌ 禁止:iconOnly 和帶 label 的 item 混搭——必須全組一致</p>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"  ARIA / Pattern  :繼承 Radix toggle-group primitive 的無障礙預設——整組 role=\"group\",每個 item role=\"radio\"(type=\"single\" 互斥選一),鍵盤導覽由 primitive 處理。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/toggle-group#accessibility)。\n\n  Keyboard 行為  :\n\n- Tab — 進入整組(只有一個 tab 停留點,落在選中項;沒選就落第一項)\n- ←/→ — 在 item 之間移動 roving focus(只移焦點,不切換選取)。WAI-ARIA APG 對水平 segmented/radio group 的主要導覽鍵\n- ↑/↓ — 同 ←/→,也會在 item 間移動 roving focus。Radix toggle-group 未鎖 orientation(沿用 default 雙軸 roving),APG 接受 group 同時支援兩軸方向鍵\n- Enter / Space — 選取目前 focus 的 item\n\n  Focus  :採 roving tabindex——整組共用一個 tab 停留點,方向鍵在 item 間移動焦點(選取仍需 Enter/Space/click);不是 Dialog 那種把焦點關在裡面的 focus trap。Focus ring 對齊 Button:focus-visible:ring-2 ring-ring ring-offset-1(box-shadow ring,非 CSS outline)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}
