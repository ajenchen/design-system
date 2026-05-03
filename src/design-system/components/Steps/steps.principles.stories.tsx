// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Steps, StepItem, StepLabel, StepDescription } from './steps'

const meta: Meta<typeof Steps> = {
  title: 'Design System/Components/Steps/設計原則',
  component: Steps,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Steps>

// ── 標題 / 副標 / 範例註解的三層排版 ──

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-h3 text-foreground">{title}</h3>
        {subtitle && (
          <p className="text-caption text-fg-secondary max-w-[720px]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function ExamplePair({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex flex-wrap gap-8 items-start">{children}</div>
}

function Example({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 w-[280px]">
      <div>{children}</div>
      <p className="text-footnote text-fg-secondary leading-compact">{label}</p>
    </div>
  )
}

// ── 規則 1:parent 管理狀態,不是每個 StepItem 各自傳 ──

// ── WhenToUse — 何時使用 Steps ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Steps 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Steps/展示" name="Ring 正交示範"><span className="text-primary hover:underline font-medium cursor-pointer">Ring 正交示範</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Steps/展示" name="非線性"><span className="text-primary hover:underline font-medium cursor-pointer">非線性</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Steps/展示" name="水平"><span className="text-primary hover:underline font-medium cursor-pointer">水平</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Steps/展示" name="Multiple 展開模式"><span className="text-primary hover:underline font-medium cursor-pointer">Multiple 展開模式</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Steps/展示" name="Column rhythm 驗證"><span className="text-primary hover:underline font-medium cursor-pointer">Column rhythm 驗證</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div className="prose prose-sm max-w-prose space-y-4">
      <p>Steps 表達線性進度,以下情境改用其他元件:</p>
      <ul className="list-disc list-inside space-y-1 text-fg-secondary">
        <li><strong>平行視圖切換</strong> → Tabs / SegmentedControl。Asana 的檢視模式用 SegmentedControl</li>
        <li><strong>選擇器（選一個值）</strong> → Select / RadioGroup / SegmentedControl。Steps 只顯示進度</li>
        <li><strong>時間軸或歷史紀錄</strong> → Timeline（未來）。時序事件和進度語義不同</li>
        <li><strong>超過 7 步的流程</strong> → ProgressBar + 計數。Steps 會視覺過長</li>
        <li><strong>使用者可自由跳步</strong> → Tabs。Steps 暗示線性順序,可跳步改用 Tabs</li>
      </ul>
    </div>
    </div>
  ),
}

export const ParentControlled: Story = {
  name: '規則:Parent 管理狀態',
  render: () => (
    <Section
      title="狀態由 parent 單一來源管理"
      subtitle="用 Steps root 的 value / completedValues / errorValues 自動推導每個 step 的 state——絕不在多個 StepItem 各自宣告 state,否則容易漂移、容易出現「多個 current」這種自我矛盾的組合。"
    >
      <ExamplePair>
        <Example label="✅ 對:狀態集中在 Steps root">
          <Steps
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
              <StepDescription>此頁為 current + error</StepDescription>
            </StepItem>
            <StepItem value="done">
              <StepLabel>完成</StepLabel>
            </StepItem>
          </Steps>
        </Example>
      </ExamplePair>
    </Section>
  ),
}

// ── 規則 2:Ring 是 focus marker,不是 selection ──

export const RingIsFocusMarker: Story = {
  name: '規則:Ring 是 focus marker,不是 selection',
  render: () => (
    <Section
      title="Ring 表達「你現在在這步」,跟 step 本身的狀態正交"
      subtitle="Ring 不是 selection marker——Steps 不是 SelectMenu / DropdownMenu。不要把 bg-neutral-selected、radio 圓圈等 selection 語義用到 Steps 上,ring 是唯一的 focus 表達。"
    >
      <ExamplePair>
        <Example label="Value 指向 completed step → 藍底 ✓ + 藍 ring(可同時成立)">
          <Steps value="a" completedValues={['a']} linear={false}>
            <StepItem value="a">
              <StepLabel>送貨地址</StepLabel>
            </StepItem>
            <StepItem value="b">
              <StepLabel>確認送出</StepLabel>
            </StepItem>
          </Steps>
        </Example>
        <Example label="Value 指向 error step → 紅底 ✕ + 紅 ring">
          <Steps value="a" errorValues={['a']} linear={false}>
            <StepItem value="a">
              <StepLabel>付款</StepLabel>
            </StepItem>
            <StepItem value="b">
              <StepLabel>確認送出</StepLabel>
            </StepItem>
          </Steps>
        </Example>
      </ExamplePair>
    </Section>
  ),
}

// ── 規則 3:Blue connector 只跟 completedValues 走 ──

export const BlueConnectorLogic: Story = {
  name: '規則:藍色 connector 只跟 completed 走',
  render: () => (
    <Section
      title="藍色代表實際走過的路徑,不是 focus 指向"
      subtitle="即使使用者在非線性模式跳到未完成的 step,前面的 connector 也不會無中生有變藍——藍色跟 step 本身的 completed bg 一對一對應,避免「藍線連灰 step」的矛盾。"
    >
      <ExamplePair>
        <Example label="✅ 對:value 在「確認送出」,但只有「基本資料」是 completed → 只有它底下的 connector 藍">
          <Steps
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
      </ExamplePair>
    </Section>
  ),
}

// ── 規則 4:Column rhythm ──

export const ColumnRhythm: Story = {
  name: '規則:Indicator column rhythm',
  render: () => (
    <Section
      title="Indicator 永遠對齊 label 第一行——即使同一 Steps 內混用「有/無 description」"
      subtitle="這是 Steps 刻意打破 item-layout 的 24px 閾值規則(block-align 對齊文字塊中心)的特例。如果照 item-layout 規則,lg size 的 indicator 會在有 description 的 item 下降到文字塊中間,column 垂直節奏崩潰。Material / Ant / GitHub / Linear 全部一致走 inline 對齊,這是 stepper 的視覺骨架本身。"
    >
      <ExamplePair>
        <Example label="✅ 對:lg size,混用有/無 description,indicator 全部對齊第一行中線,column 垂直節奏一致">
          <Steps
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
      </ExamplePair>
    </Section>
  ),
}

// ── 規則 5:Linear 點 completed 不自動 unmark ──

export const LinearBackClickDoesNotMutate: Story = {
  name: '規則:Linear 點回 completed 不改狀態',
  render: () => {
    const [value, setValue] = React.useState('review')
    const [completed] = React.useState(['info', 'account'])
    return (
      <Section
        title="點 completed step 只改 focus(value),不會自動取消完成狀態"
        subtitle="Steps 是純 controlled 元件,從不偷偷 mutate parent state。若應用層需要「使用者改錯了就 block 後續」,應由應用層自己從 completedValues 移除,Steps 內部絕不 auto-remove。"
      >
        <div className="flex flex-col gap-3 w-[360px]">
          <p className="text-caption text-fg-secondary">
            點 Step 1 或 Step 2(completed)看看——value 會跳回去,但 ✓ 完成標記
            維持不變。
          </p>
          <Steps
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
          <p className="text-footnote text-fg-muted">
            Current value: <code>{value}</code>
          </p>
        </div>
      </Section>
    )
  },
}


