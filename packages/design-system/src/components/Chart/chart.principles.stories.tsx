// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from './chart'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Chart/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

// ── Sample data (reused across rules) ────────────────────────────────────────

// Bar = 類別對比(各國銷量)
const countrySalesData = [
  { country: '美國', sales: 1240 },
  { country: '日本', sales: 892 },
  { country: '德國', sales: 684 },
  { country: '英國', sales: 512 },
  { country: '法國', sales: 428 },
]
const countrySalesConfig = {
  sales: { label: '銷量', color: 'var(--chart-1)' },
} satisfies ChartConfig

// Line = 趨勢(7 天活躍使用者)
const weeklyActiveData = [
  { day: '一', users: 3420 },
  { day: '二', users: 3680 },
  { day: '三', users: 3540 },
  { day: '四', users: 3920 },
  { day: '五', users: 4180 },
  { day: '六', users: 4520 },
  { day: '日', users: 4840 },
]
const weeklyActiveConfig = {
  users: { label: 'DAU', color: 'var(--chart-1)' },
} satisfies ChartConfig

// Pie = 比例(OS 分布)
const osShareData = [
  { os: 'ios', share: 52, fill: 'var(--color-ios)' },
  { os: 'android', share: 38, fill: 'var(--color-android)' },
  { os: 'other', share: 10, fill: 'var(--color-other)' },
]
const osShareConfig = {
  ios: { label: 'iOS', color: 'var(--chart-1)' },
  android: { label: 'Android', color: 'var(--chart-2)' },
  other: { label: '其他', color: 'var(--chart-3)' },
} satisfies ChartConfig

// 超過 5 類(違規示範)
const tooManyCategoriesData = [
  { team: 'eng', count: 42, fill: 'var(--color-eng)' },
  { team: 'design', count: 18, fill: 'var(--color-design)' },
  { team: 'pm', count: 12, fill: 'var(--color-pm)' },
  { team: 'sales', count: 28, fill: 'var(--color-sales)' },
  { team: 'marketing', count: 22, fill: 'var(--color-marketing)' },
  { team: 'support', count: 16, fill: 'var(--color-support)' },
  { team: 'hr', count: 8, fill: 'var(--color-hr)' },
]
const tooManyCategoriesConfig = {
  eng: { label: '工程', color: 'var(--chart-1)' },
  design: { label: '設計', color: 'var(--chart-2)' },
  pm: { label: 'PM', color: 'var(--chart-3)' },
  sales: { label: '業務', color: 'var(--chart-4)' },
  marketing: { label: '行銷', color: 'var(--chart-5)' },
  // 第 6、7 類只能 reuse 既有 --chart-* → 視覺衝突
  support: { label: '客服', color: 'var(--chart-1)' },
  hr: { label: 'HR', color: 'var(--chart-2)' },
} satisfies ChartConfig

// 正確:grouping「其他」
const groupedCategoriesData = [
  { team: 'eng', count: 42, fill: 'var(--color-eng)' },
  { team: 'sales', count: 28, fill: 'var(--color-sales)' },
  { team: 'marketing', count: 22, fill: 'var(--color-marketing)' },
  { team: 'design', count: 18, fill: 'var(--color-design)' },
  { team: 'other', count: 36, fill: 'var(--color-other)' },
]
const groupedCategoriesConfig = {
  eng: { label: '工程', color: 'var(--chart-1)' },
  sales: { label: '業務', color: 'var(--chart-2)' },
  marketing: { label: '行銷', color: 'var(--chart-3)' },
  design: { label: '設計', color: 'var(--chart-4)' },
  other: { label: '其他(PM / 客服 / HR)', color: 'var(--chart-5)' },
} satisfies ChartConfig

// Stories ─────────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Chart ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>資料量夠多、要看出趨勢 / 比較 / 比例 / 分布時:月營收趨勢(折線)、各部門預算比較(長條)、流量來源組成(環圈)、部門支出累積(堆疊面積)。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Chart/展示" name="長條 Chart — 月營收">長條 Chart — 月營收</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Chart/展示" name="折線 Chart — 伺服器回應時間">折線 Chart — 伺服器回應時間</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Chart/展示" name="環圈 Chart — 流量來源分布">環圈 Chart — 流量來源分布</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Chart/展示" name="堆疊 面積 — 部門支出">堆疊 面積 — 部門支出</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>單一大數字(今日營收 $12,345)→ 純文字或 KPI 區塊:單一數值不需要視覺化</li>
          <li>2–3 個小數字對照 → DescriptionList 或表格:數字本身就夠清楚,圖反而多餘</li>
          <li>要逐筆查看、排序、篩選的清單 → DataTable:圖看不到細節</li>
          <li>即時系統狀態(上線 / 離線)→ Badge 或 CircularProgress:那是狀態,不是數據</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>DataTable</strong> —— 逐列掃讀、排序、篩選;Chart 看整體的趨勢、分布、比例</li>
          <li><strong>ProgressBar / CircularProgress</strong> —— 單一數值 0–100%;Chart 是跨時間或跨類別的多個數值</li>
          <li><strong>DescriptionList</strong> —— 少量、分散的「標籤 + 數值」;資料點 5 個以上、要看出規律才用 Chart</li>
          <li><strong>Badge / Tag</strong> —— 單一數值或狀態的指示;Chart 是多個資料點</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ImplementationRule: Story = {
  name: '實作準則',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="❌ 硬寫色值:<Bar fill='#3b82f6' />"
        note="繞過 ChartConfig + --chart-* token 系統,dark mode 切換時不跟著反轉,brand 色改動時也無法一次更新。"
      >
        <ExampleCaption warn>
          ❌ &lt;Bar fill="#3b82f6" /&gt; &nbsp;&nbsp; ✅ &lt;Bar fill="var(--color-{'{key}'})" /&gt; (搭配 ChartConfig)
        </ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 自訂 Tooltip / Legend 視覺"
        note="一律用 ChartTooltipContent / ChartLegendContent,確保跨圖表視覺一致。需要微調格式化(數字千分位、單位)時用 formatter prop,不要自己寫一份 tooltip 元件。"
      >
        {/* 2026-10-20 T12:原本 ❌ / ✅ 兩段程式碼擠在同一則紅色說明裡(✅ 那段也是紅字),程式碼是一般文字、樣板字串的反引號原樣顯示;拆成兩則、程式碼放進 <code> */}
        <ExampleCaption warn>❌ <code>{'content={(props) => <div className="bg-white shadow-xl">…</div>}'}</code></ExampleCaption>
        <ExampleCaption>✅ <code>{'content={<ChartTooltipContent formatter={(v) => `$${v}`} />}'}</code></ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 在 chart 裡放 Button / Input 等互動元件"
        note="Chart 是 passive 視覺化層,互動(篩選、時間範圍切換)屬於 chart 外的 toolbar — 用 action-bar pattern + SegmentedControl / Select / DatePicker 建構。Chart 內部只有 tooltip / legend 這類 hover 級的 passive 互動。"
      >
        <ExampleCaption warn>
          ❌ 在 BarChart 裡疊加 &lt;Button&gt;篩選&lt;/Button&gt; &nbsp;&nbsp;
          ✅ Chart 上方用 action-bar pattern 放置控制項
        </ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 使用 shadcn 預設的 HSL chart token"
        note="shadcn 預設的 --chart-1..5 用的是另一套色彩演算法,本 DS 改用與其他元件一致的色彩系統(blue-6 / purple-6 / green-6 / yellow-7 / deep-orange-6)。若沿用 shadcn 預設值會與本 DS 其他色彩不同調。"
      >
        <ExampleCaption warn>
          本 DS 的 --chart-1..5 定義在 tokens/color/semantic.css,不要覆寫為 shadcn 範例程式碼內的 HSL 值。
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const ChartTypeRule: Story = {
  name: '何時用哪種 Chart',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Bar — 類別之間的數值對比"
        note="橫軸是離散類別(國家 / 產品 / 部門),縱軸是數值。觀看者想知道「誰最多、誰最少、差距多大」。Stripe / Linear 的『各地區銷量』『各類型 issue 數』都是這個場景。"
      >
        <ExampleGroup className="w-full max-w-xl">
          <ChartContainer config={countrySalesConfig}>
            <BarChart accessibilityLayer data={countrySalesData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="country" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
            </BarChart>
          </ChartContainer>
          <ExampleCaption>各國銷量對比 — 觀看者一眼看出「美國最高、法國最低」</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="Line — 時間序列的趨勢變化"
        note="橫軸是時間(日 / 週 / 月),觀看者關心「方向」(上升 / 下降 / 震盪)而非個別點的數值。Datadog 的 latency、GitHub 的 contribution graph、Stripe 的 MRR 趨勢都是 Line 場景。"
      >
        <ExampleGroup className="w-full max-w-xl">
          <ChartContainer config={weeklyActiveConfig}>
            <LineChart accessibilityLayer data={weeklyActiveData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Line
                dataKey="users"
                type="monotone"
                stroke="var(--color-users)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
          <ExampleCaption>一週日活躍使用者 — 觀看者看到「週末上升」的趨勢</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="Pie / Donut — 整體的組成比例"
        note="呈現『誰佔了整體的多少 %』,最多 5 類(類別配色上限,見「最多 5 類別」)。超過先合併「其他」;仍不夠改用 Bar(類別對比時比例已暗含在柱高裡)。Google Analytics 的流量來源、App Store 的 OS 分布。"
      >
        <ExampleGroup className="w-full max-w-sm">
          <ChartContainer config={osShareConfig}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="os" />} />
              <Pie
                data={osShareData}
                dataKey="share"
                nameKey="os"
                innerRadius={40}
                strokeWidth={2}
              />
              <ChartLegend content={<ChartLegendContent nameKey="os" />} />
            </PieChart>
          </ChartContainer>
          <ExampleCaption>使用者裝置 OS 分布 — 3 類,適合 Pie</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 錯誤:時間序列用 Pie"
        note="Pie 無法表達「隨時間變化」;想同時看趨勢 + 組成 → Stacked Area / Stacked Bar。"
      >
        <ExampleCaption warn>「過去 12 個月每月營收用 Pie」→ 看不到成長曲線,改用 Line 或 Bar</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const CategoryTokenRule: Story = {
  name: 'ChartConfig + 類別色 設計變數',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="類別色固定用 --chart-1..5,不用會隨品牌色變動的色彩變數"
        note="ChartConfig 把每個資料系列對應到一個 --chart-* 色彩變數,ChartContainer 自動轉成 --color-{系列名},Recharts 直接用 fill='var(--color-...)'。用這組固定色(而不是會跟著品牌主色變動的色彩變數)的原因:未來品牌主色改色時,圖表的類別色彩意義不會跟著漂移 — 『Desktop 永遠是 chart-1 藍色』跟品牌色是否改成綠色無關。"
      >
        <ExampleGroup className="w-full max-w-xl">
          <ChartContainer config={countrySalesConfig}>
            <BarChart accessibilityLayer data={countrySalesData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="country" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
              <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
            </BarChart>
          </ChartContainer>
          <ExampleCaption>
            ChartConfig:{'{ sales: { label: "銷量", color: "var(--chart-1)" } }'} →
            Recharts Bar 用 fill="var(--color-sales)"
          </ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const FiveCategoryLimitRule: Story = {
  name: '最多 5 類別',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="原則:不超過 5 類別(Miller's law 的 data viz 應用)"
        note="人類短期記憶容量約為 5-7 項;當分類超過 5 個,觀看者需要頻繁掃 legend 對照色彩,認知負擔陡增。本 DS 只定義 --chart-1..5 五色,強制此上限。"
      />

      <TutorialRule
        title="❌ 錯誤 — 7 類別,第 6、7 類只能 reuse 顏色導致視覺衝突"
        note="同色被分配給不同類別後,legend 與圖形不再能建立一對一辨識;觀看者必須反覆比對標籤,因此超過五類時應先合併低占比項目或拆圖。"
      >
        <ExampleGroup className="w-full max-w-sm">
          <ChartContainer config={tooManyCategoriesConfig}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="team" />} />
              <Pie
                data={tooManyCategoriesData}
                dataKey="count"
                nameKey="team"
                innerRadius={40}
                strokeWidth={2}
              />
              <ChartLegend content={<ChartLegendContent nameKey="team" />} />
            </PieChart>
          </ChartContainer>
          <ExampleCaption warn>「客服」與「工程」同色 / 「HR」與「設計」同色 → 無法分辨</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="✅ 正確 — 小類別合併為「其他」,保留 Top 4 + 其他 = 5"
        note="排名靠後的類別聚合為「其他」;若使用者需要細分,用 drill-down(點擊「其他」展開)或切換 Bar chart(縱向排列容納更多類別)。"
      >
        <ExampleGroup className="w-full max-w-sm">
          <ChartContainer config={groupedCategoriesConfig}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="team" />} />
              <Pie
                data={groupedCategoriesData}
                dataKey="count"
                nameKey="team"
                innerRadius={40}
                strokeWidth={2}
              />
              <ChartLegend content={<ChartLegendContent nameKey="team" />} />
            </PieChart>
          </ChartContainer>
          <ExampleCaption>Top 4 部門 + 其他(PM / 客服 / HR)= 5 類,每類可辨</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const A11yRule: Story = {
  name: '顏色不是區分類別的唯一手段',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="原則:顏色不是區分類別的唯一手段"
        note="約 8% 男性有色覺缺陷(紅綠色盲最常見),黑白列印時所有 --chart-* 變成灰階更難分辨。必須配合 label(legend + 軸標籤)、圖形變化(strokeDasharray 虛線 / 不同 shape)、直接文字標註(value label on bar)等方式,讓去色後仍能辨識。"
      >
        <ExampleGroup className="w-full max-w-xl">
          <ChartContainer config={{
            ios: { label: 'iOS', color: 'var(--chart-1)' },
            android: { label: 'Android', color: 'var(--chart-2)' },
          } satisfies ChartConfig}>
            <LineChart
              accessibilityLayer
              data={[
                { month: '1 月', ios: 42, android: 38 },
                { month: '2 月', ios: 45, android: 40 },
                { month: '3 月', ios: 48, android: 44 },
                { month: '4 月', ios: 52, android: 46 },
                { month: '5 月', ios: 55, android: 50 },
                { month: '6 月', ios: 58, android: 54 },
              ]}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="ios"
                type="monotone"
                stroke="var(--color-ios)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="android"
                type="monotone"
                stroke="var(--color-android)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
          <ExampleCaption>
            iOS 實線、Android 虛線(strokeDasharray="4 4")— 色盲 / 黑白列印仍可分辨
          </ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="Recharts accessibilityLayer prop"
        note="長條、折線、面積圖加上 accessibilityLayer,啟用鍵盤焦點與讀屏器朗讀。圓餅 / 環圈圖經 Recharts 預設一樣啟用 accessibilityLayer(可聚焦),但方向鍵導覽建立在軸刻度數值索引上,無數值軸的圓餅圖無法逐片導覽。"
      >
        <ExampleCaption>
          &lt;BarChart accessibilityLayer ...&gt; — 方向鍵可瀏覽資料點,讀屏器讀出當前值
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
