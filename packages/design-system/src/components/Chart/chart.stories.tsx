// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import {
  Area,
  AreaChart,
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
import { Desc, H3 } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Chart/展示',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '資料視覺化元件。基於 shadcn chart 結構 + Recharts v3 engine,tooltip / legend / grid / axis 全改用本 DS token。',
      },
    },
  },
}
export default meta
type Story = StoryObj

// ── Sample data ──────────────────────────────────────────────────────────────

// 月營收(對標 Stripe dashboard)— Bar chart
const revenueData = [
  { month: '7 月', revenue: 128400 },
  { month: '8 月', revenue: 154200 },
  { month: '9 月', revenue: 142800 },
  { month: '10 月', revenue: 186300 },
  { month: '11 月', revenue: 203500 },
  { month: '12 月', revenue: 248900 },
]

const revenueConfig = {
  revenue: { label: '月營收', color: 'var(--chart-1)' },
} satisfies ChartConfig

// 伺服器回應時間 7 天趨勢(對標 Datadog dashboard)— Line chart
const responseTimeData = [
  { day: '週一', p50: 142, p95: 310 },
  { day: '週二', p50: 156, p95: 284 },
  { day: '週三', p50: 138, p95: 352 },
  { day: '週四', p50: 164, p95: 298 },
  { day: '週五', p50: 178, p95: 412 },
  { day: '週六', p50: 124, p95: 246 },
  { day: '週日', p50: 118, p95: 218 },
]

const responseTimeConfig = {
  p50: { label: 'p50 (中位數)', color: 'var(--chart-1)' },
  p95: { label: 'p95', color: 'var(--chart-5)' },
} satisfies ChartConfig

// 流量來源(對標 Google Analytics)— Donut chart
const trafficSourceData = [
  { source: 'organic', visitors: 4820, fill: 'var(--color-organic)' },
  { source: 'direct', visitors: 2340, fill: 'var(--color-direct)' },
  { source: 'social', visitors: 1280, fill: 'var(--color-social)' },
  { source: 'referral', visitors: 642, fill: 'var(--color-referral)' },
]

const trafficSourceConfig = {
  organic: { label: '自然搜尋', color: 'var(--chart-1)' },
  direct: { label: '直接輸入', color: 'var(--chart-2)' },
  social: { label: '社群媒體', color: 'var(--chart-3)' },
  referral: { label: '外部引薦', color: 'var(--chart-4)' },
} satisfies ChartConfig

// 部門支出堆疊(對標 Notion workspace analytics)— Stacked area chart
const departmentExpenseData = [
  { month: '1 月', engineering: 42, marketing: 18, operations: 12 },
  { month: '2 月', engineering: 45, marketing: 22, operations: 14 },
  { month: '3 月', engineering: 48, marketing: 26, operations: 13 },
  { month: '4 月', engineering: 52, marketing: 24, operations: 16 },
  { month: '5 月', engineering: 56, marketing: 30, operations: 15 },
  { month: '6 月', engineering: 58, marketing: 34, operations: 17 },
]

const departmentExpenseConfig = {
  engineering: { label: '工程', color: 'var(--chart-1)' },
  marketing: { label: '行銷', color: 'var(--chart-2)' },
  operations: { label: '營運', color: 'var(--chart-3)' },
} satisfies ChartConfig

// ── Stories ──────────────────────────────────────────────────────────────────

export const BarChartRevenue: Story = {
  name: '長條 Chart — 月營收',
  render: () => (
    <div>
      <H3>六個月營收對比(Stripe dashboard 風格)</H3>
      <Desc>
        類別對比情境:每個月份是獨立的類別,以柱高呈現數值差異。單一數列不需要 legend,
        tooltip 的 `indicator="dashed"` 搭配單色表示單一系列。
      </Desc>
      <div className="max-w-2xl">
        <ChartContainer config={revenueConfig}>
          <BarChart accessibilityLayer data={revenueData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent indicator="dashed" />
              }
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  ),
}

export const LineChartResponseTime: Story = {
  name: '折線 Chart — 伺服器回應時間',
  render: () => (
    <div>
      <H3>7 天 p50 / p95 回應時間趨勢(Datadog 風格)</H3>
      <Desc>
        時間序列趨勢情境:關注變化方向而非個別數值。雙系列(中位數 + p95 長尾),
        indicator="line" 讓 tooltip 指示器呼應 line 視覺。
      </Desc>
      <div className="max-w-2xl">
        <ChartContainer config={responseTimeConfig}>
          <LineChart accessibilityLayer data={responseTimeData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}ms`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent indicator="line" />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="p50"
              type="monotone"
              stroke="var(--color-p50)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="p95"
              type="monotone"
              stroke="var(--color-p95)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  ),
}

export const DonutChartTrafficSource: Story = {
  name: '環圈 Chart — 流量來源分布',
  render: () => (
    <div>
      <H3>流量來源組成(Google Analytics 風格)</H3>
      <Desc>
        比例呈現情境:強調整體中各部分的佔比。Donut(innerRadius {'>'} 0)比純 Pie 更易讀,
        中心空白可放合計數字。4 類別使用 --chart-1..4,未超過 5 類上限。
      </Desc>
      <div className="max-w-sm">
        <ChartContainer config={trafficSourceConfig}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="source" />} />
            <Pie
              data={trafficSourceData}
              dataKey="visitors"
              nameKey="source"
              innerRadius={50}
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent nameKey="source" />} />
          </PieChart>
        </ChartContainer>
      </div>
    </div>
  ),
}

export const StackedAreaChartExpenses: Story = {
  name: '堆疊 面積 — 部門支出',
  render: () => (
    <div>
      <H3>半年各部門支出堆疊(Notion workspace analytics 風格,單位:萬元)</H3>
      <Desc>
        累積 + 分組情境:stacked area 同時呈現「總額趨勢」與「各部門佔比」。
        3 個系列使用 --chart-1..3,按視覺重量由深到淺排列。
      </Desc>
      <div className="max-w-2xl">
        <ChartContainer config={departmentExpenseConfig}>
          <AreaChart accessibilityLayer data={departmentExpenseData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="engineering"
              type="monotone"
              stackId="a"
              stroke="var(--color-engineering)"
              fill="var(--color-engineering)"
              fillOpacity={0.6}
            />
            <Area
              dataKey="marketing"
              type="monotone"
              stackId="a"
              stroke="var(--color-marketing)"
              fill="var(--color-marketing)"
              fillOpacity={0.6}
            />
            <Area
              dataKey="operations"
              type="monotone"
              stackId="a"
              stroke="var(--color-operations)"
              fill="var(--color-operations)"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  ),
}
