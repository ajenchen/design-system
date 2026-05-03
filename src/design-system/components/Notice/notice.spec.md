---
component: Notice
family: null
variants: {}
sizes: {}
traits:
  - isInternal
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Notice 設計原則

**Toast / Alert 共用的視覺佈局層**——跟 MenuItem 為 SelectMenu / DropdownMenu 共用是同一個架構概念。Notice 只負責 layout 和 icon 選擇，色彩由消費者透過 `data-theme` 控制。

## 定位

Notice 是純視覺 primitive，不是獨立使用的元件。消費者：
- **Toast**：浮動 + 自動消失（Sonner）
- **Alert**：inline / fixed 持久通知

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。Notice 語意為 notification（非 row collection），但視覺排版遵循 Family 2 確保跨元件視覺一致。

**尺寸偏離（documented exception）**：Notice / Alert / Toast **單一固定 size**，**不**實作 Family 2 baseline 的 sm/md/lg。世界級共識（Material Banner/Snackbar、Polaris Banner、Atlassian InlineMessage、GitHub Flash）都是**單一 prominent size**——通知的使命是「搶注意」而非「在密度選擇裡協調」，提供 size 選項反而會讓 consumer 糾結（該用哪個 size？）而稀釋元件的目的性。同理 padding 也不隨 density 變（`px-4 py-3` 固定）——通知是跨 density 一致的訊息載體。

## Typography

md tier，固定不隨 density 變：
- title: `text-body`（14px）`leading-compact`（1.3）— 有 description 時加 `font-medium`
- description: `text-body`（14px）`leading-compact` + `text-fg-secondary`（neutral-8）

相同 body 字級,層級靠 font-weight / color 區分。

## Padding（固定）

| 屬性 | 值 | 理由 |
|---|---|---|
| px | `px-4`（16px） | 世界級系統共識（Atlassian/GitHub/Material/Linear 都是 16px） |
| py | `py-3`（12px） | 介於 row（7px）和 section（16px）之間，通知的 sweet spot |
| gap | `gap-2`（8px） | 跟 item-layout icon-text gap 一致 |

不隨 density 變——Toast/Alert 是通知，不是工作區域元件。

## Layout

item-layout 4-slot：
```
[status icon?]  [title + description?]  [endContent?]  [dismiss X?]
```

- Icon: 16px，`h-[1lh]` inline 對齊 first line
- Dismiss X: `<Button iconOnly dismiss size="xs" />` — chrome corner action group region(Cat 3)。xs 是 **Notification banner family canonical**(Notice / Alert / Toast inherit):ephemeral banner `px-4 py-3` 固定不隨 density,dismiss 邊角小 affordance 輕量不搶眼。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical — 三家族分類」+ `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss canonical — X close only」
- endContent: 通常放 `<Button variant="tertiary" size="xs">`

## Variant

| Variant | Icon | 語意 |
|---|---|---|
| neutral | 無 | 一般訊息 |
| info | Info（ℹ） | 資訊提示 |
| success | CircleCheck（✓） | 操作成功 |
| warning | TriangleAlert（⚠） | 警告 |
| error | XCircle（✕） | 錯誤 |

## Theme 策略

Notice **不設** bg 和 text color。消費者在 container 設 `data-theme` + `text-foreground`，Notice 內所有 token 自然適配。

消費者的 data-theme 策略：

| 場景 | data-theme | text 結果 |
|---|---|---|
| 有色相 solid（info/success/error） | `"dark"` | neutral-9 = 白 |
| warning solid | `"light"`（永遠） | neutral-9 = 黑 |
| neutral solid | `{inverse}`（跟頁反） | 跟隨翻轉 |
| subtle | 不設（跟隨頁面） | 跟隨頁面 |

### 為什麼 data-theme 要搭配 text-foreground

CSS `color` 從 body 繼承的是**已解析的計算值**，不是 `var(--foreground)` 表達式。`data-theme` 改變 `--foreground` 的值，但不改 `color` 屬性。在 theme boundary 設 `text-foreground` class 強制 `color: var(--foreground)` 在正確 context 重新解析。

## 何時用 / 何時不用

**Notice 是 internal primitive**——不直接使用，透過 `Alert` / `Toast` 等外層通知元件消費。

| 場景 | 正確做法 |
|------|---------|
| Inline / fixed 持久通知 | 用 `Alert`（內部消費 Notice）|
| 浮動自動消失的短暫通知 | 用 `Toast`（內部消費 Notice + sonner）|
| 直接在 JSX 中用 `<Notice>` | ❌ **禁止**——失去 Alert / Toast 外層的生命週期與定位管理 |

### 消費者

- `../Alert/alert.spec.md` — inline / fixed 持久通知
- `../Toast/toast.spec.md` — 浮動非阻斷短暫通知

---

## 為何無 SizeMatrix / ColorMatrix

Notice 是 **Toast / Alert 共用的 layout primitive**,刻意不擁有尺寸與色彩變體:

- **無 SizeMatrix**:Notice / Alert / Toast **單一固定 size**(見本 spec「尺寸偏離」段),不實作 Family 2 baseline 的 sm/md/lg——通知的使命是「搶注意」而非「在密度選擇裡協調」。padding 固定 `px-4 py-3`,typography 固定 md tier(14px),不隨 density 變。
- **無 ColorMatrix**:Notice 本身**不設 bg / text color**(見本 spec「Theme 策略」段),色彩完全由 consumer(Alert / Toast)透過 `data-theme` + `text-foreground` 控制。Notice 層級的色彩矩陣沒有意義——視覺對照屬於 consumer 的職責,應查 `alert.anatomy.stories.tsx` 與 `toast.anatomy.stories.tsx` 的 ColorMatrix。

對應 anatomy story:保留 `Overview` / `Inspector` / `StateBehavior`,額外追加元件特有的 `VariantIconMap`(展示 5 種 variant 對應的 status icon + 語意)。

---

## 相關

- `../Alert/alert.spec.md` — 主要消費者（持久通知）
- `../Toast/toast.spec.md` — 主要消費者（短暫通知）
- `../../patterns/element-anatomy/item-anatomy.spec.md` — Notice 的 layout 共用規則
- `../../tokens/color/color.spec.md` — color tokens 和 variant × theme 策略
- `../../tokens/color/primitives.css` — primitives nested theme（`:root, [data-theme]` pattern）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `bulk-action-bar.spec.md`
