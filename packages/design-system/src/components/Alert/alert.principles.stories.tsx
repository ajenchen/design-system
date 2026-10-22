// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Alert } from './alert'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Alert/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-xl' })

// ── WhenToUse — 何時使用 Alert ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsToastVsDialogRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>頁面裡需要持續存在、直到使用者處理才消失的狀態通知:方案即將到期、帳號未驗證、系統維護、複雜動作前的警告。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Alert/展示" name="單行（低調 vs 實心對照）">單行(低調 vs 實心對照)</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Alert/展示" name="含說明文字（低調 vs 實心對照）">含說明文字(低調 vs 實心對照)</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Alert/展示" name="右上角操作群組">右上角操作群組</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 操作結果短暫回饋：用 Toast"
          note="「儲存成功」「已複製」這類一閃即可的訊息不該嵌入頁面 persistent 存在。Toast 自動消失,非阻斷"
        >
          <Alert
            variant="success"
            title="儲存成功"
            description="您的變更已儲存"
          />
          <ExampleCaption warn>↑ 儲存成功放 Alert → 頁面永遠留這條「儲存成功」,使用者看下一次儲存時還在,困惑。用 Toast 閃一下即可</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 需要阻斷確認的流程：用 Dialog"
          note="「確定要刪除嗎」這類需要使用者明確確認才能繼續的動作必須 modal。Alert 非阻斷,使用者可以忽略繼續操作——危險"
        >
          <Alert
            variant="error"
            title="確定要刪除此專案？"
            description="此動作無法復原"
          />
          <ExampleCaption warn>↑ 刪除確認用 Alert → 使用者按了按鈕後彈 Alert,但仍能操作其他元素,錯亂。用 Dialog 強制聚焦</ExampleCaption>
        </TutorialRule>

        <TutorialRule title="❌ 欄位的驗證錯誤:用欄位下方的錯誤訊息" note="Alert 是頁面層級的通知;單一欄位填錯,錯誤訊息貼在那個欄位下方(FieldError),使用者才知道要改哪裡" />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Alert — 持久性通知、嵌入頁面、不阻斷"
          note="使用者主動 dismiss 或處理才消失。適合:方案即將到期、帳號未驗證、系統維護、複雜動作的前置警告"
        >
          <Alert
            variant="warning"
            title="方案即將到期"
            description="您的 Pro 方案將在 3 天後到期，請及時續訂以維持服務"
          />
          <ExampleCaption>↑ 持久性:進頁面就看到,直到使用者處理(續訂 / dismiss)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="判斷法:看訊息的生命週期"
          note="一閃即過 → Toast;持續到使用者處理 → Alert;必須確認才能繼續 → Dialog。三種訊號各司其職,別混用"
        />
      </UsageSection>
    </TutorialPage>
  ),
}

export const VariantRule: Story = {
  name: '變體 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="info / success / warning / error — 語意與色彩對應"
        note="跟 Toast 共用同一套 variant × theme 策略。語意由 variant 承載(不靠 consumer 用顏色暗示),icon 跟色彩自動配合"
      >
        <Alert variant="info" title="系統維護中" description="部分功能暫停服務,預計 30 分鐘內恢復" />
        <Alert variant="success" title="驗證通過" description="您的電子郵件已成功驗證" />
        <Alert variant="warning" title="額度即將用完" description="您本月 API 額度已使用 90%" />
        <Alert variant="error" title="付款失敗" description="您上次的訂閱付款失敗,請更新付款方式" />
      </TutorialRule>

      <TutorialRule
        title="neutral — 一般資訊（無特定語意）"
        note="沒有明確 info / success / warning / error 定位時用 neutral。例:公告、提示、說明"
      >
        <Alert variant="neutral" title="新功能上線" description="我們推出了 Dark Mode,請前往設定啟用" />
      </TutorialRule>

      <TutorialRule
        title="❌ 用 variant 傳達「強度」而非「語意」"
        note="用 error 讓「重要公告」看起來更緊急 → 使用者以為真的出錯了。Variant 語意綁定具體事件類型,不是強度 knob"
      >
        <Alert variant="error" title="新功能上線" description="我們推出了 Dark Mode" />
        <ExampleCaption warn>↑ 「新功能」用 error 紅色 → 使用者以為是錯誤警告,誤導注意力</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const PlacementRule: Story = {
  name: '行內 vs 固定放置',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Inline（預設）— 嵌在 page 內容中"
        note="有圓角 + 邊框,像一張 card 嵌在內容區塊裡。Settings 頁的方案提示、表單內的注意事項"
      >
        <Alert
          variant="warning"
          title="即將到期"
          description="您的方案將在 3 天後到期"
        />
        <ExampleCaption>↑ inline 模式 — 有圓角邊框,嵌入內容</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="Fixed — 頂部全域警告（頁面寬度,無邊框圓角）"
        note="系統維護、服務降級、全站重要公告。Fixed 讓使用者無論在哪頁都看到同一條訊息"
      >
        <Alert
          variant="info"
          placement="fixed"
          title="系統維護中"
          description="2026-04-20 02:00-04:00 進行系統升級,部分功能暫停"
        />
        <ExampleCaption>↑ fixed 模式 — 無圓角邊框,頂部 full-width</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 混用：頁面中間放 fixed placement"
        note="Fixed 是頂部全域警告的視覺語言。放在頁面中間會破壞「這是全域訊息」的預期"
      >
        <ExampleCaption warn>Fixed 永遠在最頂部,不在內容區塊中間</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const AppearanceRule: Story = {
  name: '低調 vs 實心 選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Subtle（預設）— 淺底 + 邊框，視覺重量適中"
        note="99% 的 Alert 用 subtle。使用者注意到訊息但不被嚇到,可以繼續主要任務"
      >
        <Alert
          variant="warning"
          title="即將到期"
          description="您的方案將在 3 天後到期"
        />
      </TutorialRule>

      <TutorialRule
        title="Solid — 飽和底色，視覺重量高"
        note="用於真的很重要的全站警告(服務中斷、付款失敗必須立即處理)。一個頁面最多一個 solid Alert"
      >
        <Alert
          variant="error"
          appearance="solid"
          title="付款失敗"
          description="您上次的訂閱付款失敗,請立即更新付款方式以免服務中斷"
        />
      </TutorialRule>

      <TutorialRule
        title="❌ 所有 Alert 都用 solid"
        note="視覺重量過高,使用者無法分辨哪個真重要。Solid 保留給最緊急的訊息"
      >
        <Alert variant="success" appearance="solid" title="已儲存" />
        <Alert variant="info" appearance="solid" title="提示" />
        <Alert variant="warning" appearance="solid" title="注意" />
        <ExampleCaption warn>↑ 全 solid → 訊號稀釋,使用者麻木</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
