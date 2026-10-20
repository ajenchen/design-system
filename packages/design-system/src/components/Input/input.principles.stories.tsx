// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Search, Mail, Lock, Globe, X, Eye, EyeOff, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { Input } from './input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { Field, FieldError } from '@/design-system/components/Field/field'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Input/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 Input 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li><StoryLink kind="Design System/Components/Input/展示" name="四模式">商品名稱欄位的編輯 / 純展示 / 唯讀 / 停用四模式</StoryLink></li>
            <li><StoryLink kind="Design System/Components/Input/展示" name="三種尺寸">搜尋列 — 輸入框與按鈕並排等高</StoryLink></li>
            <li><StoryLink kind="Design System/Components/Input/展示" name="尾端操作">密碼顯示切換 / 搜尋清除等尾端操作</StoryLink></li>
            <li><StoryLink kind="Design System/Components/Input/展示" name="錯誤狀態">Email 格式錯誤的驗證回饋</StoryLink></li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 不用 Input startIcon 表達狀態(有效 / 無效)"
          note="startIcon 是「欄位用途」識別符(郵件、搜尋、網址)。狀態用邊框 + help text。Stripe 信卡欄的有效狀態由邊框顏色傳達"
        >
          <ExampleCaption warn>startIcon = 欄位身份,狀態由邊框 + help text 傳達</ExampleCaption>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="❌ 不用 Input 顯示需要格式化的資料 → NumberInput / DatePicker"
          note="數字、日期、金額都需要格式化(千分位、時區、幣別符號)。每種資料類型有專屬元件,擁有該類型的格式化邏輯(唯一真實來源),同時服務 Form 和 DataTable"
        >
          <Input defaultValue="1234567" placeholder="金額" aria-label="金額（不建議用 Input）" />
          <ExampleCaption warn>↑ 金額 → 用 NumberInput + currency mode(自動 $1,234,567)</ExampleCaption>
          <Input defaultValue="2026-04-18" placeholder="日期" aria-label="日期（不建議用 Input）" />
          <ExampleCaption warn>↑ 日期 → 用 DatePicker(in-locale 顯示、避免時區誤判)</ExampleCaption>
          <Input defaultValue="1234567" placeholder="數量" aria-label="數量（不建議用 Input）" />
          <ExampleCaption warn>↑ 數字 → 用 NumberInput(千分位、min/max、step)</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="✅ Input 只用於純文字——沒有格式化需求的 value"
          note="姓名、URL、搜尋字串、email。格式化邏輯是 identity(value → value)"
        >
          <Input placeholder="姓名" defaultValue="Ada Chen" aria-label="姓名" />
          <Input startIcon={Globe} defaultValue="https://example.com" aria-label="網址" />
          <Input startIcon={Search} placeholder="搜尋..." aria-label="搜尋" />
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ModeRule: Story = {
  name: '模式選擇',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="edit — 表單中可編輯的欄位(預設)"
        note="Focus 時邊框變 primary,使用者正在輸入或修改"
      >
        <Input defaultValue="Wireless Bluetooth Headphones" aria-label="商品名稱" />
      </TutorialRule>

      <TutorialRule
        title="readonly — 表單中顯示但當下不可編輯"
        note="同 edit 高度(neutral-2 底色、無邊框),確保與其他欄位並排對齊。常見場景:viewing mode、送出後鎖定但仍在表單脈絡"
      >
        <Input mode="readonly" value="alice@example.com" aria-label="Email（唯讀）" />
      </TutorialRule>

      <TutorialRule
        title="disabled — 外部條件造成無法編輯"
        note="停用原因不在 input 內放 info icon——由外部 Tooltip 或 Form help text 承擔。視覺:灰化文字 + cursor-not-allowed"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Input mode="disabled" defaultValue="僅付費方案可用" aria-label="付費方案欄位（停用）" />
            </div>
          </TooltipTrigger>
          <TooltipContent>此欄位在免費方案中不可編輯</TooltipContent>
        </Tooltip>
      </TutorialRule>

      <TutorialRule
        title="❌ 不用 readonly 作為 DataTable cell"
        note={<>readonly 有底色 chrome(bg-readonly),密集列表會顯得鬆散。Table cell 用 <code>&lt;Input mode='view'&gt;</code>(Model A:edit 幾何減 chrome —— 保留 px 與高度,只拔 border/bg;cell 內經 naked variant 由 host cell 供 padding)</>}
      >
        <Input mode="readonly" value="alice@example.com" aria-label="Email（資料表誤用示範）" />
        <ExampleCaption warn>↑ 在 table cell 中有多餘底色 chrome → 用 &lt;Input mode=&quot;view&quot; /&gt;</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const StartIconRule: Story = {
  name: 'startIcon 語意',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="startIcon 描述 input 的「用途」,不是 value 的類型"
        note="icon 幫助使用者一眼辨識這個欄位要填什麼——搜尋、Email、密碼、網址等。與 Button 的 startIcon 同理(描述動作),這裡描述欄位身份"
      >
        <Input startIcon={Search} placeholder="搜尋商品..." aria-label="搜尋商品" />
        <Input startIcon={Mail} defaultValue="alice@example.com" aria-label="Email" />
        <Input startIcon={Lock} type="password" defaultValue="secret-123" aria-label="密碼" />
        <Input startIcon={Globe} placeholder="https://example.com" aria-label="網址" />
      </TutorialRule>

      <TutorialRule
        title="❌ startIcon 不可隨 value 變化"
        note="icon 是「身份」不是「狀態」——value 變了但欄位用途沒變,icon 不該跟著跳動。狀態回饋用 error border 或 Form help text"
      >
        <Input startIcon={AlertCircle} defaultValue="invalid-email" aria-label="Email（錯誤圖示誤用）" />
        <Input startIcon={CheckCircle2} defaultValue="alice@example.com" aria-label="Email（成功圖示誤用）" />
        <ExampleCaption warn>↑ 用 icon 切換暗示「有效/無效」——status 應該走邊框和 help text,不佔 startIcon 語意槽</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const EndActionRule: Story = {
  name: 'endAction 適用場景',
  render: () => {
    const [showPwd, setShowPwd] = React.useState(false)
    const [query, setQuery] = React.useState('Bluetooth')
    return (
      <TutorialPage>
        <TutorialRule
          title="endAction 是「可點擊的動作」——不是狀態指示"
          note="典型場景:顯示/隱藏密碼、清除內容。都是「使用者可以按下」的操作。狀態指示(error、loading、valid)不屬於這個槽位"
        >
          <Input
            type={showPwd ? 'text' : 'password'}
            defaultValue="my-secret-123"
            aria-label="密碼"
            endAction={{
              icon: showPwd ? EyeOff : Eye,
              label: showPwd ? '隱藏密碼' : '顯示密碼',
              onClick: () => setShowPwd(!showPwd),
            }}
          />
          <Input
            startIcon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜尋商品"
            endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
          />
        </TutorialRule>

        <TutorialRule
          title="清除按鈕只在有值時出現,消失後不佔位"
          note="條件渲染 endAction,input 寬度自然擴展。避免永遠保留一個看起來可按但沒作用的 icon"
        >
          <Input
            startIcon={Search}
            value=""
            placeholder="輸入後會出現清除按鈕"
            aria-label="搜尋商品（空值）"
            readOnly
          />
          <Input
            startIcon={Search}
            defaultValue="Bluetooth"
            aria-label="搜尋商品（有值）"
            endAction={{ icon: X, label: '清除搜尋', onClick: () => {} }}
          />
        </TutorialRule>

        <TutorialRule
          title="❌ endAction 不放狀態 / error icon"
          note="狀態資訊由邊框顏色 + Form help text 傳達。如果放 AlertCircle 在 endAction,使用者會以為可以點擊處理錯誤"
        >
          <Input
            error
            defaultValue="invalid-email@"
            aria-label="Email（錯誤狀態圖示誤用）"
            endAction={{ icon: AlertCircle, label: '錯誤', onClick: () => {} }}
          />
          <ExampleCaption warn>↑ 錯誤已由紅邊框傳達,endAction 放 AlertCircle 會讓使用者誤以為可點擊解決</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

export const ErrorRule: Story = {
  name: '錯誤呈現',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Error 只用邊框 + 外部 help text"
        note="紅色邊框已足夠傳達「這個欄位有問題」,具體訊息由 Form 層的 help text 補充。Input 尾部不放 ⚠️ 狀態 icon"
      >
        <Field invalid>
          <Input defaultValue="invalid-email@" aria-label="Email（錯誤狀態）" />
          <FieldError>請輸入有效的 email 地址</FieldError>
        </Field>
      </TutorialRule>

      <TutorialRule
        title="❌ 不在 input 尾部放 ⚠️ / ✅ 狀態 icon"
        note="這個位置是 endAction(可點擊動作),放 icon 既無法點擊又稀釋了 action 槽的語意"
      >
        <Input
          error
          defaultValue="invalid-email@"
          aria-label="Email（錯誤狀態圖示誤用）"
          endAction={{ icon: AlertCircle, label: '錯誤', onClick: () => {} }}
        />
        <ExampleCaption warn>↑ 邊框已紅,再加尾部 icon = 雙重傳達 + 佔用 action 槽</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
