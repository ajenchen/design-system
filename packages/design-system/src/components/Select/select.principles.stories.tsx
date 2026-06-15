// @principles-rationale: Merged WhenToUse + WhenNotToUse(已是 vs 近親 — RadioGroup /
// SegmentedControl / Combobox / Switch)into a single `UsageGuidance` story (3 sections)
// per 2026-04-26 user mandate. DisplayModeRule / ImmediateVsSubmitRule / SearchableRule
// / NativeSelectRule kept as separate principles.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Flag } from 'lucide-react'
import { Select } from './select'

const meta: Meta = {
  title: 'Design System/Components/Select/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-xs">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Options ───────────────────────────────────────────────────────────────────

const statusOptions = [
  { value: 'in_stock', label: 'In stock', tagVariant: 'green' },
  { value: 'low_stock', label: 'Low stock', tagVariant: 'yellow' },
  { value: 'out_of_stock', label: 'Out of stock', tagVariant: 'red' },
]

const categoryOptions = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'food', label: 'Food' },
]

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [status, setStatus] = React.useState('in_stock')
    return (
      <div>
        <Section title="何時用">
          <div className="prose prose-sm max-w-prose">
            <p>適合 Select 的真實業務場景(點擊跳轉「展示」頁範例):</p>
            <ul className="space-y-1">
              <li>
                <LinkTo kind="Design System/Components/Select/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">四模式</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Components/Select/展示" name="顯示模式"><span className="text-primary hover:underline font-medium cursor-pointer">顯示模式</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Components/Select/展示" name="尺寸與 Button 對齊"><span className="text-primary hover:underline font-medium cursor-pointer">尺寸與 Button 對齊</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Components/Select/展示" name="可清除"><span className="text-primary hover:underline font-medium cursor-pointer">可清除</span></LinkTo>
              </li>
              <li>
                <LinkTo kind="Design System/Components/Select/展示" name="搜尋"><span className="text-primary hover:underline font-medium cursor-pointer">搜尋</span></LinkTo>
              </li>
            </ul>
            <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
          </div>
        </Section>

        <Section title="何時不用 + 替代">
          <Rule
            title="Select 的 sweet spot — 3+ 選項、空間受限、不需一眼全看"
            note="表單欄位、toolbar filter、table cell。使用者先看 label,點開才瀏覽選項"
          >
            <Select display="tag" options={statusOptions} value={status} onChange={setStatus} />
          </Rule>

          <Rule
            title="❌ 多選:用 Combobox"
            note="Select 永遠單選。需要多選(categories、tags、assignees)必須用 Combobox"
          >
            <Select options={categoryOptions} value="electronics" onChange={() => {}} />
            <Label warn>↑ 需要「同時選 Electronics + Furniture」就不能用 Select</Label>
          </Rule>

          <Rule
            title="❌ 布林 on/off:用 Switch"
            note="on/off 不需要「選一個」的心智模型。Switch 視覺直接表達開關狀態,一次點擊完成切換"
          >
            <Select
              options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
              value="on"
              onChange={() => {}}
            />
            <Label warn>↑ On/Off 用 Select → 多餘的 dropdown 互動、不如 Switch 直觀</Label>
          </Rule>
        </Section>

        <Section title="vs 近親 — Select / RadioGroup / SegmentedControl / Combobox">
          <Rule
            title="❌ 決策節點(使用者需要對比評估):用 RadioGroup"
            note="付款方式、訂閱方案、票種、權限角色——使用者必須看完所有選項才能決定,通常連帶 description / 價格 / feature list。RadioGroup 全露選項支援對比;Select 把選項藏起來,強迫使用者打開 → 讀 → 收起 → 再打開才能比較。判準不是數量,是「選擇本身是不是決策動作」,完整對照見 select.spec.md 的「與 RadioGroup 的分界」"
          >
            <Select
              options={[
                { value: 'credit', label: '信用卡(手續費 2.5%,即時)' },
                { value: 'bank', label: '銀行轉帳(無手續費,1-2 工作日)' },
                { value: 'cash', label: '貨到付款(手續費 NT$30,到貨時付)' },
              ]}
              value="credit"
              onChange={() => {}}
            />
            <Label warn>↑ 付款方式是決策節點 + 需要對比手續費 / 處理時間 → 用 RadioGroup 讓選項全露</Label>
          </Rule>

          <Rule
            title="❌ 緊湊切換 / filter:用 SegmentedControl"
            note="SegmentedControl 是 compact control(pill 尺寸),能跟 Button / Input 並排不違和。適合 toolbar 的 view mode、filter tab、chart 時間維度切換。詳見 segmented-control.spec.md"
          >
            <Select
              options={[
                { value: 'all', label: '全部' },
                { value: 'active', label: '進行中' },
                { value: 'done', label: '已完成' },
              ]}
              value="active"
              onChange={() => {}}
            />
            <Label warn>↑ Toolbar filter 放 Select → 佔空間、視覺重量比旁邊 Button 重</Label>
          </Rule>
        </Section>
      </div>
    )
  },
}

export const DisplayModeRule: Story = {
  name: '顯示模式選擇',
  render: () => {
    const [category, setCategory] = React.useState('electronics')
    const [status, setStatus] = React.useState('in_stock')
    const [badExample, setBadExample] = React.useState('in_stock')
    return (
      <div>
        <Rule
          title="plain — 純文字選項(預設)"
          note="選項沒有色彩語意、僅靠文字就能識別時使用。常見場景:類別、地區、語言、角色等"
        >
          <Select options={categoryOptions} value={category} onChange={setCategory} />
        </Rule>

        <Rule
          title="tag — 需要色彩識別的選項"
          note="選項帶有類別或狀態語意,顏色能加速掃視(庫存狀態、優先級、標籤)。options 裡用 tagVariant 指定顏色,edit / readonly / disabled 都用同一顆 Tag 呈現"
        >
          <Select display="tag" options={statusOptions} value={status} onChange={setStatus} />
        </Rule>

        <Rule
          title="❌ tag 模式不加 startIcon"
          note="Tag 本身就是視覺標記(顏色 + 形狀),再加 startIcon 是雙重傳達——視覺冗餘且爭奪焦點"
        >
          <Select
            display="tag"
            startIcon={Flag}
            options={statusOptions}
            value={badExample}
            onChange={setBadExample}
          />
          <Label warn>↑ 左側 Flag icon 和右邊 Tag 都在傳達「這是狀態」——去掉 startIcon</Label>
        </Rule>
      </div>
    )
  },
}

export const ImmediateVsSubmitRule: Story = {
  name: '即時套用 vs 隨表單送出',
  render: () => {
    const [immediate, setImmediate] = React.useState('in_stock')
    const [draft, setDraft] = React.useState('electronics')
    return (
      <div>
        <Rule
          title="即時套用 — onChange 直接觸發副作用"
          note="Jira status、Linear priority、filter、theme 切換。改了立刻寫 DB / 送 API / 改 URL。onChange 通常呼叫 mutation 或 setState 更新父層。沒有「取消」的概念"
        >
          <div>
            <p className="text-caption text-fg-muted mb-1">Task status(改了立刻寫 DB)</p>
            <Select display="tag" options={statusOptions} value={immediate} onChange={setImmediate} />
          </div>
          <Label>↑ 視覺上是獨立的 inline control,旁邊沒有 submit button</Label>
        </Rule>

        <Rule
          title="隨 form 送出 — onChange 只更新 local state"
          note="建立/編輯表單、對話框設定。onChange 寫進 React state,直到 submit button 被按才送出。有「取消」可回復"
        >
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-caption text-fg-muted mb-1 block">Category</label>
              <Select options={categoryOptions} value={draft} onChange={setDraft} />
            </div>
            <div className="flex gap-2 pt-2">
              <button className="h-field-md px-3 text-body rounded-md bg-primary text-inverse-fg">儲存</button>
              <button className="h-field-md px-3 text-body rounded-md border border-border">取消</button>
            </div>
          </div>
          <Label>↑ 包在 Form 容器內 + submit / cancel button,使用者清楚儲存時機</Label>
        </Rule>

        <Rule
          title="❌ 讓使用者搞不清楚是哪種"
          note="最常見的失敗:inline 放一個 Select 但 onChange 只改 local state,旁邊卻沒有 submit button。使用者以為改了就套用,離開頁面才發現沒存。這是 DS 最常見的信任破壞點"
        >
          <Select options={categoryOptions} value={draft} onChange={setDraft} />
          <Label warn>↑ 沒有 Form 容器、沒有 submit button、又是獨立的 inline control——使用者無法判斷是即時還是要送出</Label>
        </Rule>
      </div>
    )
  },
}

export const SearchableRule: Story = {
  name: '可搜尋 開啟判斷',
  render: () => (
    <div>
      <Rule
        title="主判準:label 性質——獨特關鍵字 / 代碼 / 非自然語言 → 開 searchable"
        note="使用者無法靠眼睛或 type-to-jump 快速定位時才需要搜尋。產品代碼(SKU-4837)、機場代碼(TPE / NRT)、使用者 ID、ticket number——這類 label 沒有記憶點,必須輸入才能找"
      >
        <Select
          searchable
          options={[
            { value: 'sku-4837', label: 'SKU-4837' },
            { value: 'sku-8210', label: 'SKU-8210' },
            { value: 'sku-9104', label: 'SKU-9104' },
          ]}
          value="sku-4837"
          onChange={() => {}}
        />
        <Label>↑ 即使只有 3 個選項,產品代碼 label 仍需要 searchable</Label>
      </Rule>

      <Rule
        title="❌ 流暢自然語言 label:不開 searchable"
        note="Electronics / Furniture / Food 這類 label 短清單一眼可掃(手機原生 select 另有 type-to-jump 直達;桌機自建 combobox 無逐字定位,但掃視已夠快)。多加 searchable 等於多一層不必要的互動"
      >
        <Select
          searchable
          options={categoryOptions}
          value="electronics"
          onChange={() => {}}
        />
        <Label warn>↑ 3 個自然語言 label 加 searchable → 使用者必須打字或再點擊才能選</Label>
      </Rule>

      <Rule
        title="次要啟發:數量 > 50 幾乎必開(但仍看 label 性質)"
        note="100 個 a/b/c 不需要搜尋(字母排序掃視快,手機原生 select 還有 type-to-jump 直達),5 個產品代碼需要搜尋。純數量 threshold 會誤判這兩端,詳見 spec"
      >
        <Label>判斷優先序:label 性質 → 數量次要啟發</Label>
      </Rule>
    </div>
  ),
}

export const NativeSelectRule: Story = {
  name: '桌機自建選單 vs 手機原生選擇器',
  render: () => {
    const [value, setValue] = React.useState('electronics')
    return (
      <div>
        <Rule
          title="依裝置自動切換兩種實作"
          note="Select 偵測觸控裝置自動選路:桌機(非觸控)用自建選單——觸發點是一個可聚焦的容器,點開後在浮層裡顯示選項清單,支援搜尋與群組;手機(觸控)改用瀏覽器原生的 <select>,直接叫出作業系統內建的滾輪 picker。同一份 options 兩邊共用,consumer 不需分平台寫兩套。"
        >
          <Select options={categoryOptions} value={value} onChange={setValue} />
          <Label>↑ 桌機這顆是自建選單(點開看浮層);切到手機模擬器會變成系統原生 picker</Label>
        </Rule>

        <Rule
          title="tag 模式只是把選中值畫成 Tag,行為跟 plain 一樣"
          note="tag 與 plain 的差別只在「選中值怎麼呈現」——tag 用一顆有顏色的 Tag,plain 用純文字。底層的開選單、選值、鍵盤行為兩種模式完全相同,都走上面那套依裝置切換的路徑。"
        >
          <Select display="tag" options={statusOptions} value="in_stock" onChange={() => {}} />
          <Label>↑ 點這顆 Tag 會打開選單;桌機是自建浮層,手機是系統原生 picker</Label>
        </Rule>
      </div>
    )
  },
}
