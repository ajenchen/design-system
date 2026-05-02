// @anatomy-exempt: composite picker。色彩 / 尺寸繼承 Field + DateGrid + TimeColumns 上游 SSOT,
// 集中 Overview / Inspector / 並列展示而非重覆 ColorMatrix / SizeMatrix。
// @anatomy-rationale:
//   ColorMatrix 已 covered by Field family(`field-controls.spec.md`)+ DateGrid `date-grid.spec.md`
//     + TimeColumns(內 listbox option color):本元件無 own color state。
//   StateBehavior covered by ModeMatrix(edit / readonly / disabled / error)。
import type { Meta, StoryObj } from '@storybook/react'
import { DateTimePicker } from './date-time-picker'

/**
 * DateTimePicker 設計規格 — anatomy 5-story 最小版本(composite 派)。
 * 深度規格見 `date-time-picker.spec.md`。
 */

const meta: Meta<typeof DateTimePicker> = {
  title: 'Design System/Components/DateTimePicker/設計規格',
  component: DateTimePicker,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof DateTimePicker>

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="w-80">
      <DateTimePicker value="2026-04-02T10:30:00" onChange={() => {}} />
    </div>
  ),
}

/** Inspector — 列出所有 props + 預設值,輔助 design <-> dev 溝通 */
export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div className="w-[640px] text-body">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-divider">
            <th className="text-left py-2 px-3">Prop</th>
            <th className="text-left py-2 px-3">Type</th>
            <th className="text-left py-2 px-3">Default</th>
            <th className="text-left py-2 px-3">說明</th>
          </tr>
        </thead>
        <tbody className="text-fg-muted">
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">value</td><td>string ⏐ null</td><td>—</td><td>ISO 8601 datetime</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">onChange</td><td>(v) ⇒ void</td><td>—</td><td>commit datetime</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">needConfirm</td><td>boolean</td><td>true</td><td>對齊 Ant — 必按 OK 才 commit</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">showSeconds</td><td>boolean</td><td>false</td><td>顯示秒欄(三欄 picker)</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">minuteStep</td><td>1⏐5⏐10⏐15⏐30</td><td>1</td><td>會議常用 15</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">size</td><td>sm⏐md⏐lg</td><td>md</td><td>對齊 field-height token</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">clearable</td><td>boolean</td><td>false</td><td>trigger 顯 ✕ inline action</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">error</td><td>boolean</td><td>false</td><td>border 變 error color</td></tr>
          <tr className="border-b border-divider"><td className="py-2 px-3 font-mono">mode</td><td>edit⏐readonly⏐disabled</td><td>edit</td><td>readonly = 純 display 不可開 popover</td></tr>
        </tbody>
      </table>
    </div>
  ),
}

/** ColorMatrix — 繼承 Field + DateGrid + TimeColumns 上游,本元件無 own color。 */
export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="w-[480px] text-body flex flex-col gap-3">
      <h3 className="font-bold">Trigger 色彩</h3>
      <p className="text-fg-muted">繼承 <code>fieldWrapperStyles</code>(同 DatePicker / TimePicker / Input):</p>
      <ul className="text-fg-muted ml-4 list-disc">
        <li>default border:<code>--border</code></li>
        <li>hover:<code>--border-hover</code></li>
        <li>focus-within:<code>--primary</code>(blue ring)</li>
        <li>error:<code>--error</code> + focus-within 同色</li>
        <li>disabled:<code>--surface-disabled</code> + cursor-not-allowed</li>
      </ul>
      <h3 className="font-bold mt-3">Popover panel 色彩</h3>
      <ul className="text-fg-muted ml-4 list-disc">
        <li>Calendar grid:<code>DateGrid</code> 提供(date-grid.spec.md)</li>
        <li>Time column option:<code>TimeColumns</code> 提供(<code>--neutral-hover</code>/<code>--neutral-selected</code>)</li>
        <li>Now button:<code>Button variant=tertiary</code></li>
        <li>OK button:<code>Button variant=primary</code></li>
      </ul>
    </div>
  ),
}

/** SizeMatrix — 3 sizes 對齊 field-height token */
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="w-80 flex flex-col gap-4">
      <div>
        <p className="text-caption text-fg-muted mb-1">size=sm(28px)</p>
        <DateTimePicker size="sm" value="2026-04-02T10:30:00" onChange={() => {}} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">size=md(32px,預設)</p>
        <DateTimePicker size="md" value="2026-04-02T10:30:00" onChange={() => {}} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">size=lg(40px)</p>
        <DateTimePicker size="lg" value="2026-04-02T10:30:00" onChange={() => {}} />
      </div>
    </div>
  ),
}

/** StateBehavior — 4 mode + error,trigger 視覺對照 */
export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="w-80 flex flex-col gap-4">
      <div>
        <p className="text-caption text-fg-muted mb-1">edit(預設 — 可點開 popover)</p>
        <DateTimePicker value="2026-04-02T10:30:00" onChange={() => {}} />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">edit + clearable</p>
        <DateTimePicker value="2026-04-02T10:30:00" onChange={() => {}} clearable />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">edit + error</p>
        <DateTimePicker value="2026-04-02T10:30:00" onChange={() => {}} error />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">readonly(純 display)</p>
        <DateTimePicker mode="readonly" value="2026-04-02T10:30:00" />
      </div>
      <div>
        <p className="text-caption text-fg-muted mb-1">disabled</p>
        <DateTimePicker disabled value="2026-04-02T10:30:00" />
      </div>
    </div>
  ),
}

/** Accessibility — keyboard map + ARIA roles */
export const Accessibility: Story = {
  name: 'A11y',
  render: () => (
    <div className="w-[560px] text-body flex flex-col gap-3">
      <h3 className="font-bold">ARIA roles</h3>
      <ul className="text-fg-muted ml-4 list-disc">
        <li>Trigger:<code>role=combobox</code> + <code>aria-haspopup=dialog</code> + <code>aria-expanded</code></li>
        <li>Popover content wrapper:<code>role=dialog</code></li>
        <li>Calendar grid:<code>role=grid</code>(DateGrid 提供)</li>
        <li>Time columns:<code>role=listbox</code> + 每 cell <code>role=option</code> + <code>aria-selected</code></li>
      </ul>
      <h3 className="font-bold mt-3">Keyboard map</h3>
      <table className="w-full border-collapse text-fg-muted">
        <tbody>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Tab / Shift+Tab</td><td>進 / 出 trigger / popover sections</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Enter / Space</td><td>觸發 trigger 開 popover;option 上選值</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Arrow keys</td><td>Calendar 內格移動(WCAG grid pattern)</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">↑ / ↓</td><td>Time column 內 step</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Home / End</td><td>Time column 跳第一 / 最後 option</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Esc</td><td>關 popover(不 commit)</td></tr>
          <tr className="border-b border-divider"><td className="py-1 pr-4 font-mono">Page Up / Down</td><td>Calendar 換月</td></tr>
        </tbody>
      </table>
    </div>
  ),
}
