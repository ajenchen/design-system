// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Search, Mail, Lock, Globe, X, Eye, EyeOff, AlertCircle, CheckCircle2,
} from 'lucide-react'
import { Input } from './input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

const meta: Meta = {
  title: 'Design System/Components/Input/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 Input 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Input/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">商品名稱欄位的編輯 / 純展示 / 唯讀 / 停用四模式</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Input/展示" name="尺寸與 Button 對齊"><span className="text-primary hover:underline font-medium cursor-pointer">搜尋列 — 輸入框與按鈕並排等高</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Input/展示" name="尾端操作"><span className="text-primary hover:underline font-medium cursor-pointer">密碼顯示切換 / 搜尋清除等尾端操作</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Input/展示" name="錯誤狀態"><span className="text-primary hover:underline font-medium cursor-pointer">Email 格式錯誤的驗證回饋</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 不用 Input variant='bare' 在表單主區域"
          note="bare 是 toolbar inline edit 專用(適合外層已有 affordance)。表單需要明確 field chrome → 用 variant='default'。Notion 的 property inline edit 用 bare"
        >
          <div>
            <Input variant="bare" placeholder="搜尋..." />
            <Label warn>❌ 表單用 default,bare 只用 toolbar</Label>
          </div>
        </Rule>

        <Rule
          title="❌ 不用 Input startIcon 表達狀態(有效 / 無效)"
          note="startIcon 是「欄位用途」識別符(郵件、搜尋、網址)。狀態用邊框 + help text。Stripe 信卡欄的有效狀態由邊框顏色傳達"
        >
          <Label warn>startIcon = 欄位身份,狀態由邊框 + help text 傳達</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="❌ 不用 Input 顯示需要格式化的資料 → NumberInput / DatePicker"
          note="數字、日期、金額都需要格式化(千分位、時區、幣別符號)。每種資料類型有專屬元件,擁有該類型的格式化邏輯(唯一真實來源),同時服務 Form 和 DataTable"
        >
          <Input defaultValue="1234567" placeholder="金額" />
          <Label warn>↑ 金額 → 用 NumberInput + currency mode(自動 $1,234,567)</Label>
          <Input defaultValue="2026-04-18" placeholder="日期" />
          <Label warn>↑ 日期 → 用 DatePicker(in-locale 顯示、避免時區誤判)</Label>
          <Input defaultValue="1234567" placeholder="數量" />
          <Label warn>↑ 數字 → 用 NumberInput(千分位、min/max、step)</Label>
        </Rule>

        <Rule
          title="✅ Input 只用於純文字——沒有格式化需求的 value"
          note="姓名、URL、搜尋字串、email。格式化邏輯是 identity(value → value)"
        >
          <Input placeholder="姓名" defaultValue="Ada Chen" />
          <Input startIcon={Globe} defaultValue="https://example.com" />
          <Input startIcon={Search} placeholder="搜尋..." />
        </Rule>
      </Section>
    </div>
  ),
}

export const ModeRule: Story = {
  name: '模式選擇',
  render: () => (
    <div>
      <Rule
        title="edit — 表單中可編輯的欄位(預設)"
        note="Focus 時邊框變 primary,使用者正在輸入或修改"
      >
        <Input defaultValue="Wireless Bluetooth Headphones" />
      </Rule>

      <Rule
        title="readonly — 表單中顯示但當下不可編輯"
        note="同 edit 高度(neutral-2 底色、無邊框),確保與其他欄位並排對齊。常見場景:viewing mode、送出後鎖定但仍在表單脈絡"
      >
        <Input mode="readonly" defaultValue="alice@example.com" />
      </Rule>

      <Rule
        title="disabled — 外部條件造成無法編輯"
        note="停用原因不在 input 內放 info icon——由外部 Tooltip 或 Form help text 承擔。視覺:灰化文字 + cursor-not-allowed"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Input mode="disabled" defaultValue="僅付費方案可用" />
            </div>
          </TooltipTrigger>
          <TooltipContent>此欄位在免費方案中不可編輯</TooltipContent>
        </Tooltip>
      </Rule>

      <Rule
        title="❌ 不用 readonly 作為 DataTable cell"
        note="readonly 仍然有 padding + 視覺 chrome,密集列表會顯得鬆散。Table cell 用 `<Input mode='display'>`(零視覺 chrome、無左右 padding;wrapper 高度同 readonly)"
      >
        <Input mode="readonly" defaultValue="alice@example.com" />
        <Label warn>↑ 在 table cell 中會過高且有多餘 padding → 用 &lt;Input mode=&quot;display&quot; /&gt;</Label>
      </Rule>
    </div>
  ),
}

export const StartIconRule: Story = {
  name: 'startIcon 語意',
  render: () => (
    <div>
      <Rule
        title="startIcon 描述 input 的「用途」,不是 value 的類型"
        note="icon 幫助使用者一眼辨識這個欄位要填什麼——搜尋、Email、密碼、網址等。與 Button 的 startIcon 同理(描述動作),這裡描述欄位身份"
      >
        <Input startIcon={Search} placeholder="搜尋商品..." />
        <Input startIcon={Mail} defaultValue="alice@example.com" />
        <Input startIcon={Lock} type="password" defaultValue="secret-123" />
        <Input startIcon={Globe} placeholder="https://example.com" />
      </Rule>

      <Rule
        title="❌ startIcon 不可隨 value 變化"
        note="icon 是「身份」不是「狀態」——value 變了但欄位用途沒變,icon 不該跟著跳動。狀態回饋用 error border 或 Form help text"
      >
        <Input startIcon={AlertCircle} defaultValue="invalid-email" />
        <Input startIcon={CheckCircle2} defaultValue="alice@example.com" />
        <Label warn>↑ 用 icon 切換暗示「有效/無效」——status 應該走邊框和 help text,不佔 startIcon 語意槽</Label>
      </Rule>
    </div>
  ),
}

export const EndActionRule: Story = {
  name: 'endAction 適用場景',
  render: () => {
    const [showPwd, setShowPwd] = React.useState(false)
    const [query, setQuery] = React.useState('Bluetooth')
    return (
      <div>
        <Rule
          title="endAction 是「可點擊的動作」——不是狀態指示"
          note="典型場景:顯示/隱藏密碼、清除內容。都是「使用者可以按下」的操作。狀態指示(error、loading、valid)不屬於這個槽位"
        >
          <Input
            type={showPwd ? 'text' : 'password'}
            defaultValue="my-secret-123"
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
            endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
          />
        </Rule>

        <Rule
          title="清除按鈕只在有值時出現,消失後不佔位"
          note="條件渲染 endAction,input 寬度自然擴展。避免永遠保留一個看起來可按但沒作用的 icon"
        >
          <Input
            startIcon={Search}
            value=""
            placeholder="輸入後會出現清除按鈕"
            readOnly
          />
          <Input
            startIcon={Search}
            defaultValue="Bluetooth"
            endAction={{ icon: X, label: '清除搜尋', onClick: () => {} }}
          />
        </Rule>

        <Rule
          title="❌ endAction 不放狀態 / error icon"
          note="狀態資訊由邊框顏色 + Form help text 傳達。如果放 AlertCircle 在 endAction,使用者會以為可以點擊處理錯誤"
        >
          <Input
            error
            defaultValue="invalid-email@"
            endAction={{ icon: AlertCircle, label: '錯誤', onClick: () => {} }}
          />
          <Label warn>↑ 錯誤已由紅邊框傳達,endAction 放 AlertCircle 會讓使用者誤以為可點擊解決</Label>
        </Rule>
      </div>
    )
  },
}

export const ErrorRule: Story = {
  name: '錯誤呈現',
  render: () => (
    <div>
      <Rule
        title="Error 只用邊框 + 外部 help text"
        note="紅色邊框已足夠傳達「這個欄位有問題」,具體訊息由 Form 層的 help text 補充。Input 尾部不放 ⚠️ 狀態 icon"
      >
        <div>
          <Input error defaultValue="invalid-email@" />
          <p className="text-caption text-error mt-1">請輸入有效的 email 地址</p>
        </div>
      </Rule>

      <Rule
        title="❌ 不在 input 尾部放 ⚠️ / ✅ 狀態 icon"
        note="這個位置是 endAction(可點擊動作),放 icon 既無法點擊又稀釋了 action 槽的語意"
      >
        <Input
          error
          defaultValue="invalid-email@"
          endAction={{ icon: AlertCircle, label: '錯誤', onClick: () => {} }}
        />
        <Label warn>↑ 邊框已紅,再加尾部 icon = 雙重傳達 + 佔用 action 槽</Label>
      </Rule>
    </div>
  ),
}

