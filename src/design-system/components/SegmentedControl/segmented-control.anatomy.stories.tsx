import type { Meta, StoryObj } from '@storybook/react'
import { AlignLeft, AlignCenter, AlignRight, List, LayoutGrid, Calendar } from 'lucide-react'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'
import { Badge } from '@/design-system/components/Badge/badge'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/SegmentedControl/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>SegmentedControl(role="radiogroup")+ N 個 Item(role="radio",N = 2-5)。Items 連體展示,基於 Radix ToggleGroup(type="single")。內部結構 mirror Button(gap-1、label px-1、suffix gap-1)。</Desc>
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
                ['  suffix', 'ReactNode', '—', 'label 右側(badge 等)'],
                ['  aria-label', 'string', '(iconOnly 必填)', 'iconOnly 時 TS 強制必填,自動渲染 tooltip'],
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

export const SizeMatrix: Story = {
  name: 'Size 對照',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>四種 Size — 對齊 field-height / button 系統</H3>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>Token</Th><Th>Padding</Th><Th>字體</Th><Th>Icon</Th></tr></thead>
            <tbody>
              <tr><Td mono>xs</Td><Td mono>--field-height-xs(固定)</Td><Td mono>px-2</Td><Td>text-caption</Td><Td mono>14</Td></tr>
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
  name: '狀態行為(selected / hover / disabled)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>視覺狀態對照</H3>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Bg</Th><Th>Text</Th><Th>Border</Th><Th>Z-index</Th></tr></thead>
            <tbody>
              <tr><Td>Unselected</Td><Td><TokenCell token="--surface" display="bg-surface" /></Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>—</Td></tr>
              <tr><Td>Hover unselected</Td><Td><TokenCell token="--surface" display="bg-surface(不變)" /></Td><Td><TokenCell token="--foreground" display="text-foreground" /></Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>—</Td></tr>
              <tr><Td>Selected</Td><Td><TokenCell token="--surface" display="bg-surface" /></Td><Td><TokenCell token="--primary" display="text-primary" /></Td><Td><TokenCell token="--primary" display="border-primary" /></Td><Td mono>z-10(浮在相鄰 item border 上)</Td></tr>
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
  name: 'iconOnly(group-level)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>iconOnly 是 group-level,不是 item-level</H3>
        <Desc>**必須整組一致**:要嘛全部 icon-only,要嘛全部帶 label。混搭會讓使用者無法預測哪個 item 有 tooltip、哪個沒有,也破壞 segmented 的對稱感。iconOnly 時每個 item 變正方形(`aspect-square p-0`),必須設 aria-label(TS 強制),自動渲染 tooltip。</Desc>
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
