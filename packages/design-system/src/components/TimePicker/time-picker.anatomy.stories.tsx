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
import { ExampleSection } from '@/design-system/stories-helpers/examples/tutorial-page'

/**
 * TimePicker 設計規格 — 完整技術規格。anatomy 7 story(6-canonical 去 StateBehavior,
 * 加元件特有 ModeMatrix / PrecisionMatrix;見 spec「為何無 StateBehavior」)。
 * 深度規格見 `time-picker.spec.md`。
 */

const meta: Meta<typeof TimePicker> = {
  title: 'Design System/Components/TimePicker/設計規格',
  component: TimePicker,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof TimePicker>

// 規格頁 / 原則頁 / 展示頁的樣本也要能操作(F-S2「畫面上看得到的按鈕都要能動」):受控元件自帶一份 state,改值會真的改
function LiveTimePicker({ value: initial, ...rest }: React.ComponentProps<typeof TimePicker>) {
  const [value, setValue] = React.useState(initial)
  return <TimePicker {...rest} value={value} onChange={setValue} />
}


// 2026-09-17:這個元件本來定義在 story 的 `render()` 裡面。React 用「元件函式的身分」判斷是不是同一棵樹,
// 每次 setState 都會重新建立一個新的函式 → React 視為換了元件 → 底下整棵樹**卸載重掛**。
// 在 DataTable 那支上的實際後果:篩選面板一開著,點任何一個選項(不是只有新的全選按鈕)整個面板就消失。
// 抓到它的是 `scripts/select-all-footer-invariant.mjs`;同一天全 DS 掃出同一寫法五處,一起搬出來。
const Swatch = ({ value }: { value: string }) => (
  <span className="inline-block w-3 h-3 rounded-sm border border-black/10 align-middle mr-1.5" style={{ backgroundColor: `var(${value})` }} />
)

export const Overview: Story = {
  name: '元件總覽',
  render: () => <LiveTimePicker value="09:00" aria-label="時間選擇器總覽" />,
}

// ColorMatrix — Trigger(Field family)+ Panel item(MenuItem family) 色彩對照;兩層色彩分別繼承不同 SSOT,本 story 展示整合對照。
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => {
    return (
      <ExampleSection title="TimePicker 色彩分兩層" description={<>Trigger 層走 Field Controls family 色彩(與 Input / Select 共用);Panel 層 column item 走 SelectMenu / MenuItem family 色彩(與 Select dropdown / DropdownMenu 共用)。TimePicker 本身無色彩變體——色彩完全繼承上游 主檔。</>}>
        <div className="flex flex-col gap-10">

          {/* Trigger layer */}
          <ExampleSection title="第 1 層:觸發欄位(沿用一般輸入欄位配色)" description="色彩與 Input / Select 等輸入欄位共用同一套規則。">
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
                    <td className="p-2 border-b border-divider font-mono">focus(focus-within)</td>
                    <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                    <td className="p-2 border-b border-divider"><Swatch value="--primary" /><span className="font-mono">--primary</span></td>
                    <td className="p-2 border-b border-divider"><Swatch value="--foreground" /><span className="font-mono">--foreground</span></td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-divider font-mono">open(autofocus 移入 panel)</td>
                    <td className="p-2 border-b border-divider"><Swatch value="--surface" /><span className="font-mono">--surface</span></td>
                    <td className="p-2 border-b border-divider"><Swatch value="--border-hover" /><span className="font-mono">--border-hover</span></td>
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
            <div className="flex gap-3">
              <LiveTimePicker value="09:00" aria-label="時間欄位配色(預設)" />
              <LiveTimePicker value="09:00" error aria-label="時間欄位配色(錯誤狀態)" />
              <LiveTimePicker value="09:00" disabled aria-label="時間欄位配色(停用)" />
            </div>
          </ExampleSection>

          {/* Panel layer */}
          <ExampleSection title="第 2 層:面板裡的時 / 分 / 秒選項(沿用下拉選單配色)" description="選項的 hover / 選中 / 停用配色,與下拉選單(Select / 選單項目)的選取狀態共用同一套規則。">
            <div className="text-caption text-fg-secondary max-w-[720px]">
              <strong>關鍵決策:selected 走 neutral 非 primary</strong>(對齊 SelectMenu 設計準則)。TimePicker panel 是「列表選中」語意,跟 SelectMenu / MenuItem 同流派;DatePicker date cell 用 <code>--primary</code> 是因為那是「最終選定日期」的強 affordance(確定性),兩者不同語意,不互調。
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
            <div className="text-caption text-fg-muted">
              對照 DatePicker <code>ColorMatrix</code> 的 date cell selected 用 <code>--primary</code> — 那是「提交語意」;TimePicker 是「正在挑選」中的中間態,neutral-selected 與 Ant Design / Google Calendar TimePicker 一致。點開本頁 TimePicker trigger 可直接看到 Panel selected 的視覺效果。
            </div>
          </ExampleSection>
        </div>
      </ExampleSection>
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
        <LiveTimePicker size="sm" value="09:00" aria-label="小尺寸時間選擇器" />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-12 text-caption text-fg-muted">md ★default</span>
        <LiveTimePicker size="md" value="09:00" aria-label="中尺寸時間選擇器" />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-12 text-caption text-fg-muted">lg</span>
        <LiveTimePicker size="lg" value="09:00" aria-label="大尺寸時間選擇器" />
      </div>
    </div>
  ),
}

/** Mode / error 狀態 matrix */
export const ModeMatrix: Story = {
  name: '模式對照',
  render: () => (
    <div className="flex flex-col gap-3 w-60">
      <LiveTimePicker value="09:00" placeholder="edit(預設)" aria-label="edit mode demo" />
      <LiveTimePicker value="09:00" mode="readonly" aria-label="readonly mode demo" />
      <LiveTimePicker value="09:00" disabled aria-label="disabled mode demo" />
      <LiveTimePicker value="" placeholder="空值 → placeholder" aria-label="empty value demo" />
      <LiveTimePicker value="09:00" error aria-label="error state demo" />
      <LiveTimePicker value="09:00" clearable aria-label="clearable demo" />
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
        <LiveTimePicker value="09:00" aria-label="時分兩欄時間選擇器" />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">三欄(showSeconds=true)</div>
        <LiveTimePicker value="09:00:00" showSeconds aria-label="時分秒三欄時間選擇器" />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">minuteStep=15(會議常用)</div>
        <LiveTimePicker value="09:00" minuteStep={15} aria-label="15 分鐘間隔時間選擇器" />
      </div>
      <div>
        <div className="text-caption text-fg-muted mb-1">disabledTime:0-5 點不可選</div>
        <LiveTimePicker
          value="09:00"
          disabledTime={() => ({ disabledHours: [0, 1, 2, 3, 4, 5] })}
          aria-label="限制可選時段的時間選擇器"
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
    return <TimePicker {...args} value={v} onChange={setV} aria-label="時間選擇器檢閱器" />
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Accessibility — ARIA roles + keyboard map
// ═══════════════════════════════════════════════════════════════════════════

export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="flex flex-col gap-6 max-w-3xl text-body">
      <ExampleSection title="ARIA roles" paragraph>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li>Trigger:<code>role="combobox"</code> + <code>aria-expanded={`{open}`}</code>;在 <code>{'<Field>'}</code> 內以 <code>aria-labelledby</code> 指向 field label(無 Field 時 consumer 需自帶 <code>aria-label</code>)</li>
          <li>Panel:每欄(時 / 分 / 秒)<code>role="listbox"</code></li>
          <li>每 item:<code>role="option"</code> + <code>aria-selected</code> 反映當前 value</li>
          <li>Screen reader 經 trigger label(field label)+ combobox 內可見值文字朗讀目前選取時間(目前值以可見 <code>{'<span>'}</code> 呈現,無額外 <code>aria-valuetext</code>)</li>
        </ul>
      </ExampleSection>
      <ExampleSection title="鍵盤導覽(WAI-ARIA listbox pattern)" paragraph>
        <ul className="list-disc list-inside text-caption text-fg-secondary space-y-1">
          <li>Trigger:<kbd>Space</kbd> / <kbd>Enter</kbd> / <kbd>↓</kbd> 開 panel(對齊 APG combobox + Select)</li>
          <li>Panel 開啟:<kbd>Esc</kbd> 關閉 + focus return to trigger</li>
          <li>Column 內:<kbd>↑</kbd> <kbd>↓</kbd> 切 option</li>
          <li><kbd>Home</kbd> <kbd>End</kbd> 跳 column 首尾</li>
          <li><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> 切換 column(時 → 分 → 秒)</li>
        </ul>
      </ExampleSection>
    </div>
  ),
}
