// @principles-rationale: Merged WhenToUse + WhenNotToUse + TabsVsSegmentedControl
// into a single `UsageGuidance` story (3 sections — 何時用 / 何時不用 + 替代 / vs 近親)
// per 2026-04-26 user mandate. SizeSelection + TriggerSlots kept as separate principles.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'
import { Users, Settings, Bell } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta = {
  title: 'Design System/Components/Tabs/設計原則',
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
    <div className="flex flex-col gap-4">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance ────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 Tabs 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/Tabs/展示" name="帶後綴"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">帶後綴</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Tabs/展示" name="溢出處理 — 水平捲動"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">溢出處理 — 水平捲動</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Tabs/展示" name="溢出處理 — ⌄ 導覽選單"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">溢出處理 — ⌄ 導覽選單</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 單一 tab 的 Tabs"
          note="只有一個 trigger 沒有切換語意——應該直接顯示內容,不需要 tabs"
        >
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">唯一選項</TabsTrigger>
            </TabsList>
          </Tabs>
          <Label warn>↑ 這個 Tabs 沒有意義,直接顯示內容</Label>
        </Rule>

        <Rule
          title="❌ 等分 / fullWidth 的 Tabs"
          note="Tabs label 長度天然不均(「總覽」2 字 vs「成員管理與權限設定」8 字),強制等分會視覺失衡。需要等分選項改用 SegmentedControl"
        >
          <div className="w-full">
            <SegmentedControl defaultValue="day" fullWidth>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
            <Label>↑ 需要等分?改用 SegmentedControl</Label>
          </div>
        </Rule>

        <Rule
          title="❌ 用 Tabs 做頁面層級路由切換"
          note="Tabs 是「同一上下文底下切換 view」,不是頁面導覽。路由層級切換應該用 navigation / breadcrumb,URL 要跟著變"
        >
          <Tabs defaultValue="home">
            <TabsList>
              <TabsTrigger value="home">首頁</TabsTrigger>
              <TabsTrigger value="products">產品列表</TabsTrigger>
              <TabsTrigger value="about">關於我們</TabsTrigger>
            </TabsList>
          </Tabs>
          <Label warn>↑ 這些是獨立頁面,不該用 Tabs</Label>
        </Rule>
      </Section>

      <Section title="vs 近親 — Tabs vs SegmentedControl">
        <Rule
          title="規模:一整塊 container vs 局部變體"
          note="Tabs 切換的是一整塊 container(可能有自己的 header / toolbar / 多個 section),每個 view 是獨立的子頁規模。SegmentedControl 切換的是局部內容的變體——單一 chart 的維度、單一 list 的排序、單一 form section 的條件欄位。兩者都能『切換下方內容』,但前者是結構、後者是 control"
        >
          <div>
            <Label>✅ Tabs:電商後台,每個 view 是獨立子頁(各自有 filters / table / actions)</Label>
            <Tabs defaultValue="orders">
              <TabsList>
                {/* 2026-07-04:同組 startIcon 全有或全無(spec 禁止事項)— 原 顧客/設定 混用 icon 已移除 */}
                <TabsTrigger value="orders">訂單</TabsTrigger>
                <TabsTrigger value="customers">顧客</TabsTrigger>
                <TabsTrigger value="products">產品</TabsTrigger>
                <TabsTrigger value="settings">設定</TabsTrigger>
              </TabsList>
              <TabsContent value="orders" className="text-body text-fg-muted">1,284 筆訂單 · 篩選「待出貨」· 批次列印出貨單</TabsContent>
              <TabsContent value="customers" className="text-body text-fg-muted">顧客名單、分群標籤與生命週期價值</TabsContent>
              <TabsContent value="products" className="text-body text-fg-muted">商品目錄、庫存與上下架狀態</TabsContent>
              <TabsContent value="settings" className="text-body text-fg-muted">商店設定：金流、物流、稅率</TabsContent>
            </Tabs>
          </div>
          <div>
            <Label>✅ SegmentedControl:Dashboard chart 的時間維度切換(局部變體,不是結構)</Label>
            <SegmentedControl defaultValue="week">
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
              <SegmentedControlItem value="quarter">季</SegmentedControlItem>
            </SegmentedControl>
            <Label>↑ 切換會讓下方 chart 重新載入,但切的是 chart 的一個維度,不是整個 container</Label>
          </div>
        </Rule>

        <Rule
          title="視覺角色:container 結構 vs compact control"
          note="Tabs 佔整行、與父容器 header border 對齊,是 section 的 anchor。SegmentedControl 是 pill 尺寸,能跟 Button / Input 並排而不違和。判斷 fallback:放進 toolbar 或 Field 感覺自然 → SegmentedControl;必須自己獨佔一行 → Tabs"
        >
          <div>
            <Label>✅ SegmentedControl 在 toolbar 裡跟 Button / Input 並排</Label>
            <div className="flex items-center gap-3 p-2 border border-border rounded-md w-fit">
              <SegmentedControl defaultValue="list" size="sm">
                <SegmentedControlItem value="list">清單</SegmentedControlItem>
                <SegmentedControlItem value="board">看板</SegmentedControlItem>
              </SegmentedControl>
              <div className="h-5 w-px bg-divider" />
              <span className="text-body text-fg-muted">工具列其他控制項…</span>
            </div>
            <Label>↑ 同 toolbar 尺度,跟其他 control 並排。換成 Tabs 在這個位置會違和</Label>
          </div>
        </Rule>

        <Rule
          title="❌ 不能用 Tabs 做 form field"
          note="付款方式 / 配送方式這類「選一個、下方欄位跟著變」的 form section 看起來像 Tabs(切換內容),但它是表單內的一個 field(值會送出、跟其他 form field 同行文化),應該用 SegmentedControl。Tabs 不能塞進 Field、也不參與表單狀態"
        >
          <div>
            <Label>✅ 付款方式(SegmentedControl + 下方條件欄位)</Label>
            <div className="flex flex-col gap-2 w-[400px]">
              <span className="text-caption text-fg-muted">付款方式</span>
              <SegmentedControl defaultValue="card">
                <SegmentedControlItem value="card">信用卡</SegmentedControlItem>
                <SegmentedControlItem value="bank">銀行轉帳</SegmentedControlItem>
                <SegmentedControlItem value="cash">貨到付款</SegmentedControlItem>
              </SegmentedControl>
              <div className="mt-2 text-caption text-fg-muted">(下方依選擇顯示卡號 / 銀行帳號 / 收件資訊欄位)</div>
            </div>
          </div>
        </Rule>
      </Section>
    </div>
  ),
}

// ── Size ─────────────────────────────────────────────────────────────────────

export const SizeSelection: Story = {
  name: '尺寸選擇',
  render: () => (
    <div>
      <Rule
        title="sm — ★ 預設,overlay / chrome / dense toolbar"
        note="h-tab-sm(32/40)。所有 header 內 tabs 預設用 sm(對齊 Ant Design verbatim「small size could be used in Modal」)"
      >
        <Tabs defaultValue="a">
          <TabsList size="sm">
            <TabsTrigger value="a">一般</TabsTrigger>
            <TabsTrigger value="b">進階</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-body text-fg-secondary mt-2">名稱、描述與可見範圍等一般設定</TabsContent>
        </Tabs>
      </Rule>

      <Rule
        title="md — future tier(目前無 recommended use case)"
        note="h-tab-md(40/48)。中間階梯保留 token,新 consumer 必先諮詢 DS owner(多家世界級 DS 只有 1 個 default size,無中間階梯)"
      >
        <Tabs defaultValue="a">
          <TabsList size="md">
            {/* 2026-07-04:同組 icon 全有或全無(spec 禁止事項)— 原 成員 單獨帶 icon 已移除 */}
            <TabsTrigger value="a">總覽</TabsTrigger>
            <TabsTrigger value="b">成員</TabsTrigger>
            <TabsTrigger value="c" badge={<Badge count={3} />}>通知</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-body text-fg-secondary mt-2">專案的總覽資訊（KPI、最近活動）</TabsContent>
        </Tabs>
      </Rule>

      <Rule
        title="lg — 獨立 tabs 取代 chrome header(罕見 page-level hero)"
        note="h-tab-lg(48/56)= --chrome-header-height 像素相等。整個頁面的主結構切換,tabs 本身取代 chrome header 位置(對齊 Ant verbatim「Large size tabs are usually used in page header」)"
      >
        <Tabs defaultValue="a">
          <TabsList size="lg">
            <TabsTrigger value="a">產品</TabsTrigger>
            <TabsTrigger value="b">服務</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-body text-fg-secondary mt-2">產品功能、方案與定價總覽</TabsContent>
        </Tabs>
      </Rule>
    </div>
  ),
}

// ── Trigger 結構 ──────────────────────────────────────────────────────────────

export const TriggerSlots: Story = {
  name: '觸發位置插槽使用',
  render: () => (
    <div>
      <Rule
        title="startIcon 描述 tab 的內容性質"
        note="使用名詞性 icon(人像配「成員」、齒輪配「設定」、鈴鐺配「通知」)。不放動詞性 icon(Download、Trash2),tab 是視圖切換不是動作觸發。同一組 tabs 內 startIcon 全有或全無、不混用(spec 禁止事項),下方三個 trigger 皆帶 icon 即為「全有」的 uniform 示範"
      >
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a" startIcon={Users}>成員</TabsTrigger>
            <TabsTrigger value="b" startIcon={Settings}>設定</TabsTrigger>
            <TabsTrigger value="c" startIcon={Bell}>通知</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-body text-fg-secondary mt-2">成員名單與角色權限管理</TabsContent>
        </Tabs>
      </Rule>

      <Rule
        title="badge 傳達該 view 底下的待處理計數"
        note="「通知 3」「成員 12」。未選中時也應顯示 badge——否則使用者不知道該切過去"
      >
        <Tabs defaultValue="inbox">
          <TabsList>
            <TabsTrigger value="inbox">收件匣</TabsTrigger>
            <TabsTrigger value="unread" badge={<Badge count={12} />}>未讀</TabsTrigger>
            <TabsTrigger value="starred" badge={<Badge count={3} />}>星標</TabsTrigger>
          </TabsList>
          <TabsContent value="inbox" className="text-body text-fg-secondary mt-2">收件匣的所有訊息（依時間排序）</TabsContent>
        </Tabs>
      </Rule>
    </div>
  ),
}
