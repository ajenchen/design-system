# OverflowIndicator 設計原則

## 定位

OverflowIndicator 是 **`+N` 溢出指示器 + HoverCard 顯示隱藏內容**——當 row / container 中的項目無法全部顯示時，剩餘項目以 `+N` 形式提示，hover 展開完整清單。

**實作基礎**：自建 internal primitive——消費 HoverCard + tagVariants，無直接 external primitive base。

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

## 相關

- `../HoverCard/hover-card.spec.md` — 浮層容器（OverflowIndicator 消費）
- `../Tag/tag.spec.md` — trigger 的 `tagVariants` 樣式來源
- `../Combobox/combobox.spec.md` — 主要消費者（多選溢出）
- `../../patterns/horizontal-overflow/horizontal-overflow.spec.md` — 水平溢出 pattern（OverflowIndicator 是其中的「menu 模式」trigger）
- `../Avatar/avatar.spec.md` — Avatar stack 溢出場景（未來消費者）
