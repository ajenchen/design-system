---
component: ScrollArea
family: self-contained
variants: {}
sizes: {}
benchmark:
  - Radix ScrollArea primitive: github.com/radix-ui/primitives/tree/main/packages/react/scroll-area
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# ScrollArea 設計原則

ScrollArea 是**跨 OS 視覺一致的自訂捲動容器**——用 overlay 捲軸取代原生 scrollbar,解決 macOS / Windows / Linux 之間的跑版落差。

**Layout Family**:非上述 family — self-contained primitive(純捲動容器,無 slot 結構)。

**實作基礎**:基於 Radix ScrollArea primitive(shadcn passthrough 結構)——由 Radix 處理 viewport / scrollbar / thumb 的 pointer 拖曳與 overflow-detection,本 DS 橋接 token(scrollbar 寬度、thumb bg、hover 反饋)與 a11y 行為(Viewport `tabIndex={0}` + DS focus ring;Radix 不處理 keyboard,亦不自動標 Viewport focusable)。

**世界級對照**:shadcn `ScrollArea` / Radix primitive 本身。Polaris / Carbon 未提供等效元件(預設相信 native scrollbar);我們採用 shadcn / Radix 派:為了跨 OS 視覺一致、避免 DataTable / Sheet / Dialog 遇 Windows always-visible scrollbar 吃寬度跑版。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 為什麼需要 ScrollArea

Native scrollbar 跨 OS 不一致:

| OS | 行為 |
|----|------|
| macOS | Overlay——不吃寬度,預設隱藏,捲動時浮出 |
| Windows / Linux | Always-visible——永遠吃 ~15–17px 寬度 |

**結果**:同一個 DataTable 橫向捲動、Sheet / Dialog 內容垂直捲動在 macOS 視覺對齊,在 Windows 右側被 scrollbar 吃 17px 跑版。「Left pinned + Row Actions」的 DataTable 截圖即是此類 bug。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

ScrollArea 用 Radix 自訂 overlay 捲軸 → **跨 OS 一致、不吃寬度、捲動時浮出(hover / scroll 自動顯示)**。

---

## 何時用

- **寬內容橫向捲動**——內容寬於容器的一般場景(寬表格類 demo、程式碼區塊等)。**例外:DataTable 中央捲動區不用 ScrollArea**——走 native `overflow-x-auto` + JS scrollLeft 同步(pinned column 結構需求,理由與 post-v1 重構計畫見 `data-table.spec.md`「捲軸 canonical」節;2026-06-12 收斂跨 spec 張力,以已實作且有 rationale 的 DataTable 側為準)
- **Sheet / Dialog body 垂直捲動**——內容可能超出容器高度
- **Sidebar nav 長列表**——導覽項目多於可見高度
- **任何「內容可能溢出容器」且「跨 OS 視覺必須一致」的 sub-region**

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 全頁捲動 | 瀏覽器 document scroll(native) | ScrollArea 是 sub-region 元件,document 層級保持 native 更符合 OS 慣例 |
| 單行 truncate | `text-overflow: ellipsis` | 不需要實際捲動,純截斷視覺處理 |
| 極短內容 | 不包任何 wrapper | 內容不會溢出 → ScrollArea 是視覺噪音 |
| 固定高度但內容永遠不溢出的容器 | 一般 `<div>` | ScrollArea 額外 overhead 無收益 |

## 近親元件分界

| vs | 差異軸 | 何時用 ScrollArea |
|---|---|---|
| **OverflowIndicator** | OverflowIndicator 是 horizontal 元素 list 的 hidden-count badge;ScrollArea 是 cross-OS scrollbar 視覺一致化 | 跨 OS 視覺一致 scrollbar(Windows 醜原生 vs macOS overlay)|
| **Document native scroll** | Native scroll 用 OS scrollbar;ScrollArea 用 Radix overlay scrollbar | sub-region container,非全頁 |
| **AspectRatio** | AspectRatio 鎖比例不 scroll;ScrollArea 允許溢出 scroll | 內容可能 overflow 容器需 scroll |

對齊 Radix ScrollArea / Polaris Scrollable / Material `<Box overflow="auto">` 共識:sub-region scroll,document 留 native。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## Orientation

- **`vertical`**(預設)——垂直捲動(長清單、Sheet body)
- **`horizontal`**——水平捲動(寬表格、Tag 溢出列)
- **同時垂直 + 水平**——大型 DataTable 雙向(wrapper `<ScrollArea>` 已內建一個 vertical `<ScrollBar>`,consumer 只需再渲染一個 `<ScrollBar orientation="horizontal">`)

## 視覺 token

| 元素 | Token | 值 |
|------|-------|----|
| Scrollbar 寬度 | 固定 10px(`w-2.5` / `h-2.5`) | 跨 size 不變——scrollbar 是功能性元件,不隨內容尺寸變化 |
| Thumb 邊緣 inset | 1px(實作細節見 `.tsx`) | thumb 與容器邊緣保留 1px 視覺 inset,不貼死邊界 |
| Track | 透明(無 bg) | overlay 浮層,不搶視覺 |
| Thumb bg | `--scrollbar-thumb` → hover `--scrollbar-thumb-hover`(semantic alias,resolves to `--border` / `--border-hover` = neutral-5/-6) | 靜態時低存在感,hover 加深反饋可抓握。2026-05-09 抽 SSOT alias 跟 DataTable fake scrollbar 共享 token,避免 thumb 視覺未來演化時誤動 Field/Input/Checkbox border |
| Thumb radius | `rounded-full` | 圓形 thumb 對齊 macOS / modern DS 慣例 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| 過渡 | `transition-colors` | 色彩變化平滑,不做尺寸動畫 |

**Scrollbar 寬度固定 10px 不隨 size 變**:不同 size 的元件(sm/md/lg Button、DataTable)都消費同一個 10px scrollbar;scrollbar 是「捲動機制」不是「內容尺寸」,不需要對齊 content 字級。

---

## 禁止事項

- ❌ **不用於全頁捲動**——document scroll 保持 native,ScrollArea 是 sub-region 工具。強行包整頁會遮掉瀏覽器 reader mode / native pull-to-refresh 等 OS 能力
- ❌ **不用於單行 truncate**——`text-overflow: ellipsis` 就夠,用 ScrollArea 等於讓使用者水平捲動看一行字,UX 扭曲
- ❌ **不巢狀 ScrollArea**——使用者捲動時分不清是哪個 scope 捲動(外層還是內層?),焦點管理混亂。需要巢狀結構時重新設計 layout(如拆成 Tabs / Accordion)
- ❌ **不在 Viewport 直接設 overflow**——Radix 已在 Viewport 內部處理 overflow 機制,手動設會破壞 primitive(scrollbar 偵測失效 / thumb 位置錯亂)
- ❌ **不用於極短內容**——內容不會溢出就不需要 wrapper,多包一層是視覺噪音 + DOM 浪費

---

## A11y 預設

Radix primitive + 本 DS a11y 橋接:

- **鍵盤捲動**:本 DS 在 Viewport 加 `tabIndex={0}` 使其可被鍵盤聚焦(Radix 不自動把 scroll container 標 focusable,Safari 尤其需要;此即 axe `scrollable-region-focusable` fix)。聚焦後 `ArrowUp/Down/Left/Right` / `PageUp/Down` / `Home/End` 捲動為瀏覽器原生行為,非 Radix 提供
- **Focus 可見**:聚焦的 Viewport 顯示 DS focus ring(`focus-visible:outline-ring`,inset 2px),非瀏覽器原生 focus ring
- **Scrollbar 非 tab stop**:scrollbar thumb 不搶焦點,使用鍵盤的使用者透過 viewport 捲動(Radix 內建)
- **Pointer 支援**:thumb 可拖曳,track 可 click-to-jump(Radix 內建)

本元件已內建 `tabIndex` + focus ring(滿足 axe `scrollable-region-focusable`)。但 Viewport 預設**無 `role` / accessible name**——**若 scroll 區域有具體語意(如「留言列表」「程式碼區塊」),consumer 應提供 `aria-label`**,否則 SR 只報「可捲動區域」無內容描述;純視覺裝飾容器可省略。(2026-05-31 #31:修正原「consumer 無需額外處理 a11y」過度宣稱)

---

## 邊界案例

- **Dark mode**:`--scrollbar-thumb` / `--scrollbar-thumb-hover`(resolves to `--border` / `--border-hover`)自動由 semantic token 切換,無自訂 palette,詳見 `color.spec.md`
- **Density**:scrollbar 寬度不受 density 影響(功能性 primitive,不隨 field-height / layout-space 放大縮小)
- **Disabled**:ScrollArea 無互動狀態——內容是否可操作由 consumer 決定,captured 容器本身不 disable
- **Empty**:內容為空時 scrollbar 不顯示(Radix 自動偵測 overflow,無溢出 → scrollbar 隱藏)

---

## 為何無 StateBehavior

ScrollArea 是**捲動容器 primitive**,本身**無互動狀態**(見「邊界案例」段:無 disabled,內容捲動由瀏覽器原生處理)。唯一的 state 是「scrollbar visible / hidden」,但這由 Radix 依 overflow 自動偵測,非 consumer 或元件 prop 可控。重寫 StateBehavior 會讓 consumer 誤以為有 hover / focus / disabled prop 可切。orientation(水平 / 垂直 / 雙向)的結構變化由元件特有 `OrientationBehavior` own。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix`(scrollbar track / thumb 色) + `SizeMatrix` + `Accessibility` + 元件特有 `OrientationBehavior`。

---

## 相關

- `../DataTable/data-table.spec.md` — 主要 consumer(橫向捲動跑版問題的解法來源)
- `../Sheet/sheet.spec.md` — body 捲動
- `../Dialog/dialog.spec.md` — body 捲動
- `../Sidebar/sidebar.spec.md` — nav 長列表捲動
- `../Separator/separator.spec.md` — 分隔線規則(ScrollArea 與 Separator 分屬不同 primitive)
- Radix ScrollArea — `@radix-ui/react-scroll-area`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `dialog.spec.md`
- `file-viewer.spec.md`
- `overlay-surface.spec.md`
