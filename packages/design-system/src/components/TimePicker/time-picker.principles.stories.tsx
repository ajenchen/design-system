// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// M22 retrofit DONE 2026-05-03 v11(spec.md SSOT bears full citations; this file's claims are spec-derived rationale stories)
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TimePicker } from './time-picker'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

/**
 * TimePicker 設計原則 stories — 讀 `time-picker.spec.md` 了解完整規則。
 * 每則 story 示範一條設計判斷(何時用、何時不用、禁止事項)。
 */

const meta: Meta<typeof TimePicker> = {
  title: 'Design System/Components/TimePicker/設計原則',
  component: TimePicker,
  // 2026-10-20 N1:原本 centered(全 DS 67 個教學頁裡唯一一頁置中,內容浮在畫面中間);教學頁一律 padded
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof TimePicker>

// 規則外框 = 共用教學頁元件;並排比較的範例同寬(w-60),說明 = ExampleCaption 貼在範例下方
// (2026-10-20 N1 / T5:原本兩則規則沒有規則標題,✅ / ❌ 是手寫的 12px h3,並排的兩個欄位寬度跟著小標長度變成 106 / 219px)
const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

// ── UsageGuidance — 何時用 / 何時不用 / 和相近元件怎麼選 ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>只選「幾點幾分」(牆上時鐘的時間,例如 09:30):會議時段、航班起飛、店家營業時間、事件發生時間、員工上班時段。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/TimePicker/展示" name="會議時段">會議時段</StoryLink></li>
          <li><StoryLink kind="Design System/Components/TimePicker/展示" name="航班起飛時間">航班起飛時間</StoryLink></li>
          <li><StoryLink kind="Design System/Components/TimePicker/展示" name="店家營業時間">店家營業時間</StoryLink></li>
          <li><StoryLink kind="Design System/Components/TimePicker/展示" name="事件發生時間">事件發生時間</StoryLink></li>
          <li><StoryLink kind="Design System/Components/TimePicker/展示" name="員工上班時段設定">員工上班時段設定</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li><strong>同時選日期和時間</strong> → DatePicker 加 showTime(一個日期時間選擇器,不是 DatePicker + TimePicker 並排)。Linear 的提醒「日期 + 時間」就是單一個選擇器</li>
          <li><strong>純文字時間輸入</strong> → Input + 驗證。開發者工具用 Input</li>
          <li><strong>倒數計時或相對時間</strong> → 自訂計時器。TimePicker 是牆上時鐘的時間(09:30),不是時長</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>DatePicker</strong> —— 選日期;要日期加時間就用它的 showTime,TimePicker 只管時間</li>
          <li><strong>兩個 TimePicker 並排</strong> —— 時間範圍(起 – 迄)用兩個並列,TimePicker 本身不做範圍。Google Calendar 的活動時間就是兩個選擇器(見展示「店家營業時間」)</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

/**
 * Rule:會議場景 minuteStep=15
 * 世界級(Google Calendar / Outlook / Notion Calendar)開會排時間都是 15 分鐘粒度——
 * minuteStep=1 讓使用者困在挑「9:07 還是 9:08」,失去會議排程本質。
 */
export const RuleMinuteStepForMeetings: Story = {
  name: '會議時段用 15 分鐘間隔',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="會議時段用 15 分鐘間隔"
        note="會議排程以 15 分鐘為粒度是世界級慣例(Google Calendar / Outlook / Notion Calendar 的時間選單預設都是 15)。用預設 minuteStep=1 會讓使用者困在挑「9:07 還是 9:08」,失去會議排程的本質——這類情境一律設 minuteStep=15。"
      >
        <Field className="w-60">
          <FieldLabel>專案週會時間</FieldLabel>
          <TimePicker value="09:15" onChange={() => {}} minuteStep={15} />
        </Field>
        <ExampleCaption>↑ ✅ minuteStep=15</ExampleCaption>
        <Field className="w-60">
          <FieldLabel>專案週會時間</FieldLabel>
          <TimePicker value="09:07" onChange={() => {}} />
        </Field>
        <ExampleCaption warn>↑ ❌ 預設 minuteStep=1(會議排程無意義)</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// Dim 24 retire(2026-07-16):原 RuleRangeComposition(營業時段雙 TimePicker + →)與「展示」層
// 的「店家營業時間」(ShopBusinessHours)near-identical(同值 10:00/22:00、同結構),且其規則
// (TimePicker 不內建 Range,用兩個並列組合)已由本頁 UsageGuidance「和相近元件怎麼選」說明。
// 重複範例退役;範圍組合的 live demo 見「展示 → 店家營業時間」。

/**
 * 規則:清除用 X 行內動作,不要用文字按鈕
 */
export const RuleClearNoLabelButton: Story = {
  name: '清除用 X 行內動作,不用文字按鈕',
  render: () => {
    const [t, setT] = React.useState<string>('14:30')
    return (
      <TutorialPage>
        <TutorialRule
          title="清除用 X 行內動作,不用文字按鈕"
          note="設定 clearable 後,TimePicker 會自動在欄位尾端渲染一個 X 行內動作來清空值,點擊即清空。不要自己擺一顆「清除」文字按鈕——全站統一用 X 圖示表達「移除已填內容」,與其他欄位的清除慣例一致。"
        >
          <Field className="w-60">
            <FieldLabel>提醒時間</FieldLabel>
            <TimePicker value={t} onChange={setT} clearable />
          </Field>
          <ExampleCaption>↑ ✅ clearable=true(自動渲染 X 行內動作)</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}
