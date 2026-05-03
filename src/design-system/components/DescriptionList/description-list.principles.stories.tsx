// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { DescriptionList, DescriptionItem } from './description-list'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Button } from '@/design-system/components/Button/button'
import { Tag } from '@/design-system/components/Tag/tag'

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
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-4">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`border border-border rounded-lg p-4 ${className ?? ''}`}>{children}</div>
)

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 DescriptionList ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsDataTableRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 DescriptionList 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="User profile"><span className="text-primary hover:underline font-medium cursor-pointer">User profile</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="Product spec"><span className="text-primary hover:underline font-medium cursor-pointer">Product spec</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="訂單明細"><span className="text-primary hover:underline font-medium cursor-pointer">訂單明細</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="Detail panel"><span className="text-primary hover:underline font-medium cursor-pointer">Detail panel</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/DescriptionList/展示" name="Horizontal"><span className="text-primary hover:underline font-medium cursor-pointer">Horizontal</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsDataTableRule — 原 VsDataTableRule */}
      <div>
      <Rule
        title="DescriptionList — 單一實體的屬性列表(key-value 配對)"
        note="每一行是同一個對象(使用者 / 訂單 / 商品)的不同屬性(姓名 / email / 時區)。讀取模式,不支援排序、篩選、多選"
      >
        <Frame className="max-w-md">
          <div className="text-body font-medium mb-2">使用者資料</div>
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
        <Frame className="max-w-xl">
          <table className="w-full text-body border-collapse">
            <thead>
              <tr className="text-fg-secondary text-left">
                <th className="pb-2 font-normal">姓名</th>
                <th className="pb-2 font-normal">Email</th>
                <th className="pb-2 font-normal">團隊</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-divider">
                <td className="py-2">Ada Chen</td>
                <td className="py-2">ada.chen@example.com</td>
                <td className="py-2">Design</td>
              </tr>
              <tr className="border-t border-divider">
                <td className="py-2">王小明</td>
                <td className="py-2">ming@example.com</td>
                <td className="py-2">Engineering</td>
              </tr>
            </tbody>
          </table>
        </Frame>
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
  name: 'Vertical vs Horizontal(cols)',
  render: () => (
    <div>
      <Rule
        title="cols=1(vertical stack)— 長清單、窄容器、mobile-friendly"
        note="label 在上、value 在下的垂直堆疊 → 適合 sidebar、NameCard、mobile detail view。Value 可以佔滿整行寬,長文字不壓迫"
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
        <Label warn>↑ 窄容器配 cols=2 → email 與職稱都被壓到斷行,可讀性差</Label>
      </Rule>
    </div>
  ),
}

export const LabelAlignmentRule: Story = {
  name: 'Label 對齊 — 一律左對齊(stacked)',
  render: () => (
    <div>
      <Rule
        title="本系統採 stacked(label 在上、value 在下)— label 左對齊"
        note="對齊 Atlassian / Shopify Polaris / Stripe 慣例——label 與 value 垂直堆疊,兩者都左對齊。閱讀節奏由上往下、由左往右,不需視線左右跳動。這是本系統固定結構,無 `horizontal align` 等 prop 可改"
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
        note="若試圖改 DescriptionList 為 label 左 / value 右對齊 → 破壞 HTML 語義(dt 和 dd 不再視覺上緊密配對),且在多欄配置下 grid 對齊會錯亂。有此需求 → 改用 Field 系統或自訂 layout"
      >
        <Frame className="max-w-md">
          <div className="flex justify-between py-1">
            <span className="text-body text-fg-secondary">姓名</span>
            <span className="text-body">Ada Chen</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-body text-fg-secondary">Email</span>
            <span className="text-body">ada.chen@example.com</span>
          </div>
        </Frame>
        <Label warn>
          ↑ 這是自訂 layout 模擬 key-right-value-left → 不是 DescriptionList,也無 dl/dt/dd 語義
        </Label>
      </Rule>
    </div>
  ),
}

export const NoInteractionRule: Story = {
  name: '唯讀 — 不放互動元件 / 不做表格',
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
        <div className="flex flex-col gap-3 max-w-md">
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input defaultValue="ada.chen@example.com" />
          </Field>
          <Field>
            <FieldLabel>職稱</FieldLabel>
            <Input defaultValue="Design Engineer" />
          </Field>
        </div>
        <Label>↑ 可編輯欄位 → Field 系統;唯讀屬性 → DescriptionList</Label>
      </Rule>

      <Rule
        title="❌ 在 value 放 Button / Input 等互動元件"
        note="DescriptionList 的語義是唯讀屬性展示。放 Button 會讓 screen reader 在 dd 內讀到 button → 使用者混淆(這是一個屬性還是一個動作?)。若要「讀取為主 + 偶爾編輯」,改用 Field 的 read-only mode 或 inline-edit pattern"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={1}>
            <DescriptionItem label="Email">
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

      <Rule
        title="❌ 把 DescriptionList 當表格(多 row 同結構)"
        note="重複的 label 是反模式 — 視覺上也會讀起來像清單而不是屬性。多筆同結構資料 → DataTable"
      >
        <Frame className="max-w-md">
          <DescriptionList cols={2}>
            <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
            <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
            <DescriptionItem label="姓名">王小明</DescriptionItem>
            <DescriptionItem label="Email">ming@example.com</DescriptionItem>
          </DescriptionList>
        </Frame>
        <Label warn>↑ 「姓名 / Email」重複 → 多筆同結構應用 DataTable</Label>
      </Rule>
    </div>
  ),
}
