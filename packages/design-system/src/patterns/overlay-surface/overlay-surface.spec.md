---
pattern: overlay-surface
internal: true
scope: overlay shell sub-components (SurfaceHeader / SurfaceBody / SurfaceFooter + padding SSOT) — DS-internal consumer only(Dialog / Sheet / Popover / HoverCard / Coachmark wrap)
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Overlay Surface 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> Dialog / Sheet / Popover / Coachmark / HoverCard 等 overlay 元件 structure 跨 pattern SSOT。定義 SurfaceHeader / SurfaceBody / SurfaceFooter sub-components + v5 `data-unbounded` slot trick + padding-based header canonical + dismiss size canonical。多 overlay 元件消費,scope 本質 > 單一 pattern。

## 定位

Dialog 和 Popover 的**結構化 sub-components 共用 primitive**——提供 Header / Body / Footer 的統一 padding + 分隔線語言。本 pattern 是 **SSOT**,Dialog 與 Popover 不自寫 padding token。

**Layout Family**:非上述 family — structural container primitive(不是 element-level layout,是 surface-level 分區)。

**Consumers**:`Dialog` / `Popover`。未來任何其他「elevation-200 浮層」(如 Drawer / Sheet)的結構化 sub-components 都應消費本 primitive。

---

## 規則

### SurfaceHeader
- `border-b border-divider`(上下分隔）
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- `flex items-center gap-2 shrink-0`(不被 flex-grow 壓縮)

### SurfaceBody
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- **無額外 flex 屬性**——consumer 依浮層類型決定:
  - **Popover**:多數 bare consume,padding 即是總 padding
  - **Dialog / Sheet**:consumer **不直接 wrap SurfaceBody**——走 ScrollArea canonical(下節),padding 搬到 ScrollArea viewport 內層 div

---

## Body overflow canonical(Dialog / Sheet 必用 ScrollArea)

**規則**:Dialog / Sheet 的 body 會 viewport-fill + 長內容需捲動時,**必須用 `<ScrollArea>` wrap**,禁止自寫 `overflow-y-auto` / `overflow-auto`。

**Rationale**:
- Native scrollbar 跨 OS 不一致(macOS overlay / Windows 永遠吃 ~17px 寬度)——Dialog / Sheet 內容會因 OS 不同跑版
- ScrollArea(Radix primitive)用自建 overlay 捲軸 → **跨 OS 一致不吃寬度**,捲動時浮現
- SSOT 見 `components/ScrollArea/scroll-area.spec.md`「何時用」已列明「Sheet / Dialog body 太長」

**實作模板**:
```tsx
// DialogBody / SheetBody 內部:
<ScrollArea className="flex-1 min-h-0">
  <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)] pb-[var(--layout-space-bottom)]">
    {children}
  </div>
</ScrollArea>
```

- `flex-1 min-h-0` → 撐滿 Content 剩餘高度(min-h-0 防止 flex child 撐破 container)
- Padding 搬進 ScrollArea viewport 內的 inner div(因 ScrollArea Root 自己是 `overflow-hidden`,padding 應在捲動內容上)
- `pb-bottom` 保留 Dialog / Sheet「大容器底部多一拍」的 canonical

**Popover 例外**:Popover 無 viewport-fill、內容預期短,PopoverBody 直接消費 SurfaceBody bare;若未來有長內容 Popover consumer,同樣應 wrap ScrollArea。

**Coachmark 例外**:Coachmark 內容短(media + 2 行 title/description),不設計 body 捲動;不適用本規則。

---

## List-as-region in overlay body(2026-05-01 canonical,取代 v4 flush API)

當 overlay body(Dialog / Sheet / Popover)**內容是一個 unbounded list**(contact picker / settings menu / command palette / nav)時 — body 不該有 chrome padding,讓 list 自管視覺節奏。

### 為什麼**不**做成 body variant(`flush`)

2026-05-01 移除 `<DialogBody flush>` / `<SheetBody flush>` / `<PopoverBody flush>` variant。原因:

1. **Variant 不解決底層脆弱**:flush 只省一行 chrome padding override;consumer 仍要管 list outer `py-2` + item `px-loose rounded-md` — 加 1 row search/banner 就破功(body 反而沒 chrome padding,更難排版)。
2. **世界級主流不做 universal flush**:Material M3 / Atlassian Dialog / Mantine Modal / shadcn Dialog 都讓 consumer 用 className override 處理。Polaris 有 flush API 但 scope 極窄(只 ResourceList in Modal)。Mainstream 把這個 case 歸 consumer 自管。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
3. **Single API surface**:body 一律 chrome padded,list-only 場景用 `className="!px-0 !pt-0 !pb-0"` override + 自管 list outer wrapper — surface 概念清楚,不雙路徑。

### Canonical pattern

```tsx
<DialogBody className="!px-0 !pt-0 !pb-0">    {/* body 撤 chrome padding */}
  <div className="py-2">                       {/* list outer wrapper:menu group 8px breathing */}
    {items.map(item => (
      <MenuItem key={item.id} className="px-[var(--layout-space-loose)]">{item.label}</MenuItem>
      // 或 hand-craft Family 2 row(prefix+content)時:
      // <div className="flex items-center gap-3 py-2 px-[var(--layout-space-loose)] rounded-md hover:bg-neutral-hover">
    ))}
  </div>
</DialogBody>
```

**3 條 invariant**(unique 解):
1. **Hover bg 貼邊 chrome**:item `px-loose` 讓 hover bg 鋪滿 chrome 內邊(Linear / Cmd+K idiom)
2. **Content 對齊 header title**:item content 左 = chrome `px-loose` 起點 = header title 左 X 軸對齊
3. **Content 在 hover bg 內有 breathing**:item `px-loose rounded-md` → content 離 bg 邊緣 loose 距離

幾何:
```
chrome 邊 ─ hover bg 左邊 ─────── [ loose breathing ] ─────── content 左邊
  (x=0)     (x=0, flush chrome)                           (x=loose, 對齊 header)
```

### 世界級對照(Linear-family canonical;≥5 家) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

| DS | Body padding | Item padding | Hover bg flush chrome? |
|----|---|---|---|
| Linear Cmd+K | 0 | loose | ✓ |
| Notion page list | 0 | loose | ✓ |
| Slack channel list | 0 | loose | ✓ |
| Raycast / Spotlight | 0 | loose | ✓ |
| VS Code Quick Pick | 0 | loose | ✓ |
| Material M3 / Polaris Modal+List | px only | item inset | ✗(另一合法家族,鬆散版)|

本 DS 選 Linear-family。

### When list 上方有 search / banner(multi-row)

list 不再是 body 唯一 region → **不該撤 body chrome padding**(撤了反而 search row 沒呼吸)。直接用預設 `<DialogBody>`(chrome padded),list 自管 outer wrapper。

```tsx
<DialogBody>  {/* 預設 chrome padding */}
  <Input search />                              {/* search row */}
  <div className="mt-tight py-2 -mx-loose">     {/* list outer:撤 body 水平 padding 讓 item flush chrome */}
    {items.map(...)}
  </div>
</DialogBody>
```

(此 case 罕見,優先考慮:這個 flow 該用 `Combobox` / `SelectMenu` 而非 Dialog)

### Menu 移植到 Dialog body(short text options / single-click commit)

用 `MenuItem` primitive,不自刻 `<button>` hand-craft:

```tsx
<DialogBody className="!px-0 !pt-0 !pb-0">
  <div className="py-2">
    {options.map(o => (
      // MenuItem 預設 px-3 → className override 為 px-loose 對齊 dialog header
      <MenuItem key={o.value} className="px-[var(--layout-space-loose)]" onSelect={...}>
        {o.label}
      </MenuItem>
    ))}
  </div>
</DialogBody>
```

**何時該用 MenuItem vs hand-craft**:
| 情境 | 選 | 理由 |
|------|----|------|
| 純文字 / icon + label 選項(scanning mode)| MenuItem | Family 1 menu rhythm |
| avatar + title + description(reading mode)| hand-craft Family 2 結構 | MenuItem 是 scanning typography |
| 要做 `<Command>` 搜尋 | SelectMenu(cmdk-based)| dialog 內用獨立 primitive |

**更高層設計判斷**:
- 單擊即生效 → `DropdownMenu` / `SelectMenu`(浮層),**不用 Dialog**
- 暫存選擇 + Save CTA 才 commit → `Dialog + MenuItem`(本 pattern)

### M11 state walk hover 檢查(三 invariant 必同時 ✓)

1. hover bg 左右邊 = chrome 邊?
2. content 左邊 = header title 左邊?
3. content 離 hover bg 邊 ≥ loose?

### ❌ 禁止

- 重新引入 `flush` variant prop(或 `variant="list"` / `density="list"`)
- Item `px=0` 讓 content 直接觸 hover bg 邊(content-inside-bg breathing 違反)
- list outer 重複 `py-4` + item 各自 `py-2`(過鬆)
- 不對稱 padding 無 rationale
```

### SurfaceFooter
- `border-t border-divider`
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- `flex items-center justify-end gap-2 shrink-0`(右對齊按鈕列,不被壓縮)

---

## Overlay title typography canonical(modal vs non-modal 分級,2026-04-22)

Overlay family 的 header title typography 依「modal vs non-modal」分級,**跟 chrome padding / dismiss behavior 同 rationale(modal 重量級 vs non-modal 輕量)**:

| 家族 | Title typography | 套用元件 |
|------|------------------|---------|
| **Modal**(阻斷互動)| `text-body-lg font-medium truncate`(**16px**)| `Dialog` / `Sheet` |
| **Non-modal**(可忽略)| `text-body font-medium truncate`(**14px**)| `Popover` / `Coachmark` / `HoverCard` / `Tooltip` |

**Rationale**:
- **Modal**:title 是決策 anchor,user 必須 process → 需視覺重量(16px + 重字重)
- **Non-modal**:title 是輔助標籤,user 可忽略 → 輕量字級(14px)不搶 body content

**世界級對照**(7 家 DS 同 split):
| DS | Modal title | Non-modal popover title |
|----|-------------|------------------------|
| Material M3 | Headline 24 / body 16 | Smaller 14-16 |
| Polaris | Modal 大 | Popover 較小 |
| Atlassian | Modal 大 | InlineDialog 小 |
| Notion | 16+ | 14 |
| Linear | 16 | 14 |
| Figma | 16 | 13-14 |
| GitHub Primer | 16 | 14 |

**跟「density 鎖 md」同源**:Popover / Coachmark 把「輕量」貫穿 chrome:density 鎖 md + chrome button 透過 v5 unbounded trick 縮 layout + **title 小一級**。三件一起構成「輕量浮層」視覺語言,跟 Modal heavy 形成明確分化。

**禁止**:consumer 自刻 `<h2 className="text-body-lg">` 繞 `PopoverTitle` — 若需要大 title 代表該用 Dialog 而非 Popover(選錯元件)。

**SSOT**:
- `components/Popover/popover.spec.md`「Title typography canonical(non-modal 特化)」(Popover 專用細節)
- `components/Dialog/dialog.spec.md`「Title」(Modal 專用細節)

---

## 為什麼 SurfaceHeader 是 padding-based(而非 fixed-h)(2026-04-22 設計原則)

**SurfaceHeader 永遠 padding-based**(`py-tight`,**無** min-h)。Header 高度 = `max(title line-height, button slot)+ 2×py`,**slot 設計為 ≤ title line-height** 讓 title 主導 → header 高度 = title 決定。**Slot 透過 `--chrome-slot-h` CSS var 參數化**(default `var(--field-height-xs)` = 24 = body-lg 24,Dialog/Sheet 自然 48 ✓;Popover override `1.25rem` = 20 ≤ body 21,自然 ~45 輕一級)。Q10 修法不該動 header min-h 而動 button 佔位。SurfaceFooter 同 trick(若內含 unbounded)。**語義宣告**:

**Padding-based 宣告**:「本 chrome **可以成長** — title 可換行、可附 subtitle / description」。適用 overlay family(Dialog / Sheet / Popover / Coachmark),這些都是 modal/semi-modal 情境,title 有可能長(例如「確認要永久刪除 Marketing Q4 Campaign 這個專案嗎?」兩行 title),或有 subtitle(「這個操作無法復原」補充說明)。

**Fixed-height 宣告**:「本 chrome **永遠單行固定結構** — 不會長高」。適用 chrome 類如 Sidebar / FileViewer toolbar / app top bar,這些 chrome 的內容是 logo / icons / 短固定 label,不會 grow。

**兩者視覺上在單行 content 時都是 48/56,但是不同的設計宣告**:
- 若 Dialog 用 fixed-h,未來塞兩行 title / subtitle 會被剪掉 → 違反 modal 作為「完整決策 context」的職責
- 若 Sidebar 用 padding-based,chrome 可能在長 label 時變動 → 違反 sidebar chrome「剛性佈局」的職責

**判斷 tree**:問「這個 chrome 的 title 有可能多行 / 有 subtitle / 有 description 嗎?」
- **會** → padding-based(SurfaceHeader 或自刻 py-tight)
- **不會** → fixed-h(`h-[var(--chrome-header-height)]`)

**完整 canonical + 世界級對照**:`tokens/uiSize/uiSize.spec.md`「消費 --chrome-header-height 的 2 種實作 pattern」節

---

## Size canonical(per-overlay default size SSOT,2026-05-04)

> **背景**:Popover / HoverCard 是「輕量浮層」(chrome 45 / slot 20 / title 小一級 / density 鎖 md);Dialog / Sheet 是「heavy commitment chrome」(chrome 48 / slot 24)。Per-surface body+footer button/field default size 跟「輕量 vs heavy」分化對應。
>
> **依據**:Linear / Notion / Airtable / Carbon / Material Menu / Atlassian Popup popover bodies 共識用 sm-density;Material AlertDialog / Carbon Modal / shadcn Dialog 共識用 md。world-class 雙派分明依「浮層密度」分。

| Overlay | Header chrome | Body field controls | Body inline action(drag handle / trash / +CTA)| Footer action Buttons |
|--|--|--|--|--|
| **Popover** | unbounded sm → 20 slot(輕)| **sm**(輕量 dense info)| inline-action sm/md = **16+18** | **sm** |
| **HoverCard** | (同 Popover)| **sm** | 同 | **sm** |
| **Dialog** | unbounded sm → 24 slot | **md** | inline-action sm/md = 16+18 | **md** |
| **Sheet** | (同 Dialog)| **md** | 同 | **md** |
| **BulkActionBar** | N/A | N/A | N/A | **md**(default footer placement);未來 top-toolbar variant → sm |

**核心 invariant**:overlay surface 內 **body field controls + footer Buttons 同一 size**(per-surface 一致)。違反 = 視覺重量割裂。

**為什麼 Popover all-sm 而非 mix**:Popover 整體已是「輕量浮層」設計語言(chrome 短、title 小、density 鎖 md)。如果 body 用 md fields(32 高)+ footer sm Buttons(28 高),視覺重量割裂破壞「輕量」一致性。**all-sm 是內部一致性**(body 28 / footer 28 同高,延伸 chrome 輕一級的密度)。

**為什麼 Dialog all-md 而非 mix**:Dialog 是 heavy commitment chrome,body 操作往往 form-heavy,md (32) 是 Field family default(`--field-height-md` SSOT),footer Buttons 同 md commit 視覺重量配得上 modal 結論性。

**Drag handle / inline-action sizing**(對齊 `patterns/element-anatomy/inline-action.spec.md`):
- Field sm/md 同 row → inline action **16 icon / 18 hover bg**
- Field lg 同 row → inline action **20 icon / 22 hover bg**

亦即:在 Popover(field=sm)或 Dialog(field=md)body 內,inline action 都同樣 16+18,差別只在 lg-density 場景。

---

## Chrome dismiss size canonical

**User 設計 insight**:header 的 padding-based sizing 在 **unbounded button**(text variant / dismiss,無 bg/border)場景視覺 padding 過大;在 **bounded button** 則剛好。解法 = **保持 button native size 不變(touch target / 視覺 render 都是 sm 原尺寸),但 layout 佔位縮回 xs(24)** via 負 margin。

**Canonical**:button native size **保留 sm**(touch target / 視覺 render 不動);**unbounded 的靠 CSS 負 my 把 layout 佔位縮到 `--chrome-slot-h`** ≤ title line-height,讓 title 主導 chrome 高度。

| Button 類型 | 判定(button.tsx L362)| Trick 套用 | Layout 佔位 | Dialog/Sheet header (slot 24)| Popover header (slot 20)|
|--|--|--|--|--|--|
| **Unbounded** | `variant === 'text'` OR `dismiss` → `data-unbounded="true"` | ✓ 套負 my | = `var(--chrome-slot-h)` | max(24, 24) + py-tight = **48** | max(21, 20) + py-tight = **45** |
| **Bounded** | `primary` / `tertiary` / `outline` 等(有 bg/border) | ✗ 不套 | = native sm (28 md / 32 lg) | max(24, 28) + py-tight = **52**(自然長)| max(21, 28) + py-tight = **52**(自然長)|

**為什麼差別**:Unbounded 沒視覺邊界 → native 28 是純 hit-target padding,縮 layout 不損視覺;Bounded 的 bg/border 就是內容,縮會切掉 → 必須讓 chrome 自然長高,**這是設計宣告「此 chrome 有重要 action,視覺重量該配得上」**。

**實作**:

```tsx
// button.tsx ── 自動標記 data-unbounded
const unboundedAttr = resolvedVariant === 'text' || dismiss ? { 'data-unbounded': 'true' } : {}

// overlay-surface.tsx ── slot 透過 CSS var 參數化(2026-05-04 v3 Q10)
const CHROME_UNBOUNDED_SLOT =
  '[&_[data-unbounded]]:my-[calc((var(--chrome-slot-h,var(--field-height-xs))-var(--field-height-sm))/2)]'

// SurfaceHeader default → slot = field-height-xs (24)
// PopoverHeader override → className "[--chrome-slot-h:1.25rem]" (20)
// 公式 = (slot - native) / 2 ──  md unbounded sm: (24-28)/2 = -2px / Popover (20-28)/2 = -4px
```

**覆蓋範圍**:
- Dismiss X(`<Button dismiss />`)→ data-unbounded ✓
- Text variant action(`<Button variant="text" />` 如 Share / Refresh / Settings)→ data-unbounded ✓
- 所有無視覺邊界的 button,不限 dismiss

**為什麼用負 margin 而非 fixed wrapper / size="xs"**:
- `size="xs"` 會縮小 button 本身,**touch target 也變 24**(違反 a11y 最小 24+ hit target,也違反 user 意圖「touch 仍 sm」)
- `min-h-chrome-header-height` fixed wrapper 會鎖死高度,**bounded button 失去自然長高能力**(違反 user 意圖)
- 負 margin:button render / touch target 不變,僅影響 parent flex layout 計算 → 剛好 user 想要的「layout 24,視覺 / 觸控 28」

**Consumer 使用方式**:

```tsx
// Dialog / Sheet / Popover / Coachmark(透過 SurfaceHeader)
<Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
// SurfaceHeader 自動套負 my,無需 consumer 手動 y 調整

// Header 若塞 bounded button(primary sm)→ 該 button 無 `data-dismiss`,不套負 my → 自然長高
<Button variant="primary" size="sm">套用</Button>

// Notification banner(Notice / Alert / Toast):px-4 py-3 fixed,dismiss 用 xs 簡化(無 margin trick)
<Button iconOnly dismiss size="xs" startIcon={X} aria-label="關閉通知" />
```

**Consumer 實際高度範例**:
- Dialog header 只有 title + close X(sm + `data-dismiss`)→ layout 佔位 24 → header = 48 md / 56 lg ✓
- Dialog header 有 refresh/share/close 全 data-dismiss sm → 全部 layout 佔位 24 → header 仍 48/56
- Dialog header 塞 primary sm(無 data-dismiss)→ primary layout 佔 28 → header = 52 md(自然長)
- Popover header 同 pattern:48 md / 56 lg

**Rationale**:Unbounded 無 bg/border → 2×py-tight 過大,縮 layout 佔位至 xs(24)讓 header = chrome-header-height = 48 自然閉合,跟 Sidebar / page header / top bar 對齊。Bounded 自帶視覺重量,自然長到 52+,跟 footer 一致。

---

## Viewport-aware scroll chain invariant(2026-05-04 K11 升 SSOT)

> **背景**:Popover / HoverCard / Dialog / Sheet content 設 `max-h-[var(--radix-*-available-height)] flex flex-col overflow-hidden`,讓 viewport 太小時 header/footer 永遠 in-viewport,body 壓縮 scroll。但**中間任何 wrapper div 沒 forward `flex flex-col h-full` 就斷鏈**,SurfaceBody flex-1 失效,body 不會 scroll。
>
> **真實 bug(2026-05-04)**:Filter / Sort panel 內 wrapper div 設 `w-[640px]` 無 flex-col → user 縮視窗時 body 不 scroll,內容被 clip。NameCard 之所以 work 因為它直接是 PopoverContent 唯一 child(無 wrapper)+ 自設 max-h flex-col。

**Invariant**:從 `*Content`(浮層 root)到 `SurfaceBody` 之間的**所有中間 wrapper 都必 `flex flex-col h-full min-h-0`**(K11 v2,2026-05-04)。`min-h-0` 必須 — flex item default `min-height: auto` 會讓 content 撐高度,`h-full` 失效;加 `min-h-0` 才能正確 shrink 到 PopoverContent max-h cap。

```tsx
<div ref={ref} className="flex flex-col h-full min-h-0 w-[640px]">  // ✓
  <SurfaceHeader />
  <SurfaceBody />
</div>
```

**禁止**:`w-[640px]` 單獨用(❌ 斷鏈)/ `flex flex-col h-full` 無 `min-h-0`(❌ flex item 不 shrink,scroll 失效)。

**DS-wide consumer 必檢點**:`grep '<PopoverContent\|<HoverCardContent\|<DialogContent\|<SheetContent'` 內第一層 wrapper 是否含 `flex flex-col h-full`(若該 panel 用 SurfaceBody)。Hook `check_overlay_panel_scroll_chain.sh` 機械化攔截。

**共通 rationale**(全 overlay + banner 家族):corner close X 屬 **action group region**,必用 `<Button>` primitive(不自刻 `<button><X /></button>` 繞 DS token / a11y,不用 `ItemInlineActionButton`)。

**本 session 震盪歷史備忘(M12 FP 記憶)**:
- ❌ v1「chrome dismiss 全 xs(DS-wide 統一)」→ 錯:過度簡化 rationale
- ❌ v2「三家族 modal sm / non-modal xs / banner xs」→ 錯:overlay 內部不必分化
- ❌ v3「overlay 統一 sm + min-h chrome-header-height 強鎖 48/56」→ 錯:強鎖會讓 bounded button 被鎖死 slot
- ❌ v4「padding-based + unbounded=xs / bounded=natural」→ 錯:xs 縮小 button 連 touch target 也變 24(違反 a11y / user 意圖)
- ✅ v5「padding-based + unbounded `data-dismiss` 套負 my(native size sm 不變)/ bounded natural」→ 對:button native size 與 touch target 保 sm,僅 layout 佔位縮回 24,48/56 chrome-header-height 自然達成

**SSOT 關聯**:
- `tokens/uiSize/uiSize.spec.md`「--chrome-header-height」+ `globals.css` 聲明(md=3rem / lg=3.5rem)
- `tokens/layoutSpace/layoutSpace.spec.md` tight = 12 md / 16 lg
- `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」
- `components/Button/button.spec.md`「Dismiss 視覺類」+ unbounded / bounded 判斷

---

## Control + List 視覺對稱原則 → SSOT 規則 3 補充

→ `tokens/layoutSpace/layoutSpace.spec.md`「規則 3:元素間 gap」+ `## Notes` 節「List-as-region in overlay body」(本原則本質是 inline → block 對稱在 list 場景的特殊化,SSOT 移上游避免重複 — Rule-of-3)。

---

## Consumer rule:必消費 primitive 不自刻 chrome(2026-04-29)

寫 Popover / Dialog / Sheet 內容必消費 `SurfaceHeader/Body/Footer`(或上層 `PopoverHeader/...`),**禁自刻 `<div className="px-loose ... border-(b|t)">` 取代**。

**Why**:primitive 自帶 padding token + PopoverHeader auto close X(line 72)+ PopoverTitle typography + `data-popover-body` autofocus 標記;自刻 = padding/border/close X/title 大小 4 向 drift 起點(對齊 mindset #2)。

**Hook**:`.claude/hooks/check_overlay_handcraft.sh` 攔此 pattern;escape hatch `// overlay-handcraft-allow: <reason>` 同/前行。

---

## 不屬本 primitive 的職責

- **Close 按鈕渲染**:由 consumer(Dialog / Sheet / Popover)自己包 `<Button iconOnly dismiss>` 在 Header 內,綁各自 Radix Close primitive。SurfaceHeader 本身不渲染 close,避免 pattern 與 consumer 的職責耦合。
- **viewport-fill 高度邏輯**:Dialog 特有(填滿 viewport - inset),由 DialogContent 自行計算 `height: calc(100vh - inset*2)`,與 Body 協作 `flex-1 overflow-y-auto`。
- **radius / border / shadow / bg**:浮層外殼職責,由 Dialog / Popover 的 Content 自己套(都套同一組 token:`bg-surface-raised` / `border-border` / `rounded-lg` / `shadow-[var(--elevation-200)]`——這部分 CLAUDE.md 已經寫明對齊規則,不另外抽 primitive)。

---

## A11y 預設

overlay-surface 是 **layout pattern**(`SurfaceHeader` / `SurfaceBody` / `SurfaceFooter`),不持有互動行為 — a11y 大宗在 consumer overlay primitive(Dialog / Sheet / Popover / HoverCard)上,由 Radix 處理:

- **Role + ARIA**:Radix `Dialog.Content` / `Popover.Content` / `Sheet.Content` 已自帶 `role="dialog"` + `aria-modal`(modal only)+ `aria-labelledby`(Title)+ `aria-describedby`(optional Description)
- **Focus trap**:Dialog / Sheet 自帶 modal focus trap;Popover / HoverCard 不 trap(non-modal canonical)
- **Esc / 點外面關閉**:Radix 處理(可被 `onEscapeKeyDown` / `onPointerDownOutside` 攔截)
- **AutoFocus on open**:consumer 自管 `onOpenAutoFocus`(Popover 範例:`handlePopoverOpenAutoFocus` 找 body 第一個 interactive 元素,跳過 close X 避免 tooltip leak)

**SurfaceHeader Title 可被 ARIA 關聯**:consumer 把 `id` 傳到 SurfaceHeader 的 Title 元素,Radix Content 用 `aria-labelledby={id}`。本 pattern 不強制 id naming(consumer 自決)。

---

## 何時不用

- **Toast / Alert**(Family 2 List item 視覺對齊):那是 row-item layout 不是 surface-section,不要套本 pattern。
- **Tooltip**(純文字短提示):無結構化需求,不包 Header/Body/Footer。
- **HoverCard**(自由組合互動浮層):目前 consumer 自行組合內容,視未來是否引入 Header/Body/Footer 需求再納入 consumer。

---

## 相關

- `../../components/Dialog/dialog.spec.md` — modal 浮層 consumer
- `../../components/Popover/popover.spec.md` — non-modal 浮層 consumer
- `../../tokens/layoutSpace/layoutSpace.spec.md` — padding token 來源(`--layout-space-loose` / `--layout-space-tight` / `--layout-space-bottom`)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`
- `element-anatomy.spec.md`
- `notice.spec.md`
- `sheet.spec.md`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `header-canonical.spec.md`
- `motion.spec.md`
