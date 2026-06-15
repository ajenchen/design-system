---
component: Chart
family: composite
variants: {}
sizes: {}
traits:
  - isStructural
benchmark:
  - Recharts: github.com/recharts/recharts
  - MUI X Charts: github.com/mui/mui-x/tree/master/packages/x-charts
  - Ant Design Charts: github.com/ant-design/ant-design-charts
---

# Chart 設計原則

## 定位

Chart 是**資料視覺化**元件——把數列(時間、類別、比例)畫成折線 / 柱狀 / 圓餅 / 雷達等圖形。不是裝飾視覺效果。

**實作基礎**：shadcn chart 結構 + Recharts v3 engine。本 DS 保留 shadcn 的 API 形狀(`ChartContainer` / `ChartTooltipContent` / `ChartLegendContent` / `ChartConfig`),但把 tooltip、legend、grid、axis 的視覺全改用本 DS token。

**Layout Family**：非上述 family — composite / multi-section（canvas + tooltip + legend 多區塊組合，自 own layout）。

**高度決定**:`ChartContainer` **預設 `aspect-video`(16:9)**——dashboard card / analytics 面板世界級慣例(Stripe / Vercel Analytics / Datadog)。Recharts ResponsiveContainer 需 parent 有高度,不給 fallback 會坍塌。

**覆寫為其他 ratio**:consumer 包 `AspectRatio` primitive,其 `padding-bottom` 高度會蓋過 ChartContainer 的 aspect-video:

```tsx
{/* 2:1 寬 stat tile */}
<AspectRatio ratio={2}>
  <ChartContainer config={config}>...</ChartContainer>
</AspectRatio>

{/* 3:1 hero banner chart */}
<AspectRatio ratio={3}>
  <ChartContainer config={config}>...</ChartContainer>
</AspectRatio>
```

理由:不強制 consumer 寫 AspectRatio(80% 情境 16/9 剛好),但留覆寫門路給特殊 ratio 場景。與 AspectRatio primitive 保持 ownership 清晰:chart = 資料視覺化,ratio = layout primitive 職責。

---

## 何時用

- **趨勢**：時間序列數據（月營收、使用者增長、系統錯誤率變化）→ Line / Area chart
- **比較**：類別間數值對比（各部門預算、產品銷量、地區表現）→ Bar chart
- **比例**：整體的組成比例（流量來源、訂閱方案分布）→ Pie / Donut chart
- **多維**：多變量比較（產品特性雷達、員工技能圖）→ Radar chart
- **分布**：數據分散情況（交易金額分布、回應時間）→ Histogram / Scatter

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單一大數字 KPI（今日營收 $12,345）| `Badge` / 純文字 | 單值不需要視覺化 |
| 2-3 個小數字對照 | `DescriptionList` / table | 數字本身就夠清晰,chart 反而多餘 |
| 列表式資料 | `DataTable` | 可排序篩選,chart 看不細節 |
| 即時系統狀態指示(online/offline) | `Badge` / `CircularProgress` | 狀態非數據 |

## 近親元件分界

| vs | 差異軸 | 何時用 Chart |
|---|---|---|
| **DataTable** | DataTable 是 row-level scanning + sort/filter;Chart 是 aggregate pattern recognition | 看趨勢 / 分布 / 比例,非個別 row |
| **ProgressBar / CircularProgress** | Progress 是單值 0–100%;Chart 是 multi-series / 多時點 | 跨時間或跨類別比較 |
| **DescriptionList** | DL 是離散 label-value;Chart 是 visual encoding(position / length / angle) | 數據量 ≥ 5 點且需 pattern |
| **Badge / Tag** | Badge 是單值 indicator;Chart 是 data viz | 多點數據 |

對齊 Polaris Charts / Material X-Charts / Ant Statistic / Recharts 共識:chart 為 multi-point visual encoding,單值用 Badge / KPI block。

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「chart 可當裝飾背景 / 氛圍圖」 | Chart 是資料視覺化,不是裝飾視覺效果(見「定位」) |
| 「單一 KPI 數字也畫成 chart」 | 單值用 Badge / 純文字(見「何時不用」) |
| 「要看個別 row 細節也用 chart」 | row-level scanning 用 DataTable(見「近親元件分界」) |
| 「類別超過 5 個就加 `--chart-6`」 | 5 色是上限——改 grouping 或切換視覺化類型(見「類別配色規則」) |

---

## ChartConfig — 類別配色規則

每個 dataKey 透過 `ChartConfig` 對應 label + color：

```tsx
const config = {
  desktop: { label: 'Desktop', color: 'var(--chart-1)' },
  mobile:  { label: 'Mobile',  color: 'var(--chart-2)' },
} satisfies ChartConfig
```

`ChartContainer` 自動把每個 key 注入 scoped CSS variable `--color-{key}`,Recharts 直接消費 `fill="var(--color-desktop)"` 即可。

### 類別色 token（本 DS 5 色）

| Token | Light mode | Dark mode | 建議 |
|-------|-----------|-----------|------|
| `--chart-1` | `blue-6` | `blue-5` | 第一類別（主要） |
| `--chart-2` | `purple-6` | `purple-5` | 第二類別 |
| `--chart-3` | `green-6` | `green-5` | 第三類別 |
| `--chart-4` | `yellow-7` | `yellow-5` | 第四類別（yellow-7 在 light mode 提升對 white bg 的對比） |
| `--chart-5` | `deep-orange-6` | `deep-orange-5` | 第五類別 |

**為什麼固定到 primitive 而非 semantic token**：避免未來 brand swap（primary 改色）時 chart-1 跟著漂移——data viz 的色彩意義是「類別」,不應被品牌色變動污染。

**超過 5 類別時**：不應再加 `--chart-6+`,改用 grouping（「其他」分類）或切換 visualization（pie → bar / stacked）。5 色是人類短期記憶上限，超過即難區分。

---

## 視覺 token

| 區塊 | Token |
|------|-------|
| Chart canvas 內文字 | `text-caption` |
| Tooltip bg | `bg-surface-raised` |
| Tooltip border | `border-border` |
| Tooltip shadow | `shadow-[var(--elevation-200)]` |
| Tooltip label（上方） | `font-medium` |
| Tooltip 值文字 | `text-foreground`（數字以 mono + tabular-nums 等寬對齊，utility 細節見 `chart.tsx` tooltip） |
| Tooltip 類別文字 | `text-fg-secondary` |
| Legend 文字 | `text-fg-secondary` |
| Cartesian grid line | `stroke-divider` |
| Axis tick | `text-fg-muted`（填 `fill-fg-muted`） |
| Dot fill | 依 series color |

---

## 邊界案例

- **空資料 / 空 series**:`ChartContainer` 照常渲染(`aspect-video` 高度保留,不坍塌);無內建 empty state——「無資料」提示由 consumer 外層處理(見 `Empty` 元件)
- **Loading(資料抓取中)**:本 wrapper 無內建 loading state——與空資料同模式,由 consumer 外層處理
- **Tooltip / Legend 無 payload**:不渲染(return null),不留空殼
- **ChartConfig 項目缺 `color` / `theme`**:不注入該 key 的 `--color-{key}` variable(`ChartStyle` 過濾)
- **單一資料點 / 大資料量 / RTL**:由 Recharts engine 處理,本 wrapper 無額外行為;大資料量的取樣 / 聚合屬 consumer 職責

---

## 禁止事項

- ❌ **不硬寫色值**：`<Bar fill="#3b82f6" />` 違規,改用 `fill="var(--color-{key})"` 搭配 ChartConfig
- ❌ **不用 shadcn chart color token**（`--chart-1`..`--chart-5` 我們有自己的定義,shadcn 預設走 HSL 會與我們 oklch palette 漂移）
- ❌ **不自訂 Tooltip / Legend 視覺**（一律用 `ChartTooltipContent` / `ChartLegendContent`,確保跨圖表視覺一致）
- ❌ **不超過 5 類別**（見上節;改用 grouping 或切視覺化類型）
- ❌ **不在 chart 裡放互動元件**（Button / Input）——chart 是 passive 視覺化層,互動走 toolbar / filter（action-bar pattern）

---

## 為何無 SizeMatrix / StateBehavior(Inspector 改 chart-type playground）

Chart 是 **composite data-visualization** 元件,不是單一互動 primitive:

- **有 Inspector(chart-type + 視覺選項 playground)**:chart 的「決定性 props」是資料(`data`)與配色(`ChartConfig`),不是單一 variant/size 切換,所以 Inspector 不是 variant 切換器,而是 chart 類型 playground——右側 Controls 即時切 `type`(bar / line / area / pie)、`showLegend`、`showGrid`、`tooltipIndicator`(dot / line / dashed),觀察同一份 `ChartConfig` 在不同圖表類型下的色彩與指示器應用,取代 SizeMatrix / StateBehavior。
- **無 SizeMatrix**:chart 無 sm/md/lg size prop,高度由 `aspect-video`(預設)或 consumer 包 `AspectRatio` 覆寫決定(見本 spec「定位」段)。尺寸屬 container 職責,不是 chart 的變體維度。
- **無 StateBehavior**:chart 是 passive 視覺化層,本身無 hover / focus / active / selected / disabled 互動狀態——資料點 hover 由 Recharts tooltip 處理(色彩規則已在 `ColorMatrix` 覆蓋),非 chart 元件層級的 state。

對應 anatomy story:`Overview`(多種 chart 類型實例)+ `Inspector`(chart-type playground)+ `CategoryTokens`(元件特有 5 色 categorical token)+ `ColorMatrix`(tooltip/legend/grid 視覺 token)+ `Accessibility`(無障礙)。

---

## A11y 預設

- **顏色非唯一語義**：不只靠色彩區分類別,配合 icon / label / pattern（Recharts 的 `strokeDasharray` 等）讓色盲 / 黑白列印仍可辨識
- **Tooltip 鍵盤可存取**：Recharts v3 的 `accessibilityLayer`(本 DS 所有 chart 範例皆已啟用)內建鍵盤導覽——圖表 SVG 自動取得 `tabIndex=0` + `role="application"`,使用者用方向鍵 ←/→ 沿軸刻度逐一瀏覽資料點,讀屏器朗讀當前資料點;無需 controlled `activeIndex` 手動接線
- **對比度**：`--chart-*` 在 light/dark 的 step 選擇已考量對 canvas bg 的對比（light=step-6 / dark=step-5）

---

## 相關

- `../../tokens/color/color.spec.md` — `--chart-1..5` semantic token 定義
- Recharts v3 官方文件 — `https://recharts.org`
- shadcn chart 原始參考 — `https://ui.shadcn.com/docs/components/chart`
