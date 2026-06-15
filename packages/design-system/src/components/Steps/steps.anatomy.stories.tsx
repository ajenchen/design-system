// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Steps, StepItem, StepLabel, StepDescription } from './steps'
import { H3, Desc, Td, Th, TokenCell, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Steps/設計規格',
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
        <Desc>Steps 是有序步驟序列——Indicator(圓形)+ Label + 可選 Description + Connector(連接線)。每個 StepItem 有四種狀態:completed / current / upcoming / error(reachable 為 linear 模式內部推導的解鎖態,不在介紹層暴露)。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Steps value="shipping" completedValues={['cart', 'payment']}>
            <StepItem value="cart"><StepLabel>購物車</StepLabel></StepItem>
            <StepItem value="payment"><StepLabel>付款資訊</StepLabel></StepItem>
            <StepItem value="shipping"><StepLabel>配送方式</StepLabel><StepDescription>當前步驟</StepDescription></StepItem>
            <StepItem value="review"><StepLabel>確認訂單</StepLabel></StepItem>
            <StepItem value="done"><StepLabel>完成</StepLabel></StepItem>
          </Steps>
        </div>
      </div>

      <div>
        <H3>四種狀態</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>狀態</Th><Th>Indicator</Th><Th>Label</Th><Th>Connector(右側)</Th></tr></thead>
            <tbody>
              <tr><Td>completed</Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--info" size="sm" /><span>filled info + white check icon</span></span></Td><Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td><Td><TokenCell token="--info" display="bg-info" /></Td></tr>
              <tr><Td>current(= value)</Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--info" size="sm" /><span>filled info + white number + ring</span></span></Td><Td><TokenCell token="--foreground" display="foreground" /></Td><Td><TokenCell token="--border" display="bg-border" /></Td></tr>
              <tr><Td>upcoming</Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--muted" size="sm" /><span>filled muted + fg-disabled number</span></span></Td><Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td><Td><TokenCell token="--border" display="bg-border" /></Td></tr>
              <tr><Td>error</Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--error" size="sm" /><span>bg-error + white icon</span></span></Td><Td><TokenCell token="--error-text" display="error-text" /></Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['Steps', '', '', ''],
                ['  value', 'string', '—', '當前步驟 value'],
                ['  completedValues', 'string[]', '[]', '已完成的步驟 values'],
                ['  errorValues', 'string[]', '[]', '錯誤的步驟 values'],
                ['  size', "'sm' | 'md' | 'lg'", "'md'", 'indicator / 字體 tier'],
                ['  orientation', "'horizontal' | 'vertical'", "'vertical'", '步驟排列方向'],
                ['  linear', 'boolean', 'true', 'true=僅能順序前進 / false=任意可達步驟可點'],
                ['  onValueChange', '(value: string) => void', '—', '點擊可達步驟時觸發,回傳該步驟 value'],
                ['StepItem', '', '', ''],
                ['  value', 'string', '必填', '唯一識別碼'],
                ['  state', "'error'", '—', '覆寫狀態(僅支援 error;一般狀態由 Steps 的 value / completedValues 推導)'],
                ['  disabled', 'boolean', 'false', '停用該步驟(不可點)'],
                ['  <StepLabel>', 'children', '必填', '步驟名稱(以子元件傳入,非 prop)'],
                ['  <StepDescription>', 'children', '—', '描述(以子元件傳入,vertical 模式常用)'],
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

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切 Steps props 即時 render,取代 Figma inspect。切 `value` 切換 current step、改 `orientation` / `size` 對照排列與尺寸,切 `linear` 看 upcoming step 是否可點。' } },
  },
  args: {
    value: 'shipping',
    completedValues: ['cart', 'payment'],
    errorValues: [],
    size: 'md',
    orientation: 'vertical',
    linear: true,
    expansion: 'follow-active',
  },
  argTypes: {
    value: {
      control: 'radio',
      options: ['cart', 'payment', 'shipping', 'review', 'done'],
      description: '當前步驟 value',
    },
    completedValues: {
      control: 'object',
      description: '已完成的步驟 values(例:["cart", "payment"])',
    },
    errorValues: {
      control: 'object',
      description: '錯誤的步驟 values(例:["payment"])',
    },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    orientation: { control: 'radio', options: ['vertical', 'horizontal'] },
    linear: {
      control: 'boolean',
      description: 'true=僅能順序前進 / false=任意跳步',
    },
    expansion: { control: 'radio', options: ['follow-active', 'multiple'] },
  },
  render: (args) => (
    <div className="border border-border rounded-lg p-4 max-w-2xl">
      <Steps {...args}>
        <StepItem value="cart"><StepLabel>購物車</StepLabel><StepDescription>3 件商品,合計 NT$ 2,490</StepDescription></StepItem>
        <StepItem value="payment"><StepLabel>付款資訊</StepLabel><StepDescription>信用卡 / ATM / LINE Pay</StepDescription></StepItem>
        <StepItem value="shipping"><StepLabel>配送方式</StepLabel><StepDescription>宅配 2-3 個工作天</StepDescription></StepItem>
        <StepItem value="review"><StepLabel>確認訂單</StepLabel><StepDescription>檢視並送出</StepDescription></StepItem>
        <StepItem value="done"><StepLabel>完成</StepLabel></StepItem>
      </Steps>
    </div>
  ),
}

export const OrientationMatrix: Story = {
  name: '方向',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Horizontal</H3>
        <Desc>步驟水平排列,常見於結帳流程 / wizard 頂部。Indicator 之間有橫向 connector。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Steps orientation="horizontal" value="payment" completedValues={['cart']}>
            <StepItem value="cart"><StepLabel>購物車</StepLabel></StepItem>
            <StepItem value="payment"><StepLabel>付款</StepLabel></StepItem>
            <StepItem value="shipping"><StepLabel>配送</StepLabel></StepItem>
            <StepItem value="done"><StepLabel>完成</StepLabel></StepItem>
          </Steps>
        </div>
      </div>

      <div>
        <H3>Vertical(預設)</H3>
        <Desc>步驟垂直排列,支援 description(多行描述)。常見於 onboarding / 安裝引導 / 複雜流程。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Steps orientation="vertical" value="config" completedValues={['install']}>
            <StepItem value="install"><StepLabel>安裝套件</StepLabel><StepDescription>npm install @acme/cli</StepDescription></StepItem>
            <StepItem value="config"><StepLabel>設定環境</StepLabel><StepDescription>修改 .env.local 加入 API key</StepDescription></StepItem>
            <StepItem value="deploy"><StepLabel>部署上線</StepLabel><StepDescription>執行 acme deploy</StepDescription></StepItem>
          </Steps>
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種狀態 × 三個視覺區域的色彩 Token</H3>
        <Desc>
          Steps 的色彩由三個視覺區域組成:Indicator(圓形)、Label(文字)、Connector(連接線)。
          每個區域的色彩隨狀態變化,傳達「已完成 / 進行中 / 尚未到達 / 出錯」的進度階段。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Indicator bg</Th>
                <Th>Indicator border</Th>
                <Th>Indicator icon/text</Th>
                <Th>Label</Th>
                <Th>右側 Connector</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>completed</Td>
                <Td><TokenCell token="--info" /></Td>
                <Td>—(同 bg)</Td>
                <Td><TokenCell token="white" display="白色 Check icon" /></Td>
                <Td><TokenCell token="--fg-secondary" /></Td>
                <Td><TokenCell token="--info" display="bg-info" /></Td>
              </tr>
              <tr>
                <Td mono>current(= value)</Td>
                <Td><TokenCell token="--info" /></Td>
                <Td>—(同 bg)</Td>
                <Td><TokenCell token="--on-emphasis" display="白色數字" /></Td>
                <Td><TokenCell token="--foreground" /></Td>
                <Td><TokenCell token="--border" display="bg-border" /></Td>
              </tr>
              <tr>
                <Td mono>upcoming</Td>
                <Td><TokenCell token="--muted" display="filled muted" /></Td>
                <Td>—(同 bg)</Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled 數字" /></Td>
                <Td><TokenCell token="--fg-secondary" /></Td>
                <Td><TokenCell token="--border" display="bg-border" /></Td>
              </tr>
              <tr>
                <Td mono>error</Td>
                <Td><TokenCell token="--error" /></Td>
                <Td>—(同 bg)</Td>
                <Td><TokenCell token="white" display="白色 X icon" /></Td>
                <Td><TokenCell token="--error-text" /></Td>
                <Td>—</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          設計 rationale:completed connector 填 info、其餘 connector 填 border——
          讓「已走過的路」視覺上連續實在,「未走過的路」保持輕量。current step 的 connector 屬於「未走過」,
          所以也用 border。
        </p>
      </div>

      <div>
        <H3>完整四態實際渲染</H3>
        <Desc>包含 error state 的結帳流程(例如付款失敗)。error 取代原本的 completed 指示。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Steps value="shipping" completedValues={['cart']} errorValues={['payment']}>
            <StepItem value="cart"><StepLabel>購物車</StepLabel></StepItem>
            <StepItem value="payment"><StepLabel>付款失敗</StepLabel><StepDescription>信用卡驗證未通過</StepDescription></StepItem>
            <StepItem value="shipping"><StepLabel>配送方式</StepLabel><StepDescription>當前步驟</StepDescription></StepItem>
            <StepItem value="review"><StepLabel>確認訂單</StepLabel></StepItem>
          </Steps>
        </div>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>三種 Size</H3>
        <Desc>Indicator 直徑:sm 8px dot(hit area 24px)、md 24px、lg 32px(md/lg 對齊 Avatar tier)。字體跟 MenuItem / TreeItem 同 tier。</Desc>
        <div className="flex flex-col gap-4">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="border border-dashed border-divider rounded-md p-4">
              <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}"</div>
              <Steps size={size} value="b" completedValues={['a']}>
                <StepItem value="a"><StepLabel>第一步</StepLabel></StepItem>
                <StepItem value="b"><StepLabel>第二步</StepLabel></StepItem>
                <StepItem value="c"><StepLabel>第三步</StepLabel></StepItem>
              </Steps>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 狀態行為 — Progress flow / Linear / Error interrupt
   ═══════════════════════════════════════════════════════════════════════════ */

const CHECKOUT_STEPS = [
  { value: 'cart', label: '購物車' },
  { value: 'shipping', label: '配送資訊' },
  { value: 'payment', label: '付款' },
  { value: 'review', label: '確認訂單' },
  { value: 'done', label: '完成' },
] as const

const ProgressFlow = () => {
  const [idx, setIdx] = useState(1)
  const current = CHECKOUT_STEPS[idx]!.value
  const completed = CHECKOUT_STEPS.slice(0, idx).map((s) => s.value)
  return (
    <div className="flex flex-col gap-3 min-w-[340px]">
      <div className="border border-border rounded-lg p-4">
        <Steps value={current} completedValues={completed} orientation="horizontal">
          {CHECKOUT_STEPS.map((s) => (
            <StepItem key={s.value} value={s.value}>
              <StepLabel>{s.label}</StepLabel>
            </StepItem>
          ))}
        </Steps>
      </div>
      <div className="flex gap-2">
        <Button variant="tertiary" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
          上一步
        </Button>
        <Button variant="primary" size="sm" disabled={idx >= CHECKOUT_STEPS.length - 1} onClick={() => setIdx((i) => Math.min(CHECKOUT_STEPS.length - 1, i + 1))}>
          下一步
        </Button>
      </div>
      <div className="text-[11px] text-fg-muted">observed:current = <span className="font-mono">{current}</span> · completed = <span className="font-mono">[{completed.join(', ')}]</span></div>
    </div>
  )
}

const LinearVsNonlinear = () => {
  return (
    <div className="flex gap-6">
      <div className="flex flex-col gap-2 min-w-[240px]">
        <span className="text-[11px] text-fg-muted font-mono">linear(預設)</span>
        <div className="border border-border rounded-lg p-4">
          <Steps value="shipping" completedValues={['cart']} orientation="vertical">
            {CHECKOUT_STEPS.slice(0, 4).map((s) => (
              <StepItem key={s.value} value={s.value}>
                <StepLabel>{s.label}</StepLabel>
              </StepItem>
            ))}
          </Steps>
        </div>
        <div className="text-[11px] text-fg-muted">僅 completed 可點回查,upcoming 不可達(cursor:not-allowed)。</div>
      </div>
      <div className="flex flex-col gap-2 min-w-[240px]">
        <span className="text-[11px] text-fg-muted font-mono">linear={'{false}'}(自由跳轉)</span>
        <div className="border border-border rounded-lg p-4">
          <Steps value="shipping" completedValues={['cart']} linear={false} orientation="vertical">
            {CHECKOUT_STEPS.slice(0, 4).map((s) => (
              <StepItem key={s.value} value={s.value}>
                <StepLabel>{s.label}</StepLabel>
              </StepItem>
            ))}
          </Steps>
        </div>
        <div className="text-[11px] text-fg-muted">任一 reachable step 可點,適用「表單編輯器」「側邊導覽型 wizard」。</div>
      </div>
    </div>
  )
}

const ErrorInterrupt = () => {
  return (
    <div className="flex flex-col gap-2 min-w-[300px]">
      <div className="border border-border rounded-lg p-4">
        <Steps value="payment" completedValues={['cart', 'shipping']} errorValues={['payment']} orientation="horizontal">
          {CHECKOUT_STEPS.slice(0, 4).map((s) => (
            <StepItem key={s.value} value={s.value}>
              <StepLabel>{s.label}</StepLabel>
            </StepItem>
          ))}
        </Steps>
      </div>
      <div className="text-[11px] text-fg-muted">payment step 發生錯誤:indicator 切 `bg-error` + X icon,label 轉 `--error-text`。focus ring 也從 info-hover 切到 error-hover。</div>
    </div>
  )
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <H3>狀態行為</H3>
        <Desc>
          Steps 的「狀態」分兩類:(a)<strong>內容狀態</strong>(completed / current / upcoming / error)已在 `ColorMatrix` 呈現,
          (b)本 story 展示<strong>進度流轉行為</strong>——完成進程、linear vs nonlinear 導覽、error interrupt。
          這些是 Steps 元件層級特有的行為,不存在於任何 item primitive。
        </Desc>
      </div>

      {/* Progress advancement */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 1:進度流轉(current → completed 連鎖變化)</span>
        <Desc>
          當 consumer 把 cart 推入 completedValues 並把 shipping 設為 current,observe 三件事同時發生:
          cart indicator 切 filled check、connector(cart→shipping)切 info、shipping(md current)切 filled bg-info + 白數字並疊 focus 外環。
          對照 Linear 的 onboarding / Stripe Checkout。
        </Desc>
        <ProgressFlow />
      </div>

      {/* Linear vs nonlinear */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 2:linear 控制 upcoming step 可否點擊</span>
        <Desc>
          `linear=true`(預設)= 只能依序前進,回查僅限 completed(對應 checkout 這種「不可跳過」流程)。
          `linear=false` + `reachableValues` = 自由跳轉,任何 reachable step 可點(對應「多 tab 表單編輯器」)。
        </Desc>
        <LinearVsNonlinear />
      </div>

      {/* Error interrupt */}
      <div className="flex flex-col gap-3">
        <span className="text-caption font-medium text-fg-secondary">行為 3:Error interrupt(中斷流程)</span>
        <Desc>
          任何 step 加入 `errorValues` 時,該 step 轉 error state(紅底 + X icon),label 色轉 `--error-text`。
          consumer 若要繼續流程,必須先解除 errorValues 再推進 current——避免靜默跳過錯誤。
        </Desc>
        <ErrorInterrupt />
      </div>

      {/* Rule notes */}
      <div className="flex flex-col gap-2 pt-4 border-t border-divider">
        <span className="text-caption font-medium text-fg-secondary">行為規則</span>
        <ul className="text-caption text-fg-secondary space-y-1.5 ml-4 list-disc">
          <li>`current` 只能有一個——value 是單值,不像 completedValues 是集合。</li>
          <li>`error` 優先於 `completed`——同一 step 若同時在 completedValues + errorValues,一律渲染 error(紅底 X)。</li>
          <li>Focus ring 顏色自動切換:current 走 `--info-hover`(linear=false 時走 `--border-hover`)、error 走 `--error-hover`。</li>
          <li>upcoming step 不可點(linear)或 reachable 判定為 false 時 cursor:not-allowed,鍵盤 Tab 跳過。</li>
          <li>sm size(8px dot)無 indicator icon——太小畫不出 check / X;大 tier(md/lg)才有 icon 反饋。</li>
        </ul>
      </div>
    </div>
  ),
}

export const IndentAlignment: Story = {
  name: '欄位節奏',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Indicator 永遠 inline 對齊 label 第一行</H3>
        <Desc>**刻意打破 item-layout 的 24px 閾值規則**——不管 indicator 尺寸、不管有無 description,一律 inline 對齊。Column rhythm 優先於「大 prefix 視覺重量平衡文字塊」。這是 Steps 跟其他 row primitive 的本質差異——Steps 是「一條有連接關係的進度路徑」,column rhythm 是元件本身。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Steps orientation="vertical" value="b" completedValues={['a']}>
            <StepItem value="a"><StepLabel>簡短 label</StepLabel></StepItem>
            <StepItem value="b">
              <StepLabel>帶有描述的 label</StepLabel>
              <StepDescription>即使有多行 description,indicator 仍然對齊 label 第一行,保持 column rhythm</StepDescription>
            </StepItem>
            <StepItem value="c"><StepLabel>另一個 label</StepLabel></StepItem>
          </Steps>
        </div>
        <p className="text-footnote text-fg-muted mt-3">業界共識:Apple HIG、Material 3、Linear、GitHub Actions 的 steps 都是 indicator 對齊 label 第一行</p>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `steps.spec.md` 「A11y 預設」段。摘要:\n\n  ARIA / Pattern  :W3C APG 無正式 stepper pattern(M26 source-verified);採 Carbon ProgressIndicator 模型(root ol + clickable step role=button + aria-current=step + indicator aria-hidden + sr-only「第 N 步/共 M 步/狀態」)。\n\n  Keyboard 行為  :\n\n- Tab — focus step(若 clickable;sequential Tab,非 tablist roving)\n- Enter / Space — navigate to step\n\n  Focus  :focus-visible ring 對齊 DS 設計準則( outline: 2px solid var(--ring) );focus management 由元件 own。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。"}</p>
    </div>
  ),
}
