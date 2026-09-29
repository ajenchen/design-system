---
internal: true
# 同 overlay-surface.spec.md:DS-internal pattern 的分節,不是另一個 pattern;sub-spec 不另立 family(Dim 16 豁免)
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list.(2026-09-27 自 overlay-surface.spec.md 抽出,標記沿用) -->

# Overlay chrome 分級尺寸設計原則(overlay-surface 的分節;獨立 SSOT)

> **本 spec 是 overlay chrome 分級尺寸的獨立 SSOT**(2026-09-27 從 `overlay-surface.spec.md` 整段抽出「Overlay title typography canonical」「為什麼 SurfaceHeader 是 padding-based」「Size canonical」「Chrome dismiss size canonical」四節,避免單一 spec 過長(595 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭、檔尾指標,與 N23 的四處來源標註(見「為什麼用負 margin」與「震盪歷史備忘」))。SurfaceHeader / SurfaceBody / SurfaceFooter 結構、List-as-region、footer 對齊、Viewport-aware scroll chain、A11y 仍住 `./overlay-surface.spec.md`;程式碼對應 `overlay-surface.tsx`(`CHROME_UNBOUNDED_SLOT` / `COMPACT_HEADER_SLOT`)與 `../../components/Button/button.tsx`(`data-unbounded`)。
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

**跟「density 鎖 md」同源**:Popover / Coachmark 把「輕量」貫穿 chrome:density 鎖 md + chrome button 透過 v5 unbounded trick 縮 layout + **title 小一級**。三件一起構成「輕量浮層」視覺語言,跟 Modal heavy 形成明確分化。

**禁止**:consumer 自刻 `<h2 className="text-body-lg">` 繞 `PopoverTitle` — 若需要大 title 代表該用 Dialog 而非 Popover(選錯元件)。

**SSOT**:
- `components/Popover/popover.spec.md`「Title typography canonical(non-modal 特化)」(Popover 專用細節)
- `components/Dialog/dialog.spec.md`「Title」(Modal 專用細節)

---

## 為什麼 SurfaceHeader 是 padding-based(而非 fixed-h)(2026-04-22 設計原則)

**SurfaceHeader 永遠 padding-based**(`py-tight`,不鎖固定高度)。Header 高度 = `max(title line-height, button slot)+ 2×py`,**slot 設計為 ≤ title line-height** 讓 title 主導 → header 高度 = title 決定(slot 縮位 / CSS var 參數化等實作細節詳下方「Chrome dismiss size canonical」)。SurfaceFooter **不**套 unbounded slot trick(僅 padding + `border-t`,慣例放 bounded action buttons)。**語義宣告**:

**Padding-based 宣告**:「本 chrome **可以成長** — title 可換行、可附 subtitle / description」。適用 overlay family(Dialog / Sheet / Popover / Coachmark),這些都是 modal/semi-modal 情境,title 有可能長(例如「確認要永久刪除 Marketing Q4 Campaign 這個專案嗎?」兩行 title),或有 subtitle(「這個操作無法復原」補充說明)。

**Fixed-height 宣告**:「本 chrome **永遠單行固定結構** — 不會長高」。適用 chrome 類如 Sidebar / FileViewer toolbar / app top bar,這些 chrome 的內容是 logo / icons / 短固定 label,不會 grow。

**兩者視覺上在單行 content 時都是 48/56,但是不同的設計宣告**:
- 若 Dialog 用 fixed-h,未來塞兩行 title / subtitle 會被剪掉 → 違反 modal 作為「完整決策 context」的職責
- 若 Sidebar 用 padding-based,chrome 可能在長 label 時變動 → 違反 sidebar chrome「剛性佈局」的職責

**判斷 tree**:問「這個 chrome 的 title 有可能多行 / 有 subtitle / 有 description 嗎?」
- **會** → padding-based(SurfaceHeader 或自刻 py-tight)
- **不會** → fixed-h(`h-[var(--chrome-header-height)]`)

**完整 canonical + 世界級對照**:`tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」節(含「2 種 pattern 對照」)

---

## Size canonical(per-overlay default size SSOT,2026-05-04)

> **背景**:Popover / HoverCard 是「輕量浮層」(chrome 45 / slot 21 / title 小一級 / density 鎖 md);Dialog / Sheet 是「heavy commitment chrome」(chrome 48 / slot 24)。Per-surface body+footer button/field default size 跟「輕量 vs heavy」分化對應。
>
> **依據**:Linear / Notion / Airtable / Carbon / Material Menu / Atlassian Popup popover bodies 共識用 sm-density;Material AlertDialog / Carbon Modal / shadcn Dialog 共識用 md。world-class 雙派分明依「浮層密度」分。 <!-- @benchmark-unverified -->

| Overlay | Header chrome | Body field controls | Body inline action(drag handle / trash / +CTA)| Footer action Buttons |
|--|--|--|--|--|
| **Popover** | unbounded sm → 21 slot(輕)| **sm**(輕量 dense info)| inline-action sm/md = **16+18** | **sm** |
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

**設計 insight(本檔既有記載;2026-09-27 查無對話原文可引,依 M36(a) 標為來源不明,不得當 user 拍板引用)**:header 的 padding-based sizing 在 **unbounded button**(text variant / dismiss,無 bg/border)場景視覺 padding 過大;在 **bounded button** 則剛好。解法 = **保持 button native size 不變(命中區 / 視覺 render 都是 sm 原尺寸),但 layout 佔位縮到 title line-box(24,衍生自 --font-body-lg-size×1.5)** via 負 margin。

**Canonical**:button native size **保留 sm**(命中區 / 視覺 render 不動);**unbounded 的靠 CSS 負 my 把 layout 佔位縮到 `--chrome-slot-h`** ≤ title line-height,讓 title 主導 chrome 高度。

| Button 類型 | 判定(button.tsx L426-427)| Trick 套用 | Layout 佔位 | Dialog/Sheet header (slot 24)| Popover header (slot 21)|
|--|--|--|--|--|--|
| **Unbounded** | `variant === 'text'` OR `dismiss` → `data-unbounded="true"` | ✓ 套負 my | = `var(--chrome-slot-h)` | max(24, 24) + py-tight = **48** | max(21, 21) + py-tight = **45** |
| **Bounded** | `primary` / `tertiary` / `outline` 等(有 bg/border) | ✗ 不套 | = native sm (28 md / 32 lg) | max(24, 28) + py-tight = **52**(自然長)| max(21, 28) + py-tight = **52**(自然長)|

**為什麼差別**:Unbounded 沒視覺邊界 → native 28 是純 hit-target padding,縮 layout 不損視覺;Bounded 的 bg/border 就是內容,縮會切掉 → 必須讓 chrome 自然長高,**這是設計宣告「此 chrome 有重要 action,視覺重量該配得上」**。

**實作**:

```tsx
// button.tsx ── 自動標記 data-unbounded
const unboundedAttr = resolvedVariant === 'text' || dismiss ? { 'data-unbounded': 'true' } : {}

// overlay-surface.tsx ── slot 透過 CSS var 參數化(2026-05-04 v3;2026-06-16 default 改衍生)
const CHROME_UNBOUNDED_SLOT =
  '[&_[data-unbounded]]:my-[calc((var(--chrome-slot-h,calc(var(--font-body-lg-size)*1.5))-var(--field-height-sm))/2)]'

// SurfaceHeader default → slot 衍生自 title typography = calc(--font-body-lg-size × 1.5) = 24
//   (2026-06-16:從寫死 field-height-xs 改衍生 → title 字級改了 slot 自動跟、不靠巧合;M17 SSOT;
//    1.5 = typography.spec body 行高常數,非 token 故 inline,body 行高改須同步)
// Popover-tier override → COMPACT_HEADER_SLOT(= calc(--font-body-size × 1.5) = 21,衍生自 text-body title)
// 公式 = (slot - native) / 2 ──  Dialog md: (24-28)/2 = -2px / Popover md: (21-28)/2 = -3.5px
```

**覆蓋範圍**:
- Dismiss X(`<Button dismiss />`)→ data-unbounded ✓
- Text variant action(`<Button variant="text" />` 如 Share / Refresh / Settings)→ data-unbounded ✓
- 所有無視覺邊界的 button,不限 dismiss

**為什麼用負 margin 而非 fixed wrapper / size="xs"**:
- `size="xs"` 會縮小 button 本身,**命中區也跟著縮到 24**,與 overlay chrome 的比例不協調(chrome 的 dismiss 是 `sm` = 28),也違反此處記載的意圖「touch 仍 sm」(**AI 推導、引不出 user 原話**;2026-09-27 依待辦總帳 N23 拿掉「user 意圖」的歸屬,引號內原字不動,來源說明見下一行)。**問題在比例,不在 a11y** —— 24 正好等於 `tokens/uiSize/uiSize.spec.md`「元件高度地板」(:169)訂的最小值,沒有低於任何我們採用的門檻;先前這裡寫的「違反 a11y 最小 24+ hit target」既與 :169 自相矛盾、也查無出處,2026-09-24 更正(同 `uiSize.spec.md:350`)
  - ⚠️ **引號內為本檔既有記載,本輪查無對話出處,依 M36(a) 標為來源不明,不得再當成 user 拍板引用。** 2026-09-24 這一行一度被改寫成「按鈕本身仍 sm」並直接覆蓋掉原字 —— 兩句語意不同(一句講命中/觸控,一句講按鈕盒),而改寫沒有任何揭露。已還原為原字。要動引號內的字,只能拿得出對話原文才動
- `min-h-chrome-header-height` fixed wrapper 會鎖死高度,**bounded button 失去自然長高能力**(違反上一條的意圖 —— 同樣是 AI 推導,引不出 user 原話)
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
- Popover header 同 pattern:48 md / 56 lg

**Rationale**:Unbounded 無 bg/border → 2×py-tight 過大,縮 layout 佔位至 xs(24)讓 header = chrome-header-height = 48 自然閉合,跟 Sidebar / page header / top bar 對齊。Bounded 自帶視覺重量,自然長到 52+,跟 footer 一致。

**共通 rationale**(全 overlay + banner 家族):corner close X 屬 **action group region**,必用 `<Button>` primitive(不自刻 `<button><X /></button>` 繞 DS token / a11y,不用 `ItemInlineActionButton`)。

**本 session 震盪歷史備忘(M12 FP 記憶)**:
- ❌ v1「chrome dismiss 全 xs(DS-wide 統一)」→ 錯:過度簡化 rationale
- ❌ v2「三家族 modal sm / non-modal xs / banner xs」→ 錯:overlay 內部不必分化
- ❌ v3「overlay 統一 sm + min-h chrome-header-height 強鎖 48/56」→ 錯:強鎖會讓 bounded button 被鎖死 slot
- ❌ v4「padding-based + unbounded=xs / bounded=natural」→ 錯:xs 縮小 button 連命中區也縮到 24,與 chrome 的 28 失衡(違反上方「touch 仍 sm」那條 AI 推導的意圖、不是 user 原話 —— 2026-09-27 依 N23 註明;**不是 a11y 問題**,見上方「為什麼用負 margin 而非 fixed wrapper / size="xs"」)
- ✅ v5「padding-based + unbounded `data-unbounded` 套負 my(native size sm 不變)/ bounded natural」→ 對:button native size 與命中區保 sm,僅 layout 佔位縮回 24,48/56 chrome-header-height 自然達成

**SSOT 關聯**:
- `tokens/uiSize/uiSize.spec.md`「--chrome-header-height」+ `globals.css` 聲明(md=3rem / lg=3.5rem)
- `tokens/layoutSpace/layoutSpace.spec.md` tight = 12 md / 16 lg
- `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」
- `components/Button/button.spec.md`「Dismiss 視覺類」+ unbounded / bounded 判斷

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `overlay-surface.spec.md`
