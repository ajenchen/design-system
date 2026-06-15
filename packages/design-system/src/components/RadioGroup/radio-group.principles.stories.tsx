// @principles-rationale: UsageGuidance merges WhenToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { RadioGroup, RadioGroupItem } from './radio-group'

const meta: Meta = {
  title: 'Design System/Components/RadioGroup/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

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
  render: () => {
    const [status, setStatus] = React.useState('in_stock')
    return (
      <div>
        <Section title="何時用">
          <div className="prose prose-sm max-w-prose mb-8">
            <p>適合 RadioGroup 的真實業務場景(點擊跳轉「展示」頁範例):</p>
            <ul className="space-y-1">
              <li><LinkTo kind="Design System/Components/RadioGroup/展示" name="直式群組"><span className="text-primary hover:underline font-medium cursor-pointer">直式群組</span></LinkTo><span className="text-fg-secondary"> — 訂閱方案選擇(月付 / 年付 / 終身):需要對比價格與說明的決策節點,直式 + description 完整閱讀</span></li>
              <li><LinkTo kind="Design System/Components/RadioGroup/展示" name="水平排列"><span className="text-primary hover:underline font-medium cursor-pointer">水平排列</span></LinkTo><span className="text-fg-secondary"> — 外觀主題切換(淺色 / 深色 / 系統):2-3 個短 label、不需描述文字,橫排省垂直空間</span></li>
            </ul>
            <p className="text-fg-muted mt-3">判斷不確定時:回頭看「何時用 / 何時不用」;若仍不符,改用近親元件(見下方「vs 近親元件」)。</p>
          </div>
        </Section>

        <Section title="何時不用 + 替代方案">
          <Rule
            title="❌ label 自帶語意 + 空間受限:用 Select"
            note="「庫存狀態」「類別」這類 label 本身夠清楚、使用者知道要選什麼 → Select 下拉節省空間。RadioGroup 全露反而浪費垂直空間"
          >
            <RadioGroup value={status} onValueChange={setStatus}>
              <RadioGroupItem value="in_stock" label="In stock" />
              <RadioGroupItem value="low_stock" label="Low stock" />
              <RadioGroupItem value="out_of_stock" label="Out of stock" />
            </RadioGroup>
            <Label warn>↑ 庫存狀態 label 自帶語意 → 用 Select 一格就夠,不需要 3 行 RadioGroup</Label>
          </Rule>

          <Rule
            title="❌ 單個 Radio 假裝 Checkbox"
            note="想用「radio 形狀」當勾選提示 → 錯。Radio 的視覺是「從多選一」的承諾,單個不符合這個語意。yes/no 用 Checkbox 或 Switch"
          >
            <Label warn>單個同意框用 Checkbox,不用 Radio 假裝</Label>
          </Rule>
        </Section>

        <Section title="vs 近親元件">
          <Rule
            title="從三個角度判斷該用哪個"
            note="1. 展開成本:Select 把選項藏進下拉、RadioGroup 全部攤開 2. 視覺份量:Select 只佔一行、RadioGroup 佔 N 行 3. 評估深度:使用者需要逐項對比才能決定嗎?需要對比 → RadioGroup;不需要 → Select。灰色地帶的一句話判斷:「使用者看一眼 label 就能下決定嗎?」能 → Select;不能、需要閱讀 description → RadioGroup"
          >
            <Label>選項一眼就懂、不需對比時,優先用 Select 省空間;拿不定主意用「看一眼 label 能否下決定」快速判斷</Label>
          </Rule>
        </Section>
      </div>
    )
  },
}

export const DecisionNodeRule: Story = {
  name: '決策節點（需對比評估）',
  render: () => {
    const [payment, setPayment] = React.useState('credit')
    const [plan, setPlan] = React.useState('pro')
    return (
      <div>
        <Rule
          title="RadioGroup 的 sweet spot — 使用者需對比所有選項才能決定"
          note="付款方式、訂閱方案、票種、權限角色——選項需要閱讀 description(價格、手續費、權限範圍)才能下決定。RadioGroup 全露選項 + 支援 description"
        >
          <RadioGroup value={payment} onValueChange={setPayment}>
            <RadioGroupItem value="credit" label="信用卡" description="手續費 2.5%,即時入帳" />
            <RadioGroupItem value="bank" label="銀行轉帳" description="無手續費,1-2 個工作日" />
            <RadioGroupItem value="cash" label="貨到付款" description="手續費 NT$30,到貨時付" />
          </RadioGroup>
          <Label>↑ 付款方式必須看完手續費 / 處理時間才能決定 → 全露選項</Label>
        </Rule>

        <Rule
          title="訂閱方案 — description 承載 feature 差異"
          note="方案比較需要看到每個方案的 features + 價格。RadioGroup 的 label + description 可以清楚列出,Select 下拉藏起來會失去比較能力"
        >
          <RadioGroup value={plan} onValueChange={setPlan}>
            <RadioGroupItem
              value="basic"
              label="Basic · NT$99/月"
              description="5 個專案、2 GB 儲存空間、基本支援"
            />
            <RadioGroupItem
              value="pro"
              label="Pro · NT$299/月"
              description="無限專案、50 GB 儲存空間、優先支援、進階分析"
            />
            <RadioGroupItem
              value="enterprise"
              label="Enterprise · 聯絡我們"
              description="客製化配額、專屬客戶經理、SSO / SAML 整合"
            />
          </RadioGroup>
          <Label>↑ 方案比較必須看 features 才能決策 → RadioGroup 全露 + description</Label>
        </Rule>
      </div>
    )
  },
}

export const MustBeInGroupRule: Story = {
  name: '單選按鈕不可單獨使用',
  render: () => {
    const [accept, setAccept] = React.useState('yes')
    return (
      <div>
        <Rule
          title="單選按鈕必須放在 RadioGroup 內"
          note="Radio 的語意是「從 N 個選項選一個」——N ≥ 2 才有意義。單個 Radio 無法表達互斥選擇,若只是 yes/no 用 Checkbox 或 Switch"
        >
          <RadioGroup value={accept} onValueChange={setAccept}>
            <RadioGroupItem value="yes" label="我同意" />
            <RadioGroupItem value="no" label="我不同意" />
          </RadioGroup>
          <Label>↑ yes/no 的 RadioGroup 是合法的(兩個互斥選項),但常見場景用 Checkbox(「我同意」)更輕</Label>
        </Rule>

        <Rule
          title="RadioGroup 預設建議給 default value"
          note="一組全空的 radio 會讓使用者困惑「我要選什麼」——通常應指定 defaultValue 或 value。例外:表單要求使用者主動表態時,value=null 為合法 initial state(見 spec「邊界案例」),由 Field required 驗證引導選擇"
        >
          <Label>若真的「可以不選」(選填)→ 用 Select + clearable 或 Checkbox stack</Label>
        </Rule>
      </div>
    )
  },
}
