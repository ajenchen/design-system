// M22 retrofit DONE 2026-05-03 v11(spec.md SSOT bears full citations; anatomy claim「Ant Design / Google Calendar TimePicker」line 150 = spec-derived `@benchmark-unverified` visual)
// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   StateBehavior covered by ColorMatrix「Trigger Field family + Panel item
//     SelectMenu family」雙層狀態對照(trigger:default / hover / focus / open /
//     disabled / error,panel:default / hover / selected / disabled)+ ModeMatrix(6.)
//     edit / readonly / disabled / empty / error / clearable 6 模式視覺對照。
//     TimePicker 的色彩繼承上游 SSOT(Field + SelectMenu),無 own state 變化,
//     集中於 ColorMatrix + ModeMatrix 比拆 5. 更直觀。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TimePicker } from './time-picker'

/**
 * TimePicker 設計規格 — 完整技術規格。anatomy 5-story 最小版本。
 * 深度規格見 `time-picker.spec.md`。
 */

const meta: Meta<typeof TimePicker> = {
  title: 'Design System/Components/TimePicker/設計規格',
  component: TimePicker,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof TimePicker>

export const Overview: Story = {
  name: '元件總覽',
  render: () => <TimePicker value="09:00" onChange={() => {}} />,
}

/**
 * ColorMatrix — Trigger(Field family)+ Panel item(MenuItem family) 色彩對照
 * 兩層色彩分別繼承不同 SSOT,本 story 展示整合對照。
 */
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    const Swatch = ({ value }: { value: string }) => (
      <span className="inline-block w-3 h-3 rounded-sm border border-black/10 align-middle mr-1.5" style={{ backgroundColor: `var(${value})` }} />
    )
    return (
      <div className="flex flex-col gap-10">
        <div>
          <div className="text-h6 font-semibold text-foreground mb-2">TimePicker 色彩分兩層</div>
          <div className="text-caption text-fg-muted max-w-[720px]">
            Trigger 層走 Field Controls family 色彩(與 Input / Select 共用);Panel 層 column item 走 SelectMenu / MenuItem family 色彩(與 Select dropdown / DropdownMenu 共用)。TimePicker 本身無色彩變體——色彩完全繼承上游 SSOT。
          </div>
        </div>

        {/* Trigger layer */}
        <div className="flex flex-col gap-2">
          <div className="text-h6 font-semibold text-foreground">Layer 1:Trigger(Field family)</div>
          <div className="text-caption text-fg-muted mb-2">SSOT:<span className="font-mono">components/Field/field-controls.spec.md</span></div>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">State</th>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">Background</th>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">Border</th>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">Foreground</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">default</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--border" /><span className="font-mono">--border</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">hover</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--border-hover" /><span className="font-mono">--border-hover</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">focus / open</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--primary" /><span className="font-mono">--primary + ring-ring</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">disabled</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--bg-disabled" /><span className="font-mono">--bg-disabled</span></td>
                  <td className="p-2 border-b border-divider"><span className="font-mono">transparent</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--fg-disabled" /><span className="font-mono">--fg-disabled</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">error</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--error" /><span className="font-mono">--error</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-3">
            <TimePicker value="09:00" onChange={() => {}} />
            <TimePicker value="09:00" onChange={() => {}} error />
            <TimePicker value="09:00" onChange={() => {}} disabled />
          </div>
        </div>

        {/* Panel layer */}
        <div className="flex flex-col gap-2">
          <div className="text-h6 font-semibold text-foreground">Layer 2:Panel column item(SelectMenu family)</div>
          <div className="text-caption text-fg-muted mb-2">
            SSOT:<span className="font-mono">patterns/element-anatomy/item-anatomy.spec.md</span>「選擇 / 狀態視覺規則」
          </div>
          <div className="text-caption text-fg-secondary mb-3 max-w-[720px]">
            <strong>關鍵決策:selected 走 neutral 非 primary</strong>(對齊 SelectMenu canonical)。TimePicker panel 是「列表選中」語意,跟 SelectMenu / MenuItem 同流派;DatePicker date cell 用 `--primary` 是因為那是「最終選定日期」的強 affordance(確定性),兩者不同語意,不互調。
          </div>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">State</th>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">Background</th>
                  <th className="text-left p-2 border-b border-divider text-fg-muted font-medium">Foreground</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">default(normal 數字)</td>
                  <td className="p-2 border-b border-divider"><span className="font-mono">transparent</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">hover</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--neutral-hover" /><span className="font-mono">--neutral-hover</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">selected</td>
                  <td className="p-2 border-b border-divider"><Swatch value="--neutral-selected" /><span className="font-mono">--neutral-selected(非 primary)</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                </tr>
                <tr>
                  <td className="p-2 border-b border-divider font-mono">disabled(disabledTime)</td>
                  <td className="p-2 border-b border-divider"><span className="font-mono">transparent</span></td>
                  <td className="p-2 border-b border-divider"><Swatch value="--fg-disabled" /><span className="font-mono">--fg-disabled + cursor-not-allowed</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-caption text-fg-muted mt-3">
            對照 DatePicker `ColorMatrix` 的 date cell selected 用 `--primary` — 那是「提交語意」;TimePicker 是「正在挑選」中的中間態,neutral-selected 與 Ant Design / Google Calendar TimePicker 一致。點開本頁 TimePicker trigger 可直接看到 Panel selected 的視覺效果。
          </div>
        </div>
      </div>
    )
  },
}

/** 尺寸矩陣 sm / md(預設) / lg */
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-12 text-caption text-fg-muted">sm</span>
        <TimePicker size="sm" value="09:00" onChange={() => {}} />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-12 text-caption text-fg-muted">md ★default</span>
        <TimePicker size="md" value="09:00" onChange={() => {}} />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-12 text-caption text-fg-muted">lg</span>
        <TimePicker size="lg" value="09:00" onChange={() => {}} />
      </div>
    </div>
  ),
}

/** Mode / error 狀態 matrix */
export const ModeMatrix: Story = {
  name: '模式對照',
  render: () => (
    <div className="flex flex-col gap-3 w-60">
      <TimePicker value="09:00" onChange={() => {}} placeholder="edit(預設)" aria-label="edit mode demo" />
      <TimePicker value="09:00" onChange={() => {}} mode="readonly" aria-label="readonly mode demo" />
      <TimePicker value="09:00" onChange={() => {}} disabled aria-label="disabled mode demo" />
      <TimePicker value="" onChange={() => {}} placeholder="空值 → placeholder" aria-label="empty value demo" />
      <TimePicker value="09:00" onChange={() => {}} error aria-label="error state demo" />
      <TimePicker value="09:00" onChange={() => {}} clearable aria-label="clearable demo" />
    </div>
  ),
}

/** Panel 精度:showSeconds 三欄 vs 兩欄 / minuteStep 粒度 */
export const PrecisionMatrix: Story = {
  name: '精度對照',
  render: () => (
    <div className="flex flex-col gap-3 w-80">
      <div>
        <div className="text-caption text-fg-muted mb-1">兩欄(showSeconds=false,預設)</div>
        <TimePicker value="09:00" onChange={() => {}} />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">三欄(showSeconds=true)</div>
        <TimePicker value="09:00:00" onChange={() => {}} showSeconds />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">minuteStep=15(會議常用)</div>
        <TimePicker value="09:00" onChange={() => {}} minuteStep={15} />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">disabledTime:0-5 點不可選</div>
        <TimePicker
          value="09:00"
          onChange={() => {}}
          disabledTime={() => ({ disabledHours: [0, 1, 2, 3, 4, 5] })}
        />
      </div>
    </div>
  ),
}

/** Inspector — live props 調整驗規格 */
export const Inspector: Story = {
  name: '元件檢閱器',
  args: {
    value: '09:00',
    size: 'md',
    clearable: false,
    showSeconds: false,
    minuteStep: 1,
    disabled: false,
    error: false,
    placeholder: '請選擇時間',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    minuteStep: { control: 'inline-radio', options: [1, 5, 10, 15, 30] },
  },
  render: (args) => {
    const [v, setV] = React.useState(args.value ?? '')
    return <TimePicker {...args} value={v} onChange={setV} />
  },
}
