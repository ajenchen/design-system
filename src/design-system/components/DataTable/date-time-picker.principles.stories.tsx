// @principles-canonical: Polaris-aligned UsageGuidance + Rule blocks(spec rule note 派)
import type { Meta, StoryObj } from '@storybook/react'
import { DateTimePicker, DateTimeRangePicker } from './date-time-picker'

/**
 * DateTimePicker / DateTimeRangePicker 設計原則 — 為什麼這些 default?何時不該用?
 * 詳見 `date-time-picker.spec.md` 何時用 / 何時不用 / 常見誤解 / 禁止事項。
 */

const meta: Meta = {
  title: 'Design System/Components/DateTimePicker/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

/** UsageGuidance — 何時用 / 何時不用(對齊 Polaris UsageGuidelines)。 */
export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="max-w-[640px] flex flex-col gap-6 text-body">
      <section>
        <h3 className="font-bold text-foreground mb-2">何時用</h3>
        <ul className="ml-4 list-disc text-fg-muted">
          <li>業務語意需要「日期 + 時間」原子捕捉(會議起訖、deadline、log timestamp)</li>
          <li>DataTable column <code>meta.includeTime=true</code> 自動切到 datetime 變體</li>
          <li>需要 ms-precision 比對(避開 Airtable「day-precision 漏邊界」地雷)</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-foreground mb-2">何時不用</h3>
        <ul className="ml-4 list-disc text-fg-muted">
          <li>只需日期 → 用 <code>DatePicker</code></li>
          <li>只需時間 → 用 <code>TimePicker</code></li>
          <li>跨多天行程列表 → 屬 calendar app,不是 picker</li>
          <li>純文字 ISO 編輯(技術人 use case)→ 用 <code>Input</code></li>
        </ul>
      </section>
    </div>
  ),
}

/** Rule:datetime needConfirm=true 預設 — time scroll 沒明確結束訊號 */
export const RuleNeedConfirmDefault: Story = {
  name: 'Rule:needConfirm=true 預設,對齊 Ant',
  render: () => (
    <div className="max-w-[640px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        time column 是 scroll 操作,**沒有明確「結束」訊號**(滾完不代表 user 確認)。預設
        <code>needConfirm=true</code> 讓 user 必按 OK 才 commit,避免意外 commit 錯時間。
      </p>
      <p className="text-fg-muted">業界對標:Ant Design DatePicker showTime 預設 needConfirm=true。</p>
      <DateTimePicker value="2026-04-02T10:30:00" onChange={() => {}} />
    </div>
  ),
}

/** Rule:Range single-calendar layout(對齊 Ant 實際,不 2 calendars) */
export const RuleRangeSingleCalendarLayout: Story = {
  name: 'Rule:Range 用 single calendar layout',
  render: () => (
    <div className="max-w-[640px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        Ant DatePicker showTime + RangePicker 實際行為是 **single calendar + time panel**,
        不是 2 calendars 並排。寬度友善 + UX 一致。MUI X 的 stacked tab views 增加操作成本,我們不採。
      </p>
      <DateTimeRangePicker
        value={['2026-04-02T09:00:00', '2026-04-05T18:00:00']}
        onChange={() => {}}
      />
    </div>
  ),
}

/** Rule:Range state machine 用 active end 切換,不同時編兩端 */
export const RuleRangeActiveEndStateMachine: Story = {
  name: 'Rule:Range 用 active end 切換',
  render: () => (
    <div className="max-w-[640px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        同 popover 同時編 start + end 會 ambiguous(計 calendar click 哪端?time scroll 哪端?)。
        改用 **state machine**:active end = start | end,點 calendar / 滾 time 套 active end;
        footer Editing 切換器 + aria-live polite 讓 SR 讀。
      </p>
    </div>
  ),
}

/** Rule:M17 SSOT — 共用 TimeColumns primitive */
export const RuleSharedTimeColumnsSSOT: Story = {
  name: 'Rule:Time columns 走 TimePicker/time-columns 共用 primitive',
  render: () => (
    <div className="max-w-[640px] flex flex-col gap-3 text-body">
      <p className="text-fg-muted">
        H/M/S column scroll selector 由 <code>TimePicker/time-columns.tsx</code> SSOT 提供 —
        TimePicker / DateTimePicker / DateTimeRangePicker **三個 consumer 共用**(M17 Rule-of-3 滿足)。
        Disabled hours/minutes/seconds 透過 <code>disabled</code> prop 動態傳;
        ArrowUp/Down/Home/End keyboard nav 內建。
      </p>
    </div>
  ),
}
