---
component: Carousel
family: null
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Carousel 設計原則

## 定位

Carousel 用於在**有限空間內輪播同類視覺內容**——單次只顯示一張 slide，使用者透過箭頭 / 指示點切換至同類的其他視覺（圖片、產品照、使用者評語卡）。

基於 `embla-carousel-react` v8 engine + shadcn Carousel 的 API 結構（`CarouselContent` / `CarouselItem` / `CarouselPrevious` / `CarouselNext`），並依本 DS 的視覺慣例擴充 `CarouselDots`。

**Layout Family**:非上述 family — composite / multi-section(輪播容器 + content + 箭頭浮層 + dots,自 own layout)。

---

## 世界級對照

- **shadcn Carousel**(主要參考):API 結構與 Embla engine 選擇對齊
- **Ant Design Carousel**:dots indicator 在底部中央的慣例來源
- **Material / Polaris**:無獨立 Carousel 元件——Material 建議用 image list / hero module;Polaris 明確不支援 auto-playing carousel(a11y 疑慮)
- **Swiper**:獨立 library,功能遠超 DS 需求(3D effects / virtualization / zoom 等);本 DS 刻意**不選 Swiper**,因為 Embla 更輕量、tree-shakable,且本 DS 的 carousel 用途單純(hero banner / product image / testimonial),Swiper 的 feature 90% 不會用到,屬過度工程

---

## 何時用

- **Hero banner**:首頁 3–5 張大圖輪播(Airbnb city destinations、Netflix 精選)
- **Product image gallery**:單一商品 3–6 張不同角度 / 情境照(Stripe product page、Shopify)
- **Testimonial / review cards**:3–5 張 customer quote 卡片(Linear / Stripe 官網首頁)
- **Onboarding walkthrough**:3–5 步驟的 illustration 介紹(一次看一張,按順序推進)

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 互斥切換**命名視圖**(「總覽 / 成員 / 設定」) | `Tabs` | Tabs 的每個 view 是獨立資料與結構;Carousel 的每張是同類視覺的多張 |
| 水平**列表捲動**(聊天室表情、卡片 chip) | `ScrollArea` / 自訂橫向滾動 | Carousel 是 snap-to 一次一張;列表是自由捲動,使用者可停在任意位置 |
| **Gallery 總覽**(超過 7 張圖) | Grid(`grid grid-cols-*`)| Carousel 使用者找不到特定項;Grid 一眼看全,可直接點 |
| **資料表格** / 可排序列表 | `DataTable` | 表格需要 columns / sorting / filtering,carousel 無此 affordance |
| 兩個切換項 | `SegmentedControl` / `Switch` | 兩項輪播沒意義,直接二選一更清楚 |

---

## 與 Tabs 的分界(SSOT)

Tabs 和 Carousel 都能「按順序切換下方內容」,但**語意與視覺契約完全不同**。

### 1. 內容的本質

- **Tabs**:每個 tab 是**獨立命名的視圖**。「總覽 / 成員 / 設定」三塊內容結構不同(可能有自己的 header、toolbar、table);每個 tab 都有**語意名稱**
- **Carousel**:每張 slide 是**同類視覺的多張**。首頁 hero 的 3 張 city banner、商品頁的 4 張產品照、testimonial 的 5 張客戶評語——每張都是同類內容,**無需命名**

### 2. 切換的控制方式

- **Tabs**:使用者**依名稱直接跳**——點「設定」直接去設定,不經過「成員」
- **Carousel**:使用者**按順序推進**——看完第 1 張才到第 2 張,dots 雖可跳但仍是「第 2 張 / 第 3 張」的概念,非命名跳轉

### 3. 視覺階層

- **Tabs**:是 **section header 等級的 navigation anchor**,佔據容器頂部一整行,底部 border 延伸
- **Carousel**:是 **content presentation 容器**,箭頭 hover-only、dots 疊在圖片上,不佔 layout 空間

### Fallback 判斷

- 每個項目**有獨立標題且內容結構不同** → **Tabs**
- 每個項目**是同類視覺的多張** → **Carousel**
- 一眼要看到所有項目 → 都不是,用 **Grid**

### 灰色地帶

| 情境 | 選擇 | 理由 |
|------|------|------|
| 首頁 3 張「熱門商品 / 熱門文章 / 熱門活動」切換 | **Tabs** | 三塊內容結構不同,每塊都有命名 |
| 首頁 3 張「春季新品」大圖輪播 | **Carousel** | 同類視覺(都是春季新品圖),無需命名 |
| 商品頁 4 張「外觀 / 細節 / 包裝 / 使用情境」 | **Carousel** | 都是同一商品的不同照片,屬同類視覺 |
| Dashboard「本週 / 本月 / 本季」KPI 圖表 | `SegmentedControl` | 切的是 chart 維度,不是視覺輪播 |

---

## 結構

```
<Carousel orientation="horizontal">
  <CarouselContent>              ← overflow-hidden + flex container
    <CarouselItem />             ← 單張 slide(basis-full,可改為 basis-1/3 多張並排)
    <CarouselItem />
    ...
  </CarouselContent>
  <CarouselPrevious />           ← 左箭頭(hover-only, focus-visible 時強制顯示)
  <CarouselNext />               ← 右箭頭
  <CarouselDots />               ← 底部中央 dots(scrollSnaps > 1 才渲染)
</Carousel>
```

---

## Arrow 行為

### hover-only 顯示(本 DS 視覺慣例)

預設 arrow **opacity-0**,父容器 `group-hover/carousel:opacity-100` 才浮現。

- **為什麼不永遠可見**:carousel 內容(大圖 / 產品照)是主視覺,常駐箭頭會干擾閱讀;Airbnb / Instagram / Netflix hero 皆採 hover-only
- **a11y 例外**:`focus-visible:opacity-100`——鍵盤 focus 時強制顯示,滿足**焦點可見原則**。鍵盤使用者不 hover,若仍 opacity-0 將無法得知元素位置
- **邊界**:`canScrollPrev/Next === false` 時 `disabled + opacity-0 + pointer-events-none`——到邊界直接消失,不顯示 disabled 狀態,避免視覺噪音

### 箭頭覆蓋範圍(canonical)

箭頭屬 **hover-only overlay**,可以**蓋在圖片 / media / 深色背景 canvas** 上(對齊 Airbnb / Instagram / Netflix hero carousel 的做法)。但**不得壓在文字資訊上面**—— title / description / testimonial / caption 等**文字內容** 是主訊息,被 overlay 遮蓋會破壞閱讀。

**判斷法**:
- ✅ 箭頭疊在 image / video / gradient background / solid card bg —— OK(背景可辨識箭頭無資訊損失)
- ❌ 箭頭疊在 title text / body paragraph / testimonial quote / product description —— 違反(user 看不完文字 + 被遮)

**修法(若發生)**:(a) 把文字區域避開箭頭位置(左右內縮 `px-12` 以上);或 (b) 改把箭頭移到 carousel **外側**(stacked controls,對齊 Ant Carousel dotPosition=outside 思路)。world-class 對照:Notion Slider / Stripe testimonial section 皆用「箭頭外移 + 內容 center」當文字較長時。

### 視覺規格

- **基於 DS Button**:`<Button variant="tertiary" size="md" iconOnly />`——完全對齊 DS 規則,不自訂視覺
- **形狀 documented 例外**:override `rounded-md` → **`rounded-full`**(圓形)。理由:media carousel 視覺取向,圓形箭頭減少方塊感、不壓迫媒體內容(對齊 **Instagram / Airbnb / Notion Gallery / Apple Photos / Google Photos lightbox 世界級慣例** — 媒體 overlay 控制器圓形)。本 DS 內 Button default 是 `rounded-md`,這裡是唯一文明 override,需維護記錄在 `.claude/references/cva-patterns.md` documented 例外清單。**不傳染**:其他元件的 Button 仍走 rounded-md
- 尺寸:`size="md"` 對應 `--field-height-md`(default 32px / loose 36px),iconOnly 正方形;形狀 `rounded-md`(**不破例走 rounded-full**,DS 內沒有 rounded-full Button,Carousel 不例外)
- 為什麼 tertiary:`bg-surface` + `border-border`,hover 僅改 text/border 為 `primary-hover`——無 bg-hover tint,視覺最輕,不搶 media 權重;secondary 有 neutral 邊框+hover 較重,primary 有底色更搶焦點,均不合適
- 背景 / 邊框 / hover / focus-visible:全部繼承 Button tertiary variant 的 token,不自訂
- 圖標:`startIcon={ChevronLeft}` / `startIcon={ChevronRight}`,尺寸由 Button 內部程式化決定
- **絕對定位 wrapper**:Button 外層 `<div>` 負責 `absolute` 定位 + hover-only opacity(`group-hover/carousel:opacity-100` / `focus-within:opacity-100`);Button 本身不做任何定位或可見性邏輯(職責分離)

---

## Dots indicator

### 何時渲染

`scrollSnaps.length > 1` 才顯示——只有一張時無需 dots,自動 `return null`。

### 位置與互動

- 底部中央:`absolute bottom-3 left-1/2 -translate-x-1/2`
- 間距:`gap-1.5`(6px)
- 點擊:`scrollTo(i)` 直接跳該張
- 鍵盤:每個 dot 是 `<button>`,`Tab` 可進入

### 視覺規格(photo overlay convention)

Carousel 常疊在圖片上,沿用 Instagram / Airbnb / Ant Carousel 的「白點於照片上」慣例——inactive 白點半透明、hover 不透明度提升、active **加寬**(非變色)。

**為什麼 active 加寬而非變色**:寬度變化比顏色變化更易辨識,對色弱使用者友善;Ant Design / Swiper 皆採此法。

**限制**:此 dots 視覺適用於「疊在深色 / 圖片內容上」,若 carousel 放在白底 section 內,consumer 可 override `className` 改用 `bg-foreground` 系列。

完整尺寸 / 不透明度 / class 對照見 anatomy `ColorMatrix`(Dots 三態)+ `SizeMatrix`。

---

## Orientation

| Mode | 用途 |
|------|------|
| `horizontal` ★default | 99% 場景(hero banner / product image / testimonial) |
| `vertical` | 少見,用於長內容垂直輪播(影片 feed、垂直故事卡) |

`vertical` 時 `CarouselPrevious` / `CarouselNext` 自動旋轉 90° 並改為 `top-3` / `bottom-3`。

---

## 項目數量限制

**建議 ≤ 7 項**。超過 7 張:

- 使用者**失去目標感**——不記得想看的那張在第幾張、要按幾次才到
- dots 排列過密、點擊區過小、失去 indicator 功能
- **改用 Grid**(一眼看全)或 **Gallery with thumbnails**(縮圖列表 + 大圖預覽)

世界級 SaaS 的 hero carousel 幾乎都 ≤ 5 張(Airbnb 4–5 / Netflix 3 / Stripe 3)。

---

## A11y

- 根容器 `role="region" aria-roledescription="carousel"`
- 每個 `CarouselItem` `role="group" aria-roledescription="slide"`
- Arrow `aria-label="上一張"` / `"下一張"`
- Dots 容器 `role="tablist"`,每個 dot `role="tab" aria-selected={...} aria-label="跳至第 N 張"`
- 鍵盤:`ArrowLeft` / `ArrowRight` 切換(`onKeyDownCapture`);dots 可 `Tab` focus

### 不加 auto-play(重要)

本 DS **不支援**自動輪播(無 `autoplay` plugin 預設啟用)。理由:

- 違反 **WCAG 2.2.2 Pause, Stop, Hide**——超過 5 秒自動變動的內容必須可暫停
- 使用者常常需要時間閱讀 testimonial 文字、看清產品細節,自動跳過打斷閱讀
- Polaris / Material 皆建議「不使用 auto-playing carousel」

若專案真的需要 auto-play,consumer 可傳 `plugins={[Autoplay({ stopOnInteraction: true })]}` 自行引入 embla-carousel-autoplay,但必須同時提供暫停按鈕(spec 不預設處理)。

---

## 視覺規則

- **Arrow**:浮層卡片視覺(surface-raised bg + border + elevation-200 shadow),hover-only 顯示,疊於照片 / media 上仍清晰可見——與 Popover / DropdownMenu trigger 慣例一致
- **Dots**:photo overlay convention(白點於照片上),active 加寬不變色(對色弱友善)
- **Focus ring**:鍵盤 focus 走 ring token,滿足 a11y 焦點可見原則

完整 state × token / class 對照見 anatomy(`ColorMatrix` Arrow + Dots 兩組 + `SizeMatrix`)。

---

## 禁止事項

- ❌ **不用於互斥切換命名視圖**(「總覽 / 成員 / 設定」)——改用 Tabs
- ❌ **不用於水平列表捲動**——改用 ScrollArea
- ❌ **不用於資料表格**——改用 DataTable
- ❌ **不用於 gallery 總覽**(超過 7 張)——改用 Grid 或 thumbnail + preview pattern
- ❌ **Arrow 永遠可見**——違反 hover-only 慣例,干擾主視覺
- ❌ **自動播放不提供暫停**——違反 WCAG 2.2.2
- ❌ **Dot 用顏色區分 active / inactive 而不變寬度**——色弱使用者無法辨識
- ❌ **單一項目仍渲染 dots**——只有一張時自動不渲染(spec 已內建,consumer 不必手動判斷)

---

## 邊界狀態

- **單一 item**:dots 自動不渲染(`scrollSnaps.length > 1` gate)+ 箭頭因 `canScrollPrev/Next === false` 自動隱藏 → 純顯示單一 slide,consumer 不必手動判斷
- **零 items**:consumer 應在 items 為空時不 render Carousel(改用 `<Empty>`),本元件不自帶 empty state UI
- **Autoplay 單 item**:autoplay 在 single item 時無作用(`canScrollNext=false`)— embla-carousel 自動處理,consumer 不用加特判
- **Dark mode**:由 semantic token(arrow bg `--surface-raised` / border `--border`)自動切換,詳見 `../../tokens/color/color.spec.md`

---

## 相關

- **Tabs**(`../Tabs/tabs.spec.md`)——互斥命名視圖的正確選擇(與 Carousel 的分界見本 spec 上方)
- **ScrollArea** / 自訂橫向滾動——自由捲動的列表場景(非 snap-to 輪播)
- **DataTable**(`../DataTable/data-table.spec.md`)——資料表格場景
- **HoverCard**(`../HoverCard/hover-card.spec.md`)——另一個 hover-only 顯示的 pattern 參考
- **Empty**(`../Empty/empty.spec.md`)——零 items 的 placeholder

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `aspect-ratio.spec.md`
