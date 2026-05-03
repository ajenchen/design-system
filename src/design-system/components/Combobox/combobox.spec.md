---
component: Combobox
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Combobox 設計原則

## 定位

Combobox 是**多選下拉**的輸入與顯示元件。選中值以 Tag 陣列呈現，支援單行溢出與多行換行兩種版面。底層走原生 `<select>`（配合 Tag 疊層 overlay）。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Combobox 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker / Material MUI Select 皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

---

## 何時用

- **多選場景**（使用者可選 0 個或多個）：Tag、分類、協作成員、通知訂閱
- **選項數 6+**（少於 6 且 2-5 可見的多選，用 Checkbox stack 更有效）
- **空間受限**：Table cell、toolbar filter、窄欄位 Form
- **需要搜尋或大量選項**：searchable 後可處理 50+ 選項

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單選 | `Select` | Combobox 永遠多選；單選場景強迫使用者每次手動清除再選新的 |
| 2-5 個選項且全部可見 | Checkbox stack（`SelectionItem` 垂直排列）| 全可見 + 掃視快 + 支援描述文字 |
| 階層結構（父/子節點）| `TreeView` | Combobox 是平面選項，沒有層級概念 |
| 布林群組（多個獨立 on/off） | 多個 `Switch` | 每個開關是獨立功能，不是「從清單選」 |

### 與 Checkbox stack 的分界

兩者都能「2-5 個選項裡多選」，判斷與 Select vs RadioGroup 同構（詳見 `../Select/select.spec.md`「與 RadioGroup 的分界」），核心三角度：

- **Progressive disclosure 成本**：Combobox 藏（多一次點擊），Checkbox stack 全露
- **視覺重量**：Combobox O(1)，Checkbox stack O(n) 每個選項各一行
- **評估深度**：Checkbox stack 適合「需要仔細讀選項 / 連帶 description」（權限授予、條款勾選），Combobox 適合「label 自帶語意、快速添加」（tag、分類）

**Fallback**：表單中法律 / 權限類多選一律 Checkbox stack（完整閱讀優先，見 `../Checkbox/checkbox.spec.md`「Clamp 政策」）；Tag / 分類 / 協作成員用 Combobox。

---

## 版面模式（`wrap` prop）

| 模式 | 行為 | 適用場景 |
|------|------|---------|
| 單行（預設） | 固定高度，溢出的 Tag 隱藏，顯示 +N 指示器 | Table cell、空間受限的 Form |
| 多行（`wrap`） | 高度隨內容展開，Tag 自然換行 | 空間充裕的 Form |

### 單行溢出

- 以量測為基礎：計算可用寬度，依序放入 Tag，放不下的隱藏
- 溢出指示器 `+N` 顯示被隱藏的數量
- Hover 溢出指示器時，popover 顯示完整的隱藏 Tag 清單

---

## Tag 操作

### 個別移除

每個 Tag 有 dismiss 按鈕（X），點擊移除該選項。

### 全部清除

`clearable` 在有值時顯示 clear all 按鈕，一次清除所有選項。位於最右側，ChevronDown 左邊。

### 新增選擇

原生 `<select>` 只顯示**未選中**的選項——已選中的不重複出現在下拉。

### Search input 最小寬度 `min-w-[60px]`（documented constant）

多選時 tag 跟 search input 共擠在 `fieldWrapperStyles` 內；input 以 `flex-1 min-w-[60px]` 確保**最少 60px 可打字空間**。低於 60px 會讓 search 輸入變得無法用（使用者看不到自己打什麼）。這是 Combobox 專用 layout 常數，非跨元件 token。

---

## readonly / disabled 的 Tag

- 沒有 dismiss 按鈕——不可操作
- 沒有 ChevronDown——不可新增
- 沒有 clear 按鈕——不可清除
- 溢出行為與 edit 模式相同（+N 指示器）

---

## 禁止事項

- ❌ 不在已選中的選項上再顯示 dismiss 以外的互動——Tag 只能被移除，不能被編輯或重新排序
- ❌ 溢出指示器 `+N` 不可省略——使用者需要知道有多少被隱藏的項目
- ❌ 不自建 dropdown——使用原生 `<select>` 保證無障礙
- ❌ 單選場景用 Combobox——使用者每次需手動清除再選新的，改用 `Select`
- ❌ 法律 / 權限類多選用 Combobox——完整閱讀優先，改用 Checkbox stack（見 Checkbox spec「Clamp 政策」）

---

## A11y 說明

### 鍵盤可達性的 delegation 設計

Combobox 內部結構有多個 `<div>` / `<Tag>` 帶 `onClick`（tag 容器、ChevronDown 區域、搜尋輸入 wrapper 等）——**這些是 mouse 優化的 click-path delegation，不是鍵盤介面**。鍵盤路徑由**隱藏的 native `<select>`** 處理（tab-focusable，Enter/Space 開啟，arrow 導覽，Esc 關閉）。

**設計取捨**:
- ✅ **好處**: 保留原生 `<select>` 的完整 a11y（包含 mobile screen reader + 語音輸入 + 所有 OS-level 整合）
- ⚠️ **後果**: 非 button 元素帶 `onClick` 是 mouse-only 互動,鍵盤使用者不經過它們——但他們也不需要（native select 路徑涵蓋所有功能）

**為什麼不 role="button" + tabIndex**: 若每個 click target 都加 `role="button" tabIndex={0}` 會**偷走 native select 的 tab focus**,反而破壞鍵盤體驗。"單一 native tab stop + 多個 mouse click surface" 是 world-class 混合 control 的 canonical pattern（Material / Atlassian / GitHub issue filter 共識）。

**結論**: Combobox 多處 `onClick` 在非 button 元素上**是經過評估的 acceptable a11y 模式**,不是需要修復的 bug。

---

## 相關

- `../Select/select.spec.md` — 單選對應元件；「與 RadioGroup 的分界」是 Combobox vs Checkbox stack 的 framework 來源
- `../Checkbox/checkbox.spec.md` — Checkbox stack（多選全可見場景）
- `../TreeView/tree-view.spec.md` — 階層式選擇
- `../Switch/switch.spec.md` — 布林開關群組
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `overflow-indicator.spec.md`
- `people-picker.spec.md`
- `select-menu.spec.md`
- `tag.spec.md`
