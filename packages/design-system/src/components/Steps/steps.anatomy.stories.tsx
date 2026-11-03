// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useEffect, useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Steps, StepItem, StepLabel, StepDescription, StepContent } from './steps'
import { H3, Desc, Td, Th, TokenCell, Swatch } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { StoryLink } from '@/design-system/stories-helpers/examples/tutorial-page'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Textarea } from '@/design-system/components/Textarea/textarea'

// DKIM 公開金鑰的 TXT 記錄值(Google Workspace / Postmark 這類「自訂網域寄件」設定精靈會原樣給使用者複製;2048-bit RSA 的 p= 約 400 字元)。
// p= 是真的 2048-bit RSA 公鑰(openssl 產生、私鑰當場丟棄),2026-10-21 前是手打的字母序列(…fGhJ5kMnO7PqRsTuVwXyZ0a1B2c3D4…),一眼看得出是假的(r1b OTH-12)
const DKIM_TXT_RECORD =
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzLo2z5wSGqHlkrDJeSZsz5HIx2FAGc3840Pg16k1Mkv2fgeX5kY9m9FuR1QKvhnuFUgJTbqL4f3VLPStnLgZSIWdtiPViSq4/f4Rb0PS+ZDClgoGLsiKhUHomcz6ucUA0LZ2QG0Q0q1ny09247NutuBaJFf+sqxH4YGNtvo0XQfJF9FqZ3ZPNXWQ9ZZyZWZHo7y+d8dVoCpza0mnRjhEg5A0t4USn5gEvyj4X8DQOotPHNrxY8EabDme+t4K9rymLLm74v8U5YAm06QKRVRmhLkGLKJtHnbg4DKM0Z7bmWR/rhERHVrYJS2ZvgjtUVrvT0abJGZlA+SWTBczDGS5uQIDAQAB'

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
          <Steps aria-label="結帳進度" readOnly value="shipping" completedValues={['cart', 'payment']}>
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
              <tr><Td>error</Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--error" size="sm" /><span>bg-error + white icon</span></span></Td><Td><TokenCell token="--error-text" display="error-text" /></Td><Td><TokenCell token="--border" display="bg-border" /></Td></tr>
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
                ['  readOnly', 'boolean', 'false', '純追蹤:每一步都不可點(只顯示進度)'],
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
    readOnly: false,
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
    readOnly: {
      control: 'boolean',
      description: 'true=純追蹤,每一步都不可點',
    },
  },
  render: (args) => <InspectorSteps {...args} />,
}

/** 元件檢閱器的步驟條:value 的初值來自右側 Controls;點可點的步驟照常換到那一步(不是只給 value、點了不動的按鈕;F7)。 */
function InspectorSteps({ value: valueArg, ...args }: ComponentProps<typeof Steps>) {
  const [value, setValue] = useState(valueArg)
  useEffect(() => setValue(valueArg), [valueArg])
  return (
    <div className="border border-border rounded-lg p-4 max-w-2xl">
      <Steps aria-label="結帳進度" {...args} value={value} onValueChange={setValue}>
        <StepItem value="cart"><StepLabel>購物車</StepLabel><StepDescription>3 件商品,合計 NT$ 2,490</StepDescription></StepItem>
        <StepItem value="payment"><StepLabel>付款資訊</StepLabel><StepDescription>信用卡 / ATM / LINE Pay</StepDescription></StepItem>
        <StepItem value="shipping"><StepLabel>配送方式</StepLabel><StepDescription>宅配 2-3 個工作天</StepDescription></StepItem>
        <StepItem value="review"><StepLabel>確認訂單</StepLabel><StepDescription>檢視並送出</StepDescription></StepItem>
        <StepItem value="done"><StepLabel>完成</StepLabel></StepItem>
      </Steps>
    </div>
  )
}

export const OrientationMatrix: Story = {
  name: '方向',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Horizontal</H3>
        <Desc>步驟水平排列,常見於結帳流程 / wizard 頂部。Indicator 之間有橫向 connector。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Steps aria-label="結帳進度" readOnly orientation="horizontal" value="payment" completedValues={['cart']}>
            <StepItem value="cart"><StepLabel>購物車</StepLabel></StepItem>
            <StepItem value="payment"><StepLabel>付款</StepLabel></StepItem>
            <StepItem value="shipping"><StepLabel>配送</StepLabel></StepItem>
            <StepItem value="done"><StepLabel>完成</StepLabel></StepItem>
          </Steps>
        </div>
      </div>

      <div>
        <H3>Vertical(預設)</H3>
        <Desc>步驟垂直排列,支援 description 與 content 區 —— 只有目前那一步底下放這一步要做的事(這裡是自訂網域寄件的 DKIM 設定精靈:要貼進 DNS 的兩個值用唯讀欄位給使用者複製)。常見於 onboarding / 設定精靈 / 複雜流程。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Steps orientation="vertical" readOnly value="dns" completedValues={['keys']} aria-label="DKIM 設定進度">
            <StepItem value="keys"><StepLabel>產生 DKIM 金鑰</StepLabel><StepDescription>為 mail.acme.example 產生 2048-bit 金鑰對</StepDescription></StepItem>
            <StepItem value="dns">
              <StepLabel>在 DNS 新增 TXT 記錄</StepLabel>
              <StepDescription>到網域代管商貼上主機名稱與記錄值</StepDescription>
              <StepContent>
                <FieldGroup>
                  <Field mode="readonly">
                    <FieldLabel>主機名稱</FieldLabel>
                    <Input value="acme._domainkey" />
                  </Field>
                  <Field mode="readonly">
                    <FieldLabel>TXT 記錄值</FieldLabel>
                    {/* autoSize:記錄值全文看得到,不在 3 行高的框裡捲(user 2026-10-21「Q4 照你建議」= 乙:唯讀欄位 + autoSize) */}
                    <Textarea autoSize value={DKIM_TXT_RECORD} />
                  </Field>
                </FieldGroup>
              </StepContent>
            </StepItem>
            <StepItem value="verify"><StepLabel>開始驗證</StepLabel><StepDescription>DNS 生效(最長 48 小時)後回來按驗證</StepDescription></StepItem>
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
                <Td><TokenCell token="--on-emphasis" display="白色 Check icon" /></Td>
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
                <Td><TokenCell token="--on-emphasis" display="白色 X icon" /></Td>
                <Td><TokenCell token="--error-text" /></Td>
                <Td><TokenCell token="--border" display="bg-border" /></Td>
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
          <Steps aria-label="結帳進度" readOnly value="shipping" completedValues={['cart']} errorValues={['payment']}>
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
              <Steps aria-label="訂單流程進度" readOnly size={size} value="b" completedValues={['a']}>
                <StepItem value="a"><StepLabel>填寫資料</StepLabel></StepItem>
                <StepItem value="b"><StepLabel>確認訂單</StepLabel></StepItem>
                <StepItem value="c"><StepLabel>完成付款</StepLabel></StepItem>
              </Steps>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   狀態行為 — 進度流轉 / linear / 出錯中斷
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
        <Steps aria-label="結帳進度" readOnly value={current} completedValues={completed} orientation="horizontal">
          {CHECKOUT_STEPS.map((s) => (
            <StepItem key={s.value} value={s.value}>
              <StepLabel>{s.label}</StepLabel>
            </StepItem>
          ))}
        </Steps>
      </div>
      {/* 2026-10-20 XF-01:同一組動作 = ButtonGroup(鈕距由群組擁有,原本手寫 flex gap-2);這一列沒有標題 → 靠左、primary 最左
          (action-bar.spec.md「對齊方向的決定」/「全局排序」,與 Steps 展示同一個排法;原本上一步在左) */}
      <ButtonGroup>
        <Button variant="primary" size="sm" disabled={idx >= CHECKOUT_STEPS.length - 1} onClick={() => setIdx((i) => Math.min(CHECKOUT_STEPS.length - 1, i + 1))}>
          下一步
        </Button>
        <Button variant="tertiary" size="sm" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
          上一步
        </Button>
      </ButtonGroup>
    </div>
  )
}

const LinearVsNonlinear = () => {
  return (
    <div className="flex gap-6">
      <ExampleGroup className="min-w-[240px]">
        <ExampleCaption><code>linear</code>(預設)</ExampleCaption>
        <div className="border border-border rounded-lg p-4">
          <Steps aria-label="結帳進度" defaultValue="shipping" completedValues={['cart']} orientation="vertical">
            {CHECKOUT_STEPS.slice(0, 4).map((s) => (
              <StepItem key={s.value} value={s.value}>
                <StepLabel>{s.label}</StepLabel>
              </StepItem>
            ))}
          </Steps>
        </div>
        <ExampleCaption>只有「購物車」(已完成)點得回去;「付款」以後還沒解鎖,游標是禁止符號。</ExampleCaption>
      </ExampleGroup>
      <ExampleGroup className="min-w-[240px]">
        <ExampleCaption><code>linear={'{false}'}</code>(可以跳著填)</ExampleCaption>
        <div className="border border-border rounded-lg p-4">
          <Steps aria-label="結帳進度" defaultValue="shipping" completedValues={['cart']} linear={false} orientation="vertical">
            {CHECKOUT_STEPS.slice(0, 4).map((s) => (
              <StepItem key={s.value} value={s.value}>
                <StepLabel>{s.label}</StepLabel>
              </StepItem>
            ))}
          </Steps>
        </div>
        <ExampleCaption>每一步都點得到,適合每一步各自儲存、可以跳著填的流程(例:建立廣告活動)。</ExampleCaption>
      </ExampleGroup>
    </div>
  )
}

const ErrorInterrupt = () => {
  return (
    <div className="border border-border rounded-lg p-4 min-w-[300px]">
      <Steps aria-label="結帳進度" readOnly value="payment" completedValues={['cart', 'shipping']} errorValues={['payment']} orientation="horizontal">
        {CHECKOUT_STEPS.slice(0, 4).map((s) => (
          <StepItem key={s.value} value={s.value}>
            <StepLabel>{s.label}</StepLabel>
          </StepItem>
        ))}
      </Steps>
    </div>
  )
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>進度流轉</H3>
        <Desc>
          每一步的內容狀態(已完成 / 目前 / 還沒到 / 出錯)用什麼顏色見 <StoryLink kind="Design System/Components/Steps/設計規格" name="色彩對照表">色彩對照表</StoryLink>;
          這裡看進度怎麼流轉。現在「購物車」已完成、目前在「配送資訊」;按「下一步」時三件事一起發生:
          「配送資訊」變成實心勾、它到「付款」的連接線變藍、「付款」變成實心藍底白數字並疊上焦點外環。
        </Desc>
        <ProgressFlow />
      </div>

      <div>
        <H3>linear 決定還沒到的步能不能點</H3>
        <Desc>
          <code>linear=true</code>(預設)只能依序往前,回頭只限已完成的步(結帳這種不能跳過的流程)。
          <code>linear=false</code> 每一個沒停用的步都點得到(每一步各自儲存、可以跳著填的流程)。
        </Desc>
        <LinearVsNonlinear />
      </div>

      <div>
        <H3>出錯中斷流程</H3>
        <Desc>
          某一步放進 <code>errorValues</code> 時,那一步變成錯誤狀態(紅底 + ✕),標題轉 <code>--error-text</code>,焦點外環也從 <code>--info-hover</code> 換成 <code>--error-hover</code>。
          要繼續流程,先把它移出 <code>errorValues</code> 再往前推 —— 不會靜靜跳過錯誤。
        </Desc>
        <ErrorInterrupt />
      </div>

      <div className="pt-4 border-t border-divider">
        <H3 paragraph>行為規則</H3>
        <ul className="text-caption text-fg-secondary space-y-1.5 ml-4 list-disc">
          <li>目前那一步只有一個 —— <code>value</code> 是單一值,不像 <code>completedValues</code> 是一組。</li>
          <li>錯誤優先於已完成 —— 同一步同時在 <code>completedValues</code> 與 <code>errorValues</code>,一律畫成錯誤(紅底 ✕)。</li>
          <li>焦點外環顏色自動切換:目前那一步用 <code>--info-hover</code>(<code>linear=false</code> 時用 <code>--border-hover</code>),錯誤用 <code>--error-hover</code>。</li>
          <li>還沒解鎖的步(<code>linear</code> 下)不可點、游標是禁止符號,Tab 跳過。</li>
          <li>目前那一步點了不會發生任何事 → 不是按鈕、Tab 跳過、游標是一般箭頭(它沒有被禁止,只是「你就在這裡」);它的內容區跟著 <code>value</code> 走,沒有東西可收。</li>
          <li>只顯示進度、不能點的步驟條(物流追蹤、文件裡的示意)用 <code>readOnly</code>:每一步都不是按鈕,狀態色照常。</li>
          <li>sm(8px 圓點)沒有圖示 —— 太小畫不出勾和 ✕;md / lg 才有圖示。</li>
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
        <Desc>刻意打破 item-layout 的 24px 閾值規則——不管 indicator 尺寸、不管有無 description,一律 inline 對齊。Column rhythm 優先於「大 prefix 視覺重量平衡文字塊」。這是 Steps 跟其他 row primitive 的本質差異——Steps 是「一條有連接關係的進度路徑」,column rhythm 是元件本身。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Steps aria-label="商家開通進度" readOnly orientation="vertical" value="b" completedValues={['a']}>
            <StepItem value="a"><StepLabel>驗證電子信箱</StepLabel></StepItem>
            <StepItem value="b">
              <StepLabel>完善公司資料</StepLabel>
              <StepDescription>填寫營業登記號碼、負責人身分與收款銀行帳戶,審核通過後才會開通金流收款功能</StepDescription>
            </StepItem>
            <StepItem value="c"><StepLabel>啟用收款</StepLabel></StepItem>
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
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-[var(--layout-space-tight)]">無障礙設計</h3>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          W3C APG 沒有正式的步驟條 pattern,本元件照{' '}
          <a href="https://github.com/carbon-design-system/carbon/blob/7e1d5e5492fd70ab8ec901114898c12a374cea98/packages/react/src/components/ProgressIndicator/ProgressIndicator.tsx#L313-L348" className="text-primary hover:text-primary-hover font-medium" target="_blank" rel="noreferrer">Carbon ProgressIndicator</a>{' '}
          的做法:整條是 <code>{'<ol>'}</code>;可點的步驟是 <code>role="button"</code>;目前那一步帶 <code>aria-current="step"</code>;
          圓形指示點是 <code>aria-hidden</code>,狀態由看不見的文字念出「第 N 步,共 M 步,狀態」。
        </li>
        <li>步驟條要有名字:<code>{'<Steps aria-label="註冊流程進度">'}</code>。</li>
        <li><kbd>Tab</kbd> 一個一個停在可點的步驟上(不用方向鍵切換);目前那一步、還沒解鎖的步、<code>readOnly</code> 的步驟條都不停。</li>
        <li><kbd>Enter</kbd> / <kbd>Space</kbd> 跳到那一步。</li>
        <li>焦點框跟全 DS 一樣:2px 外框、與元件之間留 2px。</li>
      </ul>
    </div>
  ),
}
