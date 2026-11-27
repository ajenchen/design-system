---
internal: true
# 同 overlay-surface.spec.md:DS-internal pattern 的分節,不是另一個 pattern;sub-spec 不另立 family(Dim 16 豁免)
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list.(2026-09-27 自 overlay-surface.spec.md 抽出,標記沿用) -->

# Overlay chrome 分級尺寸設計原則(overlay-surface 的分節;獨立 SSOT)

> **本 spec 是 overlay chrome 分級尺寸的獨立 SSOT**(2026-09-27 從 `overlay-surface.spec.md` 整段抽出「Overlay title typography canonical」「為什麼 SurfaceHeader 是 padding-based」「Size canonical」「Chrome dismiss size canonical」四節,避免單一 spec 過長(595 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭、檔尾指標,與 N23 的四處來源標註(見「為什麼用負 margin」與「震盪歷史備忘」))。SurfaceHeader / SurfaceBody / SurfaceFooter 結構、List-as-region、footer 對齊、Viewport-aware scroll chain、A11y 仍住 `./overlay-surface.spec.md`;程式碼對應 `overlay-surface.tsx`(`CHROME_UNBOUNDED_SLOT` / `COMPACT_HEADER_SLOT` / `EDITABLE_TITLE_HEADER_SLOT`)與 `../../components/Button/button.tsx`(`data-unbounded`)。
>
> **Layout Family**:同 `overlay-surface.spec.md`(非 Family 1–4 — structural container primitive 的分區尺寸);本檔不另立 family。

## Overlay title typography canonical(modal vs non-modal 分級,2026-04-22)

Overlay family 的 header title typography 依「modal vs non-modal」分級,**跟 chrome padding / dismiss behavior 同 rationale(modal 重量級 vs non-modal 輕量)**:

| 家族 | Title typography | 套用元件 |
|------|------------------|---------|
| **Modal**(阻斷互動)| `text-body-lg font-medium truncate`(**16px**)| `Dialog` / `Sheet` |
| **Non-modal**(可忽略)| `text-body font-medium truncate`(**14px**)| `Popover` / `Coachmark` |

**Rationale**:
- **Modal**:title 是決策 anchor,user 必須 process → 需視覺重量(16px + 重字重)
- **Non-modal**:title 是輔助標籤,user 可忽略 → 輕量字級(14px)不搶 body content

**世界級對照**(7 家 DS 同 split): <!-- @benchmark-unverified -->
| DS | Modal title | Non-modal popover title |
|----|-------------|------------------------|
| Material M3 | Headline 24 / body 16 | Smaller 14-16 |
| Polaris | Modal 大 | Popover 較小 |
| Atlassian | Modal 大 | InlineDialog 小 |
| Notion | 16+ | 14 |
| Linear | 16 | 14 |
| Figma | 16 | 13-14 |
| GitHub Primer | 16 | 14 |

**跟「版面間距鎖 md」同源**:Popover / Coachmark 把「輕量」貫穿 chrome:版面間距(layout-space)鎖 md(控制項大小不鎖、跟觸發點那一區,`tokens/density/density.spec.md`「浮層跟觸發點」)+ chrome button 透過 v5 unbounded trick 縮 layout + **title 小一級**。三件一起構成「輕量浮層」視覺語言,跟 Modal heavy 形成明確分化。

**禁止**:consumer 自刻 `<h2 className="text-body-lg">` 繞 `PopoverTitle` — 若需要大 title 代表該用 Dialog 而非 Popover(選錯元件)。

**SSOT**:
- `components/Popover/popover.spec.md`「Title typography canonical」(Popover 專用細節)
- `components/Dialog/dialog.spec.md`「Title」(Modal 專用細節)

---

## 為什麼 SurfaceHeader 是 padding-based(而非 fixed-h)(2026-04-22 設計原則)

**SurfaceHeader 永遠 padding-based**(`py-tight`,不鎖固定高度)。Header 高度 = `max(title line-height, button slot)+ 2×py`,**slot 設計為 ≤ title line-height** 讓 title 主導 → header 高度 = title 決定(slot 縮位 / CSS var 參數化等實作細節詳下方「Chrome dismiss size canonical」)。SurfaceFooter **不**套 unbounded slot trick(僅 padding + `border-t`,慣例放 bounded action buttons)。**語義宣告**:

**Padding-based 宣告**:「本 chrome **可以成長** — 可附小標 / 說明」(標題本身單行截斷;結構住 `./overlay-surface.spec.md`「SurfaceHeader」標題區)。適用 overlay family(Dialog / Sheet / Popover / Coachmark),標題上方可能有小標(例:決策卡步數「1 / 3」),下方可能有一句說明(例:「#PROJ-1234 · 指派給陳大明」)。

**Fixed-height 宣告**:「本 chrome **永遠單行固定結構** — 不會長高」。適用 chrome 類如 Sidebar / FileViewer toolbar / app top bar,這些 chrome 的內容是 logo / icons / 短固定 label,不會 grow。

**兩者視覺上在單行 content 時都是 48/56,但是不同的設計宣告**:
- 若 Dialog 用 fixed-h,附小標 / 說明時會被剪掉 → 違反 modal 作為「完整決策 context」的職責
- 若 Sidebar 用 padding-based,chrome 可能在長 label 時變動 → 違反 sidebar chrome「剛性佈局」的職責

**判斷 tree**:問「這個 chrome 會不會附小標 / 說明?」
- **會** → padding-based(SurfaceHeader 或自刻 py-tight)
- **不會** → fixed-h(`h-[var(--chrome-header-height)]`)

**完整 canonical + 世界級對照**:`tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」節(含「2 種 pattern 對照」)

---

## Size canonical(per-overlay default size SSOT,2026-05-04)

> **背景**:Popover / HoverCard 是「輕量浮層」(chrome 45 / slot 21 / title 小一級;Popover 版面間距鎖 md、HoverCard 不鎖 —— 兩者控制項大小都跟觸發點那一區,`tokens/density/density.spec.md` 情境 1 表);Dialog / Sheet 是「heavy commitment chrome」(chrome 48 / slot 24)。Per-surface body+footer button/field default size 跟「輕量 vs heavy」分化對應。
>
> **依據**:Linear / Notion / Airtable / Carbon / Material Menu / Atlassian Popup popover bodies 共識用 sm-density;Material AlertDialog / Carbon Modal / shadcn Dialog 共識用 md。world-class 雙派分明依「浮層密度」分。 <!-- @benchmark-unverified -->

| Overlay | Header chrome | Body field controls | Body inline action(drag handle / trash / +CTA)| Footer action Buttons |
|--|--|--|--|--|
| **Popover** | unbounded sm → 21 slot(輕)| **sm**(輕量 dense info)| inline-action sm/md = **16+18** | **sm** |
| **HoverCard** | unbounded sm → 21 slot(版面間距不鎖,跟觸發點那一區)| **sm** | 同 | **sm** |
| **Dialog** | unbounded sm → 24 slot | **md** | inline-action sm/md = 16+18 | **md** |
| **Sheet** | (同 Dialog)| **md** | 同 | **md** |
| **BulkActionBar** | N/A | N/A | N/A | **md**(default footer placement);未來 top-toolbar variant → sm |

**緊接表格上方的搜尋列 / 工具列**(2026-11-27,workspace H38):照工具列用 **sm**(`../action-bar/action-bar.spec.md`「Size」那列「Toolbar 用小尺寸維持緊湊」),在 Dialog / Sheet 主體裡也是 —— 它是表格的工具列,不算上表的 body field controls。距離見 `../../tokens/layoutSpace/layoutSpace.spec.md` 規則 3「標題塊」。出處:user 2026-11-27 問「那表格上方或是其上方標題附近的操作是否預設和建議使用 sm 以下的元件？」(問句,節錄;AI 對過既有條文答合理),之後回「我覺得可以照你目前建議的定義」(逐字節錄;全文記在交接資料夾 `notes/decisions/morning-151-answers.md`「H26」)。

**核心 invariant**:overlay surface 內 **body field controls + footer Buttons 同一 size**(per-surface 一致)。違反 = 視覺重量割裂。

**為什麼 Popover all-sm 而非 mix**:Popover 整體已是「輕量浮層」設計語言(chrome 短、title 小、版面間距鎖 md)。如果 body 用 md fields(一般密度 32 / 大密度 36 高)+ footer sm Buttons(28 / 32 高),視覺重量割裂破壞「輕量」一致性。**all-sm 是內部一致性**(body 與 footer 同高:一般密度 28、大密度 32,延伸 chrome 輕一級的密度)。

**為什麼 Dialog all-md 而非 mix**:Dialog 是 heavy commitment chrome,body 操作往往 form-heavy,md(一般密度 32 / 大密度 36)是 Field family default(`--field-height-md` SSOT),footer Buttons 同 md commit 視覺重量配得上 modal 結論性。

**Drag handle / inline-action sizing**(對齊 `patterns/element-anatomy/inline-action.spec.md`):
- Field sm/md 同 row → inline action **16 icon / 18 hover bg**
- Field lg 同 row → inline action **20 icon / 22 hover bg**

亦即:在 Popover(field=sm)或 Dialog(field=md)body 內,inline action 都同樣 16+18,差別只在 lg-density 場景。

---

## Chrome dismiss size canonical

**設計 insight(本檔既有記載;2026-09-27 查無對話原文可引,依 M36(a) 標為來源不明,不得當 user 拍板引用)**:header 的 padding-based sizing 在 **unbounded button**(text variant / dismiss,無 bg/border)場景視覺 padding 過大;在 **bounded button** 則剛好。解法 = **保持 button native size 不變(命中區 / 視覺 render 都是 sm 原尺寸),但 layout 佔位縮到 title line-box(24,衍生自 --font-body-lg-size×1.5)** via 負 margin。

**Canonical**:button native size **保留 sm**(命中區 / 視覺 render 不動);**unbounded 的靠 CSS 負 my 把 layout 佔位縮到 `--surface-chrome-slot-h`** ≤ title line-height,讓 title 主導 chrome 高度。

| Button 類型 | 判定(button.tsx L426-427)| Trick 套用 | Layout 佔位 | Dialog/Sheet header (slot 24)| Popover header (slot 21)|
|--|--|--|--|--|--|
| **Unbounded** | `variant === 'text'` OR `dismiss` → `data-unbounded="true"` | ✓ 套負 my | = `var(--surface-chrome-slot-h)` | max(24, 24) + py-tight = **48** | max(21, 21) + py-tight = **45** |
| **Bounded** | `primary` / `tertiary` / `outline` 等(有 bg/border) | ✗ 不套 | = native sm (28 md / 32 lg) | max(24, 28) + py-tight = **52**(自然長)| max(21, 28) + py-tight = **52**(自然長)|

**為什麼差別**:Unbounded 沒視覺邊界 → native 28 是純 hit-target padding,縮 layout 不損視覺;Bounded 的 bg/border 就是內容,縮會切掉 → 必須讓 chrome 自然長高,**這是設計宣告「此 chrome 有重要 action,視覺重量該配得上」**。

**實作**:

```tsx
// button.tsx ── 自動標記 data-unbounded
const unboundedAttr = resolvedVariant === 'text' || dismiss ? { 'data-unbounded': 'true' } : {}

// overlay-surface.tsx ── slot 透過 CSS var 參數化(2026-05-04 v3;2026-06-16 default 改衍生)
const CHROME_UNBOUNDED_SLOT =
  '[&_[data-unbounded]]:my-[calc((var(--surface-chrome-slot-h,calc(var(--font-body-lg-size)*1.5))-var(--field-height-sm))/2)]'

// SurfaceHeader default → slot 衍生自 title typography = calc(--font-body-lg-size × 1.5) = 24
//   (2026-06-16:從寫死 field-height-xs 改衍生 → title 字級改了 slot 自動跟、不靠巧合;M17 SSOT;
//    1.5 = typography.spec body 行高常數,非 token 故 inline,body 行高改須同步)
// Popover-tier override → COMPACT_HEADER_SLOT(= calc(--font-body-size × 1.5) = 21,衍生自 text-body title)
// 標題是 InlineEdit sm → EDITABLE_TITLE_HEADER_SLOT(slot = --field-height-sm,縮位 0;另讓出標題欄尾端,見下方「可編輯標題的標題列」)
// 公式 = (slot - native) / 2 ──  Dialog md: (24-28)/2 = -2px / Popover md: (21-28)/2 = -3.5px
```

**覆蓋範圍**:
- Dismiss X(`<Button dismiss />`)→ data-unbounded ✓
- Text variant action(`<Button variant="text" />` 如 Share / Refresh / Settings)→ data-unbounded ✓
- 所有無視覺邊界的 button,不限 dismiss
- **例外:SurfaceHeader 右側操作區(`[data-slot="surface-header-actions"]`)裡的按鈕不各自縮,改由整個操作區縮位**(`ACTIONS_GROUP_SLOT`,同一個公式;區裡有 Bounded 按鈕時不縮)。區內按鈕保持原生高,分隔線才量得到「最高元件」(`../action-bar/action-bar.spec.md`「分隔線幾何」前提:要住在自動高度的 cluster 內);× 與操作的位置、header 高度不變。2026-11-10 前每顆各自縮成 24,區高 24 → 線 16(Popover 21 → 13 → 地板 16),比常駐標題列的 20 短(n7 第七節 2)。

**為什麼用負 margin 而非 fixed wrapper / size="xs"**:
- `size="xs"` 會縮小 button 本身,**命中區也跟著縮到 24**,與 overlay chrome 的比例不協調(chrome 的 dismiss 是 `sm` = 28)。**問題在比例,不在 a11y** —— 24 正好等於 `tokens/uiSize/uiSize.spec.md`「元件高度地板」訂的最小值,沒有低於任何我們採用的門檻;先前這裡寫的「違反 a11y 最小 24+ hit target」既與「元件高度地板」自相矛盾、也查無出處,2026-09-24 更正(同 `uiSize.spec.md`「選錯的後果(驗證 decision tree 的重要性)」)
- `min-h-chrome-header-height` fixed wrapper 會鎖死高度,**bounded button 失去自然長高能力**(違反上一條的意圖 —— AI 推導,引不出 user 原話)
- 負 margin:button render / 命中區不變,僅影響 parent flex layout 計算 → 剛好是這裡要的「layout 24,視覺 / 命中 28」(AI 推導的設計目標,引不出 user 原話)

**Consumer 使用方式**:

```tsx
// Dialog / Sheet / Popover / Coachmark(透過 SurfaceHeader)
<Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
// `dismiss` prop → Button 自動標 `data-unbounded`(縮位 trick 判定詞);`data-dismiss` 用途不同,
// 是 openAutoFocus 排除 marker(popover.tsx / dialog.tsx autofocus selector)。
// SurfaceHeader 自動套負 my,無需 consumer 手動 y 調整

// Header 若塞 bounded button(primary sm)→ Button 不自動標 `data-unbounded`,不套負 my → 自然長高
<Button variant="primary" size="sm">套用</Button>

// Notification banner(Notice / Alert / Toast):px-4 py-3 fixed,dismiss 用 xs 簡化(無 margin trick)
<Button iconOnly dismiss size="xs" startIcon={X} aria-label="關閉通知" />
```

**Consumer 實際高度範例**:
- Dialog header 只有 title + close X(sm,`dismiss` → 自動 `data-unbounded`)→ layout 佔位 24 → header = 48 md / 56 lg ✓
- Dialog header 有 refresh/share(text variant)/ close(dismiss)sm → 全自動標 `data-unbounded` → 全部 layout 佔位 24 → header 仍 48/56
- Dialog header 塞 primary sm(bounded,無 `data-unbounded`)→ primary layout 佔 28 → header = 52 md(自然長)
- Popover header 同 pattern,但版面間距鎖 md:unbounded 時 21 + 12 × 2 = **45**(外加 1px 底線,實量一般 / 大密度都是 46;稽核 2026-11-11 抓到原寫「48 md / 56 lg」是錯的,與上表 45 及 `tokens/density/density.spec.md` 情境 1「Tier alignment」矛盾)

**Rationale**:Unbounded 無 bg/border → 2×py-tight 過大,縮 layout 佔位至 xs(24)讓 header = chrome-header-height = 48 自然閉合,跟 Sidebar / page header / top bar 對齊。Bounded 自帶視覺重量,自然長到 52+,跟 footer 一致。

**共通 rationale**(全 overlay + banner 家族):corner close X 屬 **action group region**,必用 `<Button>` primitive(不自刻 `<button><X /></button>` 繞 DS token / a11y,不用 `ItemInlineActionButton`)。

**本 session 震盪歷史備忘(M12 FP 記憶)**:
- ❌ v1「chrome dismiss 全 xs(DS-wide 統一)」→ 錯:過度簡化 rationale
- ❌ v2「三家族 modal sm / non-modal xs / banner xs」→ 錯:overlay 內部不必分化
- ❌ v3「overlay 統一 sm + min-h chrome-header-height 強鎖 48/56」→ 錯:強鎖會讓 bounded button 被鎖死 slot
- ❌ v4「padding-based + unbounded=xs / bounded=natural」→ 錯:xs 縮小 button 連命中區也縮到 24,與 chrome 的 28 失衡(**不是 a11y 問題**,見上方「為什麼用負 margin 而非 fixed wrapper / size="xs"」)
- ✅ v5「padding-based + unbounded `data-unbounded` 套負 my(native size sm 不變)/ bounded natural」→ 對:button native size 與命中區保 sm,僅 layout 佔位縮回 24,48/56 chrome-header-height 自然達成

**SSOT 關聯**:
- `tokens/uiSize/uiSize.spec.md`「--chrome-header-height」+ `globals.css` 聲明(md=3rem / lg=3.5rem)
- `tokens/layoutSpace/layoutSpace.spec.md` tight = 12 md / 16 lg
- `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」
- `components/Button/button.spec.md`「Dismiss 視覺類」+ unbounded / bounded 判斷

## 可編輯標題的標題列(2026-11-25)

**何時用**:浮層標題位放的是可以就地改的 `InlineEdit`(`size="sm"`,字樣照標題 `font-medium`),不是 `PopoverTitle` / `DialogTitle`。例:Popover 規格頁「可編輯標題的標題列」。(Calendar 事件詳情 0.1.0-beta.152 起標題列改回 `PopoverTitle`、改名字移到內文「標題」欄 —— `../../components/Calendar/calendar.spec.md`「事件詳情浮層」標題列【DT-TITLE(定)】,不再是本段的例子)

**做法**:Header 的 className 加 `EDITABLE_TITLE_HEADER_SLOT`(`overlay-surface.tsx` 檔尾;`<PopoverHeader className={EDITABLE_TITLE_HEADER_SLOT}>`,DialogHeader / SheetHeader / raw SurfaceHeader 用同一個常數)。它只設兩個變數,縮位公式沿用上方「Chrome dismiss size canonical」:

| 項目 | 值從哪個 token 來 | 結果(一般 / 大密度) |
|---|---|---|
| × 與右側操作區的佔位(`--surface-chrome-slot-h`) | `--field-height-sm` | 28 / 32 = × 原生高,縮位量 0 |
| 標題欄尾端讓位(`--surface-title-bleed` = SurfaceHeader 左欄的右外距,沒設時 0) | `--field-bleed`(= InlineEdit 垂直外伸的同一顆,`../../tokens/uiSize/uiSize.spec.md`「Field 外框寬與框內字線」) | 13 / 13 |
| 標題列內容高 | 2 × `--layout-space-tight` + `--field-height-sm`(Popover 版面間距鎖 md,tight = 12) | 52 / 56(外加 1px 底線;靜止 / 編輯中同高,實量) |

**為什麼佔位 = sm 欄位高**【AI 推導】:本檔的規則是「slot = 標題那一行的高」;標題是 InlineEdit 時,那一行是一列 sm 欄位(InlineEdit 編輯態就是 `<Input size="sm">`),不是一行 14px 字(21)。沿用 21 時 × 中線比標題那一列高 3.5(一般)/ 5.5(大)(2026-11-25 實測)。出處:2026-11-25 版 `calendar.spec.md`「事件詳情浮層」標題列「× 的佔位要跟這一行同高」(當時標【AI 推導,預覽時請 user 看】;該段 2026-11-27 已改成 PopoverTitle,這條推導留給本段的其他消費者)。

**為什麼讓位 = 外伸量**【AI 推導】:InlineEdit 直向排列(獨立使用的預設)把滑過底色、外框與隱形編輯鈕往左右各外伸 `--field-bleed`(框寬 1 + 內距 12 = 13),讓字貼齊欄左緣(`../../components/InlineEdit/inline-edit.spec.md`「對齊盒」)。讓位直接讀同一顆 token,外伸量改了讓位跟著改(2026-11-25 前兩者都是 `--field-px` 12,字比欄左緣右 1px;同日一起改成 `--field-bleed`)。左邊吃進標題列左內距(loose 16 > 13);右邊沒讓位時穿過 8px 的 gap、蓋進 ×(外伸 12 時實測 4px),而 × 在一般流、隱形編輯鈕是絕對定位,點 × 左緣那 4px 進的是編輯、不是關閉(2026-11-25 實測,一般 / 大密度相同)。讓位後外框右緣到 × 左緣 = 標題列的 gap(8),點 × 的任何一點都是關閉。

**靜止 / 編輯同高(2026-11-25 修)**:InlineEdit 靜止外框連同上下各 1px 透明邊框 = 一列 sm 欄位高(一般 28 / 大 32),與編輯中的 `<Input>` 同高,所以靜止與編輯中的標題列都是 52 / 56、× 中線對準標題外框。修在 InlineEdit 那一邊:`../../components/Field/field-wrapper.tsx` 的 `fieldViewGeometry` 高度下限扣掉外框上下兩條 1px 邊框(`../../components/InlineEdit/inline-edit.spec.md`「純文字 view↔edit 零跳」),本常數不跟著改。修前靜止外框 30 / 34 → 靜止時標題列 54 / 58、× 中線比標題外框中線高 1px;InlineEdit 各範例的單行欄位同樣從靜止 30 變成 28(同日實測)。

**閘**:`../../components/Popover/popover.anatomy.stories.tsx` 的 test-only `EditableTitleHeaderProbe`,它的 play 由 story-demo-focus 逐支執行(斷言不成立 → 該 story 渲染失敗 → 紅)。一般 / 大密度各一個浮層:× 中線離標題列內容區上緣 = sm 欄位高 / 2;標題外框右緣到 × 左緣 = gap;× 左緣內 1px 點到的是 ×;靜止時標題外框高 = sm 欄位高、標題列內容高 = 2 × tight + sm 欄位高、× 中線對準標題外框中線;編輯中標題列內容高同上、× 對齊輸入框那一列(容許都是 0.5px)。對照組(2026-11-25):拿掉佔位 → 量到 10.5、應 14,紅;拿掉讓位 → 量到 −4、應 8,紅;InlineEdit 高度下限不扣邊框 → 靜止標題外框量到 30、應 28,紅(同一份建置的標題列 54 應 52、× 與標題外框中線差 −1.0,也都超出容許);還原 → 綠。InlineEdit 高度下限扣邊框的寫法另由 `scripts/inline-edit-view-geometry-invariant.mjs` 逐尺寸鎖住。

**命名**:`EDITABLE_TITLE_HEADER_SLOT` 與 `COMPACT_HEADER_SLOT` 同一族(標題列種類 + `HEADER_SLOT`);editable 對齊 InlineEdit 的 `editable` 參數;全 DS 沒有別的 EDITABLE_TITLE。外部對「可以就地改的標題」也用 editable:Ant Design Typography(Title 繼承)的 `editable`(<https://github.com/ant-design/ant-design/blob/b32d6e07af61f9de393abebe326acd68faddf4bd/components/typography/Base/index.tsx#L128>)、Chakra UI 的 `Editable`(<https://github.com/chakra-ui/chakra-ui/blob/6c9d5ea82043937f8c379fe8d5423d2dd13ff7ab/packages/react/src/components/editable/editable.tsx#L58>)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `density.spec.md`
- `overlay-surface.spec.md`
- `popover.spec.md`
- `uiSize.spec.md`
