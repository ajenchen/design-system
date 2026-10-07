// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { DescriptionList, DescriptionItem } from './description-list'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { Button } from '@/design-system/components/Button/button'
import { Tag } from '@/design-system/components/Tag/tag'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging
import { CaptionedExamples } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/DescriptionList/設計原則',
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
  <div className="mb-[var(--layout-space-loose)]">
    <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)] max-w-[720px]">{note}</p>}
    <CaptionedExamples caption={Label}>{children}</CaptionedExamples>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`border border-border rounded-lg p-[var(--layout-space-loose)] ${className ?? ''}`}>{children}</div>
)

// ── DataTable 範例資料(「多個使用者的同結構屬性」)───────────────────────────
type Member = { name: string; email: string; team: string }
const MEMBERS: Member[] = [
  { name: 'Ada Chen', email: 'ada.chen@example.com', team: 'Design' },
  { name: '王小明', email: 'ming@example.com', team: 'Engineering' },
]
const memberCol = createColumnHelper<Member>()
const MEMBER_COLUMNS = [
  memberCol.accessor('name', { header: '姓名', meta: { type: 'string', width: 140 } }),
  memberCol.accessor('email', { header: 'Email', meta: { type: 'string', width: 220 } }),
  memberCol.accessor('team', { header: '團隊', meta: { type: 'string', width: 140 } }),
]

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 DescriptionList ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsDataTableRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 DescriptionList 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="使用者個資"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">使用者個資</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="產品規格"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">產品規格</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="訂單明細"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">訂單明細</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="詳情面板"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">詳情面板</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="水平佈局"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">水平佈局</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsDataTableRule — 原 VsDataTableRule */}
      <div>
      <Rule
        title="DescriptionList — 單一實體的屬性列表(key-value 配對)"
        note="每一行是同一個對象(使用者 / 訂單 / 商品)的不同屬性(姓名 / email / 時區)。讀取模式,不支援排序、篩選、多選"
      >
        <Frame className="max-w-md">
          <h4 className="text-h6 font-medium mb-[var(--layout-space-tight)]">使用者資料</h4>
          <DescriptionList cols={1}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label>↑ 「一個使用者」的多個屬性 → DescriptionList(語意:dl/dt/dd)</Label>
      </Rule>

      <Rule
        title="DataTable — 多個同結構實體的集合(多 row)"
        note="每一 row 是不同實體、同樣欄位結構。需要排序、篩選、分頁 → DataTable,不是 DescriptionList"
      >
        {/* 範例消費它要讀者去用的那個元件(M23):最小的 DataTable —— 兩列、無虛擬捲動 / 拖曳 / 篩選 */}
        <div className="w-full max-w-xl">
          <DataTable columns={MEMBER_COLUMNS} data={MEMBERS} getRowId={(m) => m.email} height="auto" />
        </div>
        <Label>↑ 「多個使用者」的同結構屬性 → DataTable(需要排序 / 篩選)</Label>
      </Rule>

      <Rule
        title="❌ 用 DescriptionList 展示多筆同結構資料"
        note="DescriptionList 的 dt 重複 = 視覺噪音,且無法排序 / 篩選 / 分頁。使用者眼睛掃不到對齊點 → 難比較"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="姓名">王小明</DescriptionItem>
            <DescriptionItem label="Email">ming@example.com</DescriptionItem>
            <DescriptionItem label="姓名">林大華</DescriptionItem>
            <DescriptionItem label="Email">dahua@example.com</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label warn>↑ 「姓名 / Email」重複三次 — table 式資料應改用 DataTable</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const LayoutRule: Story = {
  name: '直式 vs 橫式（欄數對照）',
  render: () => (
    <div>
      <Rule
        title="cols=1(vertical stack)— 長清單、窄容器、mobile-friendly"
        note="label 在上、value 在下的垂直堆疊 → 適合 sidebar、ProfileCard、mobile detail view。Value 可以佔滿整行寬,長文字不壓迫"
      >
        <Frame className="max-w-xs">
          <DescriptionList cols={1}>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="職稱">Senior Design Engineer</DescriptionItem>
            <DescriptionItem label="團隊">Design Systems</DescriptionItem>
            <DescriptionItem label="時區">UTC+8(台北)</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label>↑ 窄容器(320px)時垂直堆疊 — 不會因為兩欄而壓縮 value</Label>
      </Rule>

      <Rule
        title="cols=2 / 3(grid)— 短對比、desktop 寬容器、可快速掃視"
        note="多個屬性並排 → 適合 detail panel、訂單摘要、產品規格。使用者眼睛可以水平掃視比較 — 但 value 必須短(一行內),不然會破壞 grid 對齊"
      >
        <Frame className="max-w-2xl">
          <DescriptionList cols={2}>
            <DescriptionItem label="訂單編號">#20260418-A241</DescriptionItem>
            <DescriptionItem label="狀態">已出貨</DescriptionItem>
            <DescriptionItem label="建立時間">2026-04-18</DescriptionItem>
            <DescriptionItem label="預計送達">2026-04-20</DescriptionItem>
            <DescriptionItem label="付款方式">信用卡</DescriptionItem>
            <DescriptionItem label="總金額">NT$ 10,080</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label>↑ 寬容器(700px+)並排展示 — 使用者可快速對照多個屬性</Label>
      </Rule>

      <Rule
        title="❌ 窄容器硬塞多欄 → value 被擠爆"
        note="cols 數量要配合容器寬度。窄容器(<400px)硬塞 2 欄會讓 value 斷行、視覺節奏亂掉"
      >
        <Frame className="max-w-xs">
          <DescriptionList cols={2}>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="職稱">Senior Design Engineer</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label warn>↑ 窄容器配 cols=2 → 職稱被迫斷行、email 擠壓貼邊,節奏亂、可讀性差</Label>
      </Rule>
    </div>
  ),
}

export const LabelAlignmentRule: Story = {
  name: '標籤 對齊 — 一律左對齊（堆疊）',
  render: () => (
    <div>
      <Rule
        title="本系統採 stacked(label 在上、value 在下)— label 左對齊"
        note="對齊 Atlassian / Shopify Polaris / Stripe 慣例——label 與 value 垂直堆疊,兩者都左對齊。閱讀節奏由上往下、由左往右,不需視線左右跳動。這是 vertical(預設)模式的結構;label 左 / value 右的 metadata 列改用既有 `orientation=&quot;horizontal&quot;` prop(見 spec「Orientation」段)"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={2}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="職稱">Design Engineer</DescriptionItem>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="電話">0912-345-678</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label>↑ 每一組:label(neutral-8)在上,value(neutral-9)在下,同左對齊</Label>
      </Rule>

      <Rule
        title="層級靠色彩,不靠字體大小"
        note="label 與 value 皆為 14px,視覺層級由 text-fg-secondary(label)和 text-foreground(value)的對比建立。這讓閱讀流暢,不會因字體大小落差讓 label 喧賓奪主"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="此 label 是 neutral-8(text-fg-secondary)">
              此 value 是 neutral-9(text-foreground)
            </DescriptionItem>
          </DescriptionList>
        </Frame>
      </Rule>

      <Rule
        title="❌ 不要自己用 flex 改 horizontal layout"
        note="手刻 flex 模擬 label 左 / value 右 → 失去 dl/dt/dd 語意,且多欄配置下 grid 對齊錯亂。有此需求 → 用既有 `orientation=&quot;horizontal&quot;` prop(dl/dt/dd 語意完整保留,見 showcase「水平佈局」story),不要自組 layout"
      >
        <Frame className="max-w-md">
          {/* @story-counter-example: ❌ 反例:手刻 flex 模擬 label / value 列(本則教的正是「不要自己用 flex 排」,py 4px 是反例本身) */}
          <div className="flex justify-between py-1">
            <span className="text-body text-fg-secondary">姓名</span>
            <span className="text-body">Ada Chen</span>
          </div>
          {/* @story-counter-example: ❌ 反例:手刻 flex 模擬 label / value 列(本則教的正是「不要自己用 flex 排」,py 4px 是反例本身) */}
          <div className="flex justify-between py-1">
            <span className="text-body text-fg-secondary">Email</span>
            <span className="text-body">ada.chen@example.com</span>
          </div>
        </Frame>
        <Label warn>
          ↑ 這是自訂 layout 模擬 label 左 / value 右(key-left-value-right)→ 不是 DescriptionList,也無 dl/dt/dd 語義
        </Label>
      </Rule>
    </div>
  ),
}

export const NoInteractionRule: Story = {
  name: '唯讀:不放互動元件',
  render: () => (
    <div>
      <Rule
        title="✅ value 可以是 ReactNode(Tag / Badge / Link),但必須是展示性質"
        note="Tag 顯示狀態、Badge 顯示計數、Link 指向相關資源——這些都是「讀完就知道」的展示元件,不需使用者操作 DescriptionList 本身"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="訂單狀態">
              <Tag>已出貨</Tag>
            </DescriptionItem>
            <DescriptionItem label="物流追蹤">
              <a href="#" className="text-primary hover:text-primary-hover underline">
                FedEx #1234567890
              </a>
            </DescriptionItem>
            <DescriptionItem label="預計送達">2026-04-20</DescriptionItem>
          </DescriptionList>
        </Frame>
      </Rule>

      <Rule
        title="❌ 需要編輯 → 用 Field 系統,不是 DescriptionList"
        note="DescriptionList 是唯讀展示。若使用者要能改(Input / Select / DatePicker),改用 Field — 有明確的 label、input、validation、submit 語義"
      >
        <FieldGroup className="max-w-md">
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input defaultValue="ada.chen@example.com" />
          </Field>
          <Field>
            <FieldLabel>職稱</FieldLabel>
            <Input defaultValue="Design Engineer" />
          </Field>
        </FieldGroup>
        <Label>↑ 可編輯欄位 → Field 系統;唯讀屬性 → DescriptionList</Label>
      </Rule>

      <Rule
        title="❌ 在 value 放 Button / Input 等互動元件"
        note="DescriptionList 的語義是唯讀屬性展示。放 Button 會讓 screen reader 在 dd 內讀到 button → 使用者混淆(這是一個屬性還是一個動作?)。若要「讀取為主 + 偶爾編輯」,改用 Field 的 read-only mode 或 inline-edit pattern"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="Email">
              {/* @layout-space-magic-ok: 反例 dd 內 值 ↔ 編輯鈕(反例主題是 dd 放互動元件,間距是行內 micro)(layoutSpace.spec.md:166 micro) */}
              <div className="flex items-center gap-2">
                <span>ada.chen@example.com</span>
                <Button variant="text" size="xs">編輯</Button>
              </div>
            </DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label warn>
          ↑ dd 內放 Button 破壞「唯讀屬性」語義 → 改用 Field(read-only mode + inline edit)
        </Label>
      </Rule>
      {/* 「多筆同結構 → DataTable」的 ❌ 對照由「使用指引」story(vs DataTable 段)擁有,不在此重複 */}
    </div>
  ),
}
