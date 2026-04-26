---
component: OverflowIndicator
family: null
variants: {}
sizes: {}
traits:
  - isInternal
---

# OverflowIndicator 設計原則

## 定位

OverflowIndicator 是 **`+N` 溢出指示器 + HoverCard 顯示隱藏內容**——當 row / container 中的項目無法全部顯示時,剩餘項目以 `+N` 形式提示,hover 展開完整清單。

**實作基礎**:自建 internal primitive——消費 HoverCard + tagVariants,無直接 external primitive base。

**Layout Family**:非上述 family — self-contained Tag-like primitive(自帶 `+N` 計數、單一 trigger pill + hover 展開 popover,無 prefix / content / suffix 的 slot 結構;視覺尺寸對齊 Tag family 但不屬 Family 1-4 的任何 row 結構)。

---

## 何時用 / 何時不用

**OverflowIndicator 是 internal primitive**——由需要處理「溢出 +N」的元件消費，不直接使用。

| 場景 | 正確做法 |
|------|---------|
| Combobox 多選 tag 溢出 | `Combobox` 單行模式內部消費 OverflowIndicator |
| Tabs 水平溢出 | `Tabs` 內部消費（搭配 `horizontal-overflow` pattern）|
| Avatar stack 溢出（「+3 more」）| Avatar.Group（未來）內部消費 |
| 人員列表行尾 +N | 列表元件自行組合 OverflowIndicator + PersonDisplay |
| 直接在 JSX 用 `<OverflowIndicator>` | 僅當消費者是自訂 list / custom overflow pattern 時 |

---

## 為什麼用 HoverCard 而非 Tooltip

溢出內容**可能需要互動**——而非純文字提示：

- **人員 +N**：hover 清單中每個人可能需要 tag dismiss 或 hover 該人再看 NameCard（nested HoverCard）
- **Tag +N**：hover 清單中每個 tag 可能需要個別 dismiss
- **一般 +N**：穩定顯示、使用者可把滑鼠移到浮層上閱讀

Tooltip 純文字、不可互動、滑鼠離開 trigger 即消失——不適合承載這些需求。

### trigger 不用 Tag 元件

Tag 內建 truncation Tooltip 會跟 OverflowIndicator 的 HoverCard 衝突。改用 `tagVariants` 直接套樣式，保持視覺一致但不含 Tag 的額外行為。

---

## 尺寸

| Size | Trigger 高度 | 文字 |
|------|------------|------|
| sm | `h-5 min-w-5`（20px）| `text-[10px]` |
| md | `h-6 min-w-6`（24px）| `text-caption` |
| lg | `h-6 min-w-6`（24px）| `text-caption` |

sm / md 跟 Tag 同階（20/24px），lg 對齊 md（尺寸需求一致，不需要再大）。

**sm 用 `text-[10px]` 的理由**：sub-footnote 特殊例外,與 Badge 共享「micro-indicator typography」tier——trigger 數字是次要輔助 indicator（非主訊息）,在 20px 小容器內 12px 會擠。完整理由與 pattern-family 說明詳見 `badge.spec.md`「字體例外：`text-[10px]`」。若未來 OverflowIndicator / Badge 以外的元件也需要 sub-footnote 尺寸,應在 typography system 加 `--font-micro` token,再改用 token 而非 arbitrary value。

---

## 禁止事項

- ❌ 用 Tooltip 取代 HoverCard——溢出內容可能需要互動
- ❌ trigger 用 Tag 元件——Tag 內建 Tooltip 會跟 HoverCard 衝突
- ❌ 省略 `+N` 指示器（直接截斷隱藏）——使用者無法知道「還有多少被隱藏」
- ❌ 在 HoverCard 內再嵌 Tooltip——tooltip 是資訊終點，不可巢狀

---

## 為何無 ColorMatrix / StateBehavior

OverflowIndicator 是**承載 count + HoverCard 的 trigger primitive**,無獨立色彩與互動狀態變體:

- **無 ColorMatrix**:trigger 只有 neutral 一種色彩(`circle` 用 `bg-muted` / `tag` 用 `tagVariants` 的 neutral),無 variant 色彩選項——OverflowIndicator 是結構 primitive,色彩屬於 consumer 決策(若需要色相,trigger 的外框 / 內容由 consumer 包)。
- **無 StateBehavior**:trigger 只有 passive display(`cursor-default`),hover 只觸發 HoverCard 開啟,本身無 hover / active / disabled / selected 變化——互動狀態屬於 HoverCard trigger 行為(見 `hover-card.spec.md`),不屬 OverflowIndicator 層級。

對應 anatomy story:保留 `Overview` / `Inspector` / `SizeMatrix`,額外追加元件特有的 `ShapeMatrix`(取代 ColorMatrix 展示 circle vs tag 兩種形狀變體)。

---

## shadcn passthrough 例外說明

OverflowIndicator 是 **composite**(HoverCard trigger + tag-styled `+N` span + HoverCard content + rendered chips list),純 declarative API(`items` array + `visibleCount`)。**不套 `forwardRef` / `...props` spread**:

- **沒有單一 DOM root 可 ref**:consumer 期待 ref 指向「`+N` trigger」還是「HoverCard content」?兩者都不對——前者在 hover 前才出現(conditional),後者在 portal(DOM 離散)
- **`...props` 無明確 spread 目標**:composite 無 identity root wrapper
- **API 邊界明確優先於 DOM 控制**:OverflowIndicator 暴露「溢出計數 + hover 展開」語意,DOM 細節留給底層 HoverCard / Tag

若 consumer 需要程式化控制(trigger refs / custom Portal),應改用 HoverCard + Tag 自組,不透過 OverflowIndicator。`displayName = 'OverflowIndicator'` 保留。

---

## 相關

- `../HoverCard/hover-card.spec.md` — 浮層容器（OverflowIndicator 消費）
- `../Tag/tag.spec.md` — trigger 的 `tagVariants` 樣式來源
- `../Combobox/combobox.spec.md` — 主要消費者（多選溢出）
- `../../patterns/horizontal-overflow/horizontal-overflow.spec.md` — 水平溢出 pattern（OverflowIndicator 是其中的「menu 模式」trigger）
- `../Avatar/avatar.spec.md` — Avatar stack 溢出場景（未來消費者）
