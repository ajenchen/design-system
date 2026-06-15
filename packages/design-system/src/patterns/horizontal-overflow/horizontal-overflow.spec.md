---
pattern: horizontal-overflow
internal: true
scope: utility primitives module (use-overflow-items hooks: useScrollEdges + useOverflowIndices + fade-mask + scroll-arrow helper components) — DS-internal consumer only(Tabs / ChipGroup wrap)
---

<!-- @benchmark-unverified-blanket: 對齊 horizontal-overflow.tsx:5 的 file-level retraction(M22(d))——本檔 benchmark claim 均未逐條 URL cite,視為未驗證的視覺/用法陳述,除非後續 retrofit per-claim。 -->

# Horizontal Overflow 設計原則

**Layout Family**:non-family(utility primitives module,本身不渲染 layout — 由消費端 family 1/3 提供 outer geometry)。

**水平 overflow 的 canonical primitives + helper**——給任何「一排水平 items 可能塞不下容器」的元件(Tabs、ChipGroup、未來的 Steps horizontal、SegmentedControl overflow 等)共用。

這是底層工具 module,**不是 UI 元件**。消費者組裝自己的 outer wrapper(border、gap、背景等元件特有樣式),但 overflow affordance(scroll arrows、menu trigger、fade mask)全部從本 module 取用。

---

## 為什麼存在

### 歷史教訓

`ScrollArrow` 元件在 `Tabs/tabs.tsx` 和 `Chip/chip.tsx` **逐行 copy-paste**,`buildFadeMask` / `ARROW_BUTTON_WIDTH` / `SCROLL_PAGE_RATIO` 常數也是複製的。任何修改都要手動改兩處,是漂移溫床——實際上已經造成了一個 bug:

**Chip 的 menu trigger 曾漂移成可選 chip 的視覺語言,使用者無法區分「點擊 = 選中」與「點擊 = 打開選單」;同期 Tabs 正確用 text button 表達工具層——同一個 overflow affordance 在兩元件自相矛盾。**

### Canonical 規則

**所有 horizontal overflow 的 affordance 一律是 `<Button variant="text" size="sm" iconOnly>`。**

- 左右 scroll arrow → text button,ChevronLeft / ChevronRight
- Menu trigger → text button,ChevronDown
- **禁止**用 item 自身的視覺語言(chip 形狀、tab 底線等)來渲染 overflow trigger——overflow affordance 是「工具層」,不是「業務層」,不該跟內容爭視覺重量(「工具層必須是視覺重量最低的一層」— 本 spec codify 此原則,owner SSOT 在此)。

這條規則讓使用者看到向下 chevron 或向右 arrow 時,心智是一致的:「這是 overflow 的工具,不是可選內容」,不論這排 items 是什麼類型。

---

## 何時用 / 近親分界 / 常見誤解 / A11y

- **何時用**:任何「一排水平 items 可能塞不下容器」的 DS 元件要加 overflow affordance 時 import 本 module。scroll vs menu 模式的抉擇 SSOT 在 `tabs.spec.md`「Overflow 模式」表(none / scroll / menu 三策略 + 何時用),此處不重複
- **何時不用 / 近親分界**:設計上拒絕 overflow 的元件不消費——SegmentedControl / Steps(見「消費者清單 Non-consumers」,各自 spec 明文)
- **常見誤解**:「在新元件自刻 ScrollArrow / fade mask 比較快」——禁止(見「禁止事項」),copy-paste 漂移正是本 module 存在的歷史教訓
- **A11y**:arrow / trigger 內建 `aria-label`(arrow 預設繁中、trigger 必填)+ iconOnly Button 自動 tooltip(見「元件保證行為」);menu 開啟後的 a11y 由消費者的 DropdownMenu(Radix)承擔

---

## 提供的 primitive

### 常數

| 常數 | 值 | 用途 |
|---|---|---|
| `FADE_WIDTH` | 16px | Fade mask 的漸變寬度 |
| `ARROW_BUTTON_WIDTH` | 32px | Scroll arrow 預留的按鈕區寬度(對齊 `field-height-sm` lg density) |
| `SCROLL_PAGE_RATIO` | 0.8 | 點 scroll arrow 一次滑動 80% 容器寬度 |

### Helpers

- `buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth })`
  回傳 `linear-gradient` 字串。`reserveArrowWidth` > 0 時 fade 會延伸到 arrow button 底下(Material 3 scrim 原理);= 0 時直接從邊緣 fade。 <!-- @benchmark-unverified -->
- `useScrollByPage(scrollRef)` → `(direction: 'left' | 'right') => void`
  點一次滑動 `clientWidth × SCROLL_PAGE_RATIO`,含 `behavior: 'smooth'`。

### 元件

- `<OverflowScrollArrow direction onClick>`
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronLeft` / `ChevronRight`
  - aria-label 內建繁中(「向左捲動」/「向右捲動」)
  - **絕對定位**在容器 `left-0` / `right-0`,`pointer-events-none` 外層 + `pointer-events-auto` 內層(讓 mask 下方仍可滑動)
- `<OverflowMenuTriggerButton aria-label>` (forwardRef)
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronDown`
  - 必填 `aria-label`(直接傳給 Button 的 `aria-label`,無 `label` alias;由消費者決定,例如「頁籤選單(共 5 個)」)
  - `forwardRef` + `...props` spread 讓 Radix `DropdownMenuTrigger asChild` 可以接管

> **元件保證行為:auto-Tooltip**——`OverflowScrollArrow` 與 `OverflowMenuTriggerButton` 都是 `iconOnly` + string `aria-label` + 非 `asChild`,因此都會觸發 Button 內建的 auto-Tooltip wrap(`button.tsx` iconOnly auto-Tooltip wrap)。亦即 hover 時 arrow / trigger 會自動冒出對應 `aria-label` 的 tooltip(「向左捲動」/「向右捲動」/「頁籤選單(共 N 個)」),共享全域 `Tooltip` 的 delay 與 warm-up。`DropdownMenuTrigger asChild` 仍正常運作:Radix 的 `asChild` 由 Trigger 自身消費(套到 `OverflowMenuTriggerButton` 的 forwardRef),不會傳成 Button 的 `asChild` prop,所以 tooltip wrap 與 trigger 接管互不衝突。

### Hook re-export

為了消費者只 import 一處,本 module re-export `useScrollEdges` / `useOverflowIndices` from `hooks/use-overflow-items.ts`。

> **`useOverflowIndices` 目前 0 consumer(reserved primitive)**:DS 內 menu 模式(Tabs / Chip)走「show-all navigator」派(dropdown 永遠列全部 items,不需動態 overflow 計算),刻意不用此 hook(見 `tabs.tsx` / `chip.tsx` 註解)。本 hook 保留給未來真正需「collapse-overflow」的 consumer;其 a11y(roving tabindex)由 consumer 渲染決定,非 hook 保證(詳 `hooks/use-overflow-items.ts` jsDoc)。`useScrollEdges` 則由 Tabs / Chip scroll 模式實際消費。

---

## 消費者架構

本 module 提供的是**樂高**,不是**組裝好的玩具**。消費者需要自己把外層容器、Radix primitive(TabsPrimitive / ToggleGroupPrimitive)、fade mask、arrows、menu trigger、DropdownMenu 拼起來。

### 為什麼不做成封閉的 `<HorizontalOverflowContainer>`?

- Tabs 的 underline border owner 在 **list 內部**(`TABS_LIST_BASE` 套 `border-b border-divider`),outer 不畫;Chip 的 pill border(`rounded-full border border-border`)屬於**個別 chip item**(`chipVariants`,chip.tsx:50),overflow 容器 outer 本身是 chromeless 的 `relative`(scroll 模式,chip.tsx:170)/ `flex items-center gap-2`(menu 模式,chip.tsx:295)wrapper,既無 pill border 也不需 outer `border-b`——讓 fade mask + scroll arrow 在透明 outer 上運作。Owner 升 list 是 2026-05-19 fix:outer `border-b` + inner `overflow-x-auto` → browser y auto-promote(CSS overflow-3 spec:一軸 auto 時另軸 visible compute auto)→ active underline `after:bottom:-1px` 1px clip + 1px 垂直可捲 bug
- Tabs 用 `TabsPrimitive.List` 作為 inner list;Chip 用 `ToggleGroupPrimitive.Root`
- Tabs 用 `DropdownMenuItem + selected`(單選);Chip 用 `DropdownMenuCheckboxItem`(多選)
- Tabs 有 `gap-[var(--layout-space-loose)]`;Chip 有 `gap-2`

把這些差異塞進一個 container prop 只會讓 API 變成 bag of flags。**讓 consumer 組裝,但強制消費 canonical primitive**,是更乾淨的做法——跟 `item-layout` module 提供 `ItemPrefix` / `ItemLabel` / `ItemIcon` 但不做「ItemRow 容器」是同一個設計哲學。

### 典型 scroll 模式組裝

```tsx
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  ARROW_BUTTON_WIDTH,
  OverflowScrollArrow,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'

const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
const scrollByPage = useScrollByPage(scrollRef)
const maskImage = buildFadeMask({
  canScroll, atStart, atEnd,
  reserveArrowWidth: ARROW_BUTTON_WIDTH,
})

return (
  <div className="relative">    {/* outer 不畫 border;Tabs underline owner 在 list 內 */}
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <TabsPrimitive.List className={cn(TABS_LIST_BASE, 'w-fit')}>...</TabsPrimitive.List>
    </div>
    {!atStart && canScroll && <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />}
    {!atEnd && canScroll && <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />}
  </div>
)
```

> **Why `overflow-y-hidden`(2026-05-19 codify)**:CSS overflow-3 spec 強制「一軸 auto/scroll/hidden 時另軸 visible compute auto」。`overflow-x-auto` 單獨設 + active underline `after:bottom:-1px` 落在 box 外 → y auto-promote → 1px 垂直可捲 + underline 初始 1px clip bug。明示 `overflow-y-hidden` 阻 promote。對齊 Primer UnderlineNav `overflow-x:auto; overflow-y:hidden` 公開實作。

### 典型 menu 模式組裝

```tsx
import {
  useScrollEdges,
  buildFadeMask,
  OverflowMenuTriggerButton,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/design-system/components/DropdownMenu/dropdown-menu'

const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
const maskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 0 })

return (
  <div className="flex items-stretch">   {/* items-stretch 讓 menu button 容器跟 list 共底線 */}
    <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden ..." style={{ maskImage, WebkitMaskImage: maskImage }}>
      <TabsPrimitive.List className={cn(TABS_LIST_BASE, 'w-fit')}>...</TabsPrimitive.List>
    </div>
    {canScroll && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <OverflowMenuTriggerButton aria-label={`頁籤選單(共 ${items.length} 個)`} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* menu button container 自帶 border-b border-divider 對齊 list border */}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
)
```

---

## 邊界案例

- **內容塞得下(`canScroll=false`)**:`buildFadeMask` 回傳 `undefined`(無 mask),消費者依 `canScroll` 條件不渲染 arrows / menu trigger(Tabs / Chip 組裝範例皆如此)——items 為 0 或恰好全部塞進容器同理,overflow affordance 完全不出現
- **鍵盤操作**:arrow / trigger 都是標準 `<Button>`(Tab 聚焦、Enter / Space 觸發);menu 開啟後的 Escape / 方向鍵由消費者的 `DropdownMenu`(Radix)own,本 module 無自訂 keyboard handler

---

## 禁止事項

❌ **禁止** copy `ScrollArrow` 到其他元件。要在新元件加 overflow → import 本 module 的 `<OverflowScrollArrow>`。
❌ **禁止** 用 item 自身的視覺語言(chip shape、tab underline、segmented border 等)渲染 overflow trigger。trigger 永遠是 text button。
❌ **禁止** 重新定義 `FADE_WIDTH` / `ARROW_BUTTON_WIDTH` / `SCROLL_PAGE_RATIO`。有調整需求來改這裡一處,全系統同步。
❌ **禁止** 在元件內部另寫 `buildFadeMask`——用本 module 的版本。

---

## 消費者清單(跟 item-layout 同步維護)

- `components/Tabs/tabs.tsx` — `overflow="scroll" | "menu"`
- `components/Chip/chip.tsx` — `layout="scroll" | "menu"`

**Non-consumers**(2026-05-10 retire from「未來」清單 — prior prediction stale,spec 已明文不消費):
- ~~`components/Steps/steps.tsx`~~ — `steps.spec.md:342`「水平空間不夠塞 content 區,強塞會破壞 stepper 的掃視節奏」+ L353「步驟 ≤ 5、水平空間充足」→ 設計上不 overflow
- ~~`components/SegmentedControl/*`~~ — `segmented-control.spec.md`「規模限制與邊界案例」段「**不支援 overflow / scroll**——若選項可能超出容器寬度,代表選錯元件了」+「最多 5 個 item」→ 設計上拒絕 overflow

新消費者必須加到這個清單,並且**只從本 module import** overflow 相關的 primitive,不允許自己複製。

---

## 反向引用

- `hooks/use-overflow-items.ts` — 底層 scroll / overflow 計算 hooks(本 module re-export)
- `components/Button/button.tsx` — text variant 的 canonical 樣式
- `components/DropdownMenu/dropdown-menu.spec.md` — menu item 的 selection 指示器規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `chip.spec.md`
- `file-viewer.spec.md`
- `overflow-indicator.spec.md`
