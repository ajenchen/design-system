<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Horizontal Overflow 設計原則

**水平 overflow 的 canonical primitives + helper**——給任何「一排水平 items 可能塞不下容器」的元件(Tabs、ChipGroup、未來的 Steps horizontal、SegmentedControl overflow 等)共用。

這是底層工具 module,**不是 UI 元件**。消費者組裝自己的 outer wrapper(border、gap、背景等元件特有樣式),但 overflow affordance(scroll arrows、menu trigger、fade mask)全部從本 module 取用。

---

## 為什麼存在

### 歷史教訓

`ScrollArrow` 元件在 `Tabs/tabs.tsx` 和 `Chip/chip.tsx` **逐行 copy-paste**,`buildFadeMask` / `ARROW_BUTTON_WIDTH` / `SCROLL_PAGE_RATIO` 常數也是複製的。任何修改都要手動改兩處,是漂移溫床——實際上已經造成了一個 bug:

**Chip 的 menu trigger 曾用 chip variant 的視覺語言(與可選 chip 同形狀),讓 menu trigger 與可選 chip 在 mental model 上無法區分——使用者預期點擊是選中,實際是打開選單。同期 Tabs 的 menu trigger 用 text button 正確表達「這是 overflow 工具」,兩個元件 overflow affordance 自相矛盾。**

### Canonical 規則

**所有 horizontal overflow 的 affordance 一律是 `<Button variant="text" size="sm" iconOnly>`。**

- 左右 scroll arrow → text button,ChevronLeft / ChevronRight
- Menu trigger → text button,ChevronDown
- **禁止**用 item 自身的視覺語言(chip 形狀、tab 底線等)來渲染 overflow trigger——overflow affordance 是「工具層」,不是「業務層」,不該跟內容爭視覺重量(對齊 `CLAUDE.md` 的「工具層必須是視覺重量最低的一層」原則)。

這條規則讓使用者看到向下 chevron 或向右 arrow 時,心智是一致的:「這是 overflow 的工具,不是可選內容」,不論這排 items 是什麼類型。

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
  回傳 `linear-gradient` 字串。`reserveArrowWidth` > 0 時 fade 會延伸到 arrow button 底下(Material 3 scrim 原理);= 0 時直接從邊緣 fade。
- `useScrollByPage(scrollRef)` → `(direction: 'left' | 'right') => void`
  點一次滑動 `clientWidth × SCROLL_PAGE_RATIO`,含 `behavior: 'smooth'`。

### 元件

- `<OverflowScrollArrow direction onClick>`
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronLeft` / `ChevronRight`
  - aria-label 內建繁中(「向左捲動」/「向右捲動」)
  - **絕對定位**在容器 `left-0` / `right-0`,`pointer-events-none` 外層 + `pointer-events-auto` 內層(讓 mask 下方仍可滑動)
- `<OverflowMenuTriggerButton label>` (forwardRef)
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronDown`
  - 接收 `label` 當 `aria-label`(由消費者決定,例如「頁籤選單(共 5 個)」)
  - `forwardRef` + `...props` spread 讓 Radix `DropdownMenuTrigger asChild` 可以接管

### Hook re-export

為了消費者只 import 一處,本 module re-export `useScrollEdges` / `useOverflowIndices` from `hooks/use-overflow-items.ts`。

---

## 消費者架構

本 module 提供的是**樂高**,不是**組裝好的玩具**。消費者需要自己把外層容器、Radix primitive(TabsPrimitive / ToggleGroupPrimitive)、fade mask、arrows、menu trigger、DropdownMenu 拼起來。

### 為什麼不做成封閉的 `<HorizontalOverflowContainer>`?

- Tabs 的 outer 需要 `border-b border-border`(underline 語意);Chip 不需要
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
  <div className="relative border-b border-border">    {/* 消費者自訂 outer */}
    <div
      ref={scrollRef}
      className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <TabsPrimitive.List>...</TabsPrimitive.List>       {/* 消費者自己的 Radix list */}
    </div>
    {!atStart && canScroll && <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />}
    {!atEnd && canScroll && <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />}
  </div>
)
```

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
  <div className="flex items-center border-b border-border">   {/* 消費者自訂 outer */}
    <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto ..." style={{ maskImage, WebkitMaskImage: maskImage }}>
      <TabsPrimitive.List>...</TabsPrimitive.List>
    </div>
    {canScroll && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <OverflowMenuTriggerButton label={`頁籤選單(共 ${items.length} 個)`} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map(item => <DropdownMenuItem selected={...} onSelect={...}>...</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
)
```

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
- 未來:`components/Steps/steps.tsx`(horizontal 模式的 overflow)
- 未來:`components/SegmentedControl/*`(若出現 overflow 需求)

新消費者必須加到這個清單,並且**只從本 module import** overflow 相關的 primitive,不允許自己複製。

---

## 反向引用

- `hooks/use-overflow-items.ts` — 底層 scroll / overflow 計算 hooks(本 module re-export)
- `CLAUDE.md`「選擇 / 狀態視覺」規則 — 為什麼 overflow trigger 不該用 selection-like 視覺
- `components/Button/button.tsx` — text variant 的 canonical 樣式
- `components/DropdownMenu/dropdown-menu.spec.md` — menu item 的 selection 指示器規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-viewer.spec.md`
- `overflow-indicator.spec.md`
