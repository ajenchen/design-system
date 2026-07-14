// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// M22 retrofit DONE 2026-05-03 v11(spec.md SSOT bears full citations; this file's claims are spec-derived rationale stories)
import * as React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { TimePicker } from './time-picker'
import { Field, FieldLabel } from '@/design-system/components/Field/field'

/**
 * TimePicker 設計原則 stories — 讀 `time-picker.spec.md` 了解完整規則。
 * 每則 story 示範一條設計判斷(何時用、何時不用、禁止事項)。
 */

const meta: Meta<typeof TimePicker> = {
  title: 'Design System/Components/TimePicker/設計原則',
  component: TimePicker,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof TimePicker>

/**
 * Rule:會議場景 minuteStep=15
 * 世界級(Google Calendar / Outlook / Notion Calendar)開會排時間都是 15 分鐘粒度——
 * minuteStep=1 讓使用者困在挑「9:07 還是 9:08」,失去會議排程本質。
 */
// ── WhenToUse — 何時使用 TimePicker ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 TimePicker 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/TimePicker/展示" name="會議時段"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">會議時段</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/TimePicker/展示" name="航班起飛時間"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">航班起飛時間</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/TimePicker/展示" name="店家營業時間"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">店家營業時間</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/TimePicker/展示" name="事件發生時間"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">事件發生時間</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/TimePicker/展示" name="員工上班時段設定"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">員工上班時段設定</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">不確定是否該用 TimePicker 時,先對照下方「何時不用」清單;若情境不符,改用清單建議的替代元件(例如同時要日期就用 DatePicker)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div className="prose prose-sm max-w-prose space-y-4">
      <p>TimePicker 只管時間,以下情境改用其他元件:</p>
      <ul className="list-disc list-inside space-y-1 text-fg-secondary">
        <li><strong>同時選日期和時間</strong> → DatePicker 加 showTime prop（canonical 2026-05-02，Ant idiom；非 DatePicker + TimePicker 並列，見 DatePicker 設計原則）。Linear 的 reminder「日期 + 時間」是單一 datetime picker</li>
        <li><strong>時間範圍（from-to）</strong> → 兩個 TimePicker 並列。Google Calendar 的 event time 是兩個 picker</li>
        <li><strong>純文字時間輸入</strong> → Input + validation。開發者工具用 Input</li>
        <li><strong>倒數計時或相對時間</strong> → 自訂計時器。TimePicker 是 wall-clock time（09:30），不是 duration</li>
      </ul>
    </div>
    </div>
  ),
}

export const RuleMinuteStepForMeetings: Story = {
  name: '會議時段用 15 分鐘間隔',
  render: () => (
    <div className="flex gap-8">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-caption font-medium text-foreground">✅ minuteStep=15</h3>
        <Field>
          <FieldLabel>專案週會時間</FieldLabel>
          <TimePicker value="09:15" onChange={() => {}} minuteStep={15} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-caption font-medium text-fg-muted">❌ 預設 minuteStep=1(會議排程無意義)</h3>
        <Field>
          <FieldLabel>專案週會時間</FieldLabel>
          <TimePicker value="09:07" onChange={() => {}} />
        </Field>
      </div>
    </div>
  ),
}

/**
 * Rule:Range 語意用兩個 TimePicker 組合
 * TimePicker MVP 不內建 Range(見 spec「為何無 Range」)——對齊 Ant composition 思路,
 * consumer 用兩個 TimePicker + arrow 達成營業時段 / 會議時段等 range 場景。
 */
export const RuleRangeComposition: Story = {
  name: '時間範圍用兩個 TimePicker 組合,不內建',
  render: () => {
    const [open, setOpen] = React.useState('10:00')
    const [close, setClose] = React.useState('22:00')
    return (
      <Field>
        <FieldLabel>營業時段(兩個 TimePicker + →)</FieldLabel>
        <div className="flex items-center gap-2">
          <TimePicker value={open} onChange={setOpen} />
          <span className="text-fg-muted">→</span>
          <TimePicker value={close} onChange={setClose} />
        </div>
      </Field>
    )
  },
}

/**
 * 規則:清除用 X 行內動作,不要用文字按鈕
 * 設定 clearable 後,TimePicker 會自動在欄位尾端渲染一個 X 行內動作來清空值,
 * 點擊即清空。不要自己擺一顆「清除」文字按鈕——統一用 X 圖示符合全站慣例。
 */
export const RuleClearNoLabelButton: Story = {
  name: '清除用 X 行內動作,不用文字按鈕',
  render: () => {
    const [t, setT] = React.useState<string>('14:30')
    return (
      <div className="flex flex-col gap-1.5">
        <h3 className="text-caption font-medium text-foreground">✅ clearable=true(自動渲染 X 行內動作)</h3>
        <Field>
          <FieldLabel>提醒時間</FieldLabel>
          <TimePicker value={t} onChange={setT} clearable />
        </Field>
      </div>
    )
  },
}


