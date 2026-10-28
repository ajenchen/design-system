// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Steps, StepItem, StepLabel, StepDescription } from './steps'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta<typeof Steps> = {
  title: 'Design System/Components/Steps/設計原則',
  component: Steps,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Steps>

// ── 規則外框 = 共用教學頁元件(標題 → 說明 → 範例 = tight;規則之間 loose × 2)──
// 範例並排 = 範例區的 wrap 版面(CaptionedExamples,範例之間 loose);範例 ↔ 它的說明 = tight(ExampleGroup + ExampleCaption)。
// 2026-10-20 T6:原本本頁自抄 ExamplePair(並排外框)與 fg-secondary 的說明段落,改用共用元件。
const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

/** 一則範例:固定欄寬 280px(讓並排的兩則對齊比較),下方是它的說明。 */
function Example({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <ExampleGroup className="w-[280px]">
      <div>{children}</div>
      <ExampleCaption>{label}</ExampleCaption>
    </ExampleGroup>
  )
}

// ── UsageGuidance — 何時用 / 何時不用 / 和相近元件怎麼選 ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>有先後順序、要標出「目前在第幾步」的流程進度:註冊申請精靈、結帳流程、工作區設定導覽。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Steps/展示" name="預設">註冊申請精靈(預設)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Steps/展示" name="非線性">工作區設定導覽(非線性)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Steps/展示" name="水平">結帳流程進度(水平)</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li><strong>選擇器(選一個值)</strong> → Select / RadioGroup / SegmentedControl。Steps 只顯示進度</li>
          <li><strong>時間軸或歷史紀錄</strong> → 時間軸(未來)。時序事件和進度語義不同</li>
          <li><strong>超過 7 步的流程</strong> → ProgressBar + 計數。Steps 會視覺過長</li>
          <li><strong>巢狀步驟(步驟底下還有子步驟)</strong> → TreeView。Steps 沒有巢狀結構</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Tabs / SegmentedControl</strong> —— 平行視圖切換、使用者可自由跳著看;Steps 暗示線性順序。Asana 的檢視模式用 SegmentedControl</li>
          <li><strong>Accordion</strong> —— 說明 / 教學類的編號步驟:讀者自己開合、沒有「目前那一步」,編號寫進每段標題</li>
          <li><strong>Pagination</strong> —— 大量資料的頁碼是位置導覽,可以任意跳;流程有順序依賴,上一步 / 下一步用 Steps + Button</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

// ── 規則 1:parent 管理狀態,不是每個 StepItem 各自傳 ──

export const ParentControlled: Story = {
  name: '規則:狀態由父層管理',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="狀態由 parent 單一來源管理"
        note="用 Steps root 的 value / completedValues / errorValues 自動推導每個 step 的 state——絕不在多個 StepItem 各自宣告 state,否則容易漂移、容易出現「多個 current」這種自我矛盾的組合。"
      >
        <Example label="✅ 對:狀態集中在 Steps root">
          <Steps
            aria-label="申請流程進度"
            value="payment"
            completedValues={['info', 'review']}
            errorValues={['payment']}
          >
            <StepItem value="info">
              <StepLabel>基本資料</StepLabel>
            </StepItem>
            <StepItem value="review">
              <StepLabel>確認資料</StepLabel>
            </StepItem>
            <StepItem value="payment">
              <StepLabel>付款</StepLabel>
              <StepDescription>信用卡授權失敗,請確認卡號與有效期限後重新付款</StepDescription>
            </StepItem>
            <StepItem value="done">
              <StepLabel>完成</StepLabel>
            </StepItem>
          </Steps>
        </Example>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 規則 2:Ring 是 focus marker,不是 selection ──

export const RingIsFocusMarker: Story = {
  name: '規則:環是聚焦標記,不是選取',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Ring 表達「你現在在這步」,跟 step 本身的狀態正交"
        note="Ring 不是 selection marker——Steps 不是 SelectMenu / DropdownMenu。不要把 bg-neutral-selected、radio 圓圈等 selection 語義用到 Steps 上,ring 是唯一的 focus 表達。"
      >
        <Example label="Value 指向 completed step → 藍底 ✓ + 藍 ring(可同時成立)">
          <Steps aria-label="結帳進度" value="a" completedValues={['a']} linear={false}>
            <StepItem value="a">
              <StepLabel>送貨地址</StepLabel>
            </StepItem>
            <StepItem value="b">
              <StepLabel>確認送出</StepLabel>
            </StepItem>
          </Steps>
        </Example>
        <Example label="Value 指向 error step → 紅底 ✕ + 紅 ring">
          <Steps aria-label="結帳進度" value="a" errorValues={['a']} linear={false}>
            <StepItem value="a">
              <StepLabel>付款</StepLabel>
            </StepItem>
            <StepItem value="b">
              <StepLabel>確認送出</StepLabel>
            </StepItem>
          </Steps>
        </Example>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 規則 3:Blue connector 只跟 completedValues 走 ──

export const BlueConnectorLogic: Story = {
  name: '規則:藍色連線只跟已完成走',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="藍色代表實際走過的路徑,不是 focus 指向"
        note="即使使用者在非線性模式跳到未完成的 step,前面的 connector 也不會無中生有變藍——藍色跟 step 本身的 completed bg 一對一對應,避免「藍線連灰 step」的矛盾。"
      >
        <Example label="✅ 對:value 在「確認送出」,但只有「基本資料」是 completed → 只有它底下的 connector 藍">
          <Steps
            aria-label="註冊流程進度"
            value="step-4"
            completedValues={['step-1']}
            linear={false}
          >
            <StepItem value="step-1">
              <StepLabel>基本資料</StepLabel>
              <StepDescription>已完成</StepDescription>
            </StepItem>
            <StepItem value="step-2">
              <StepLabel>帳號設定</StepLabel>
              <StepDescription>待填寫</StepDescription>
            </StepItem>
            <StepItem value="step-3">
              <StepLabel>付款方式</StepLabel>
              <StepDescription>待填寫</StepDescription>
            </StepItem>
            <StepItem value="step-4">
              <StepLabel>確認送出</StepLabel>
              <StepDescription>當前聚焦</StepDescription>
            </StepItem>
          </Steps>
        </Example>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 規則 4:Column rhythm ──

export const ColumnRhythm: Story = {
  name: '規則:指示欄節奏一致',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Indicator 永遠對齊 label 第一行——即使同一 Steps 內混用「有/無 description」"
        note="這是 Steps 刻意打破 item-layout 的 24px 閾值規則(block-align 對齊文字塊中心)的特例。如果照 item-layout 規則,lg size 的 indicator 會在有 description 的 item 下降到文字塊中間,column 垂直節奏崩潰。Material / Ant / GitHub / Linear 全部一致走 inline 對齊,這是 stepper 的視覺骨架本身。"
      >
        <Example label="✅ 對:lg size,混用有/無 description,indicator 全部對齊第一行中線,column 垂直節奏一致">
          <Steps
            aria-label="訂購流程進度"
            defaultValue="step-3"
            completedValues={['step-1', 'step-2']}
            size="lg"
          >
            <StepItem value="step-1">
              <StepLabel>選擇商品</StepLabel>
            </StepItem>
            <StepItem value="step-2">
              <StepLabel>填寫地址</StepLabel>
              <StepDescription>收件人、地址、郵遞區號</StepDescription>
            </StepItem>
            <StepItem value="step-3">
              <StepLabel>付款方式</StepLabel>
              <StepDescription>
                信用卡 / Apple Pay / 銀行轉帳(處理時間 1–2 個工作天)
              </StepDescription>
            </StepItem>
            <StepItem value="step-4">
              <StepLabel>完成訂單</StepLabel>
            </StepItem>
          </Steps>
        </Example>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 規則 5:Linear 點 completed 不自動 unmark ──

export const LinearBackClickDoesNotMutate: Story = {
  name: '規則:Linear 點回完成項不改狀態',
  render: () => {
    const [value, setValue] = React.useState('review')
    const [completed] = React.useState(['info', 'account'])
    return (
      <TutorialPage>
        <TutorialRule
          title="點 completed step 只改 focus(value),不會自動取消完成狀態"
          note="Steps 的進度狀態由 parent own(value 為 controlled / uncontrolled defaultValue 雙模),從不偷偷 mutate parent 的 completedValues。若應用層需要「使用者改錯了就 block 後續」,應由應用層自己從 completedValues 移除,Steps 內部絕不 auto-remove。"
        >
          <ExampleGroup className="w-[360px]">
            <ExampleCaption>
              點 Step 1 或 Step 2(completed)看看——value 會跳回去,但 ✓ 完成標記
              維持不變。
            </ExampleCaption>
            <Steps
              aria-label="註冊流程進度"
              value={value}
              onValueChange={setValue}
              completedValues={completed}
            >
              <StepItem value="info">
                <StepLabel>基本資料</StepLabel>
              </StepItem>
              <StepItem value="account">
                <StepLabel>帳號設定</StepLabel>
              </StepItem>
              <StepItem value="review">
                <StepLabel>確認資料</StepLabel>
              </StepItem>
              <StepItem value="done">
                <StepLabel>完成</StepLabel>
              </StepItem>
            </Steps>
            <ExampleCaption>
              Current value: <code>{value}</code>
            </ExampleCaption>
          </ExampleGroup>
        </TutorialRule>
      </TutorialPage>
    )
  },
}


