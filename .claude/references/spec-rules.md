# Spec 規則 — 詳細展開

Canonical `packages/design-system/ds-canonical/rules/spec-rules.md` 的詳表。主章留核心原則,本檔放 SSOT 判斷 + 邊界案例 scope default + 禁止清單。

## SSOT 結構規則

跨元件比較由**一個 spec own 完整內容,其他 spec 用一行 pointer 指回**。

**何時需要 SSOT(深度比較)**:
- 多維度分析(如「與 X 的分界」分多個角度)
- 情境對照表 > 3 rows
- 涉及另一元件的內部機制 / 權衡

**何時不需要(本地引用即可)**:
- 「何時不用」表格一行帶過(「改用 X」+ 原因)— 兩側並存不會漂移
- 「相關」links section 列出
- 只描述自己元件的 props / variants / state

**Ownership 判斷順序**:
1. 通用預設元件 own(Select owns vs RadioGroup、Input owns vs NumberInput — 通用者是 fallback)
2. 一側 spec 明顯更深 / 另一側薄 wrapper → 深側 own(Tabs owns vs SegmentedControl)
3. 兩側對等都需要 → 按字母序決定 anchor

**執行規則**:
- Own 方寫深度 section;被指方寫一行 pointer(**reciprocal 必須存在,不可單向**)
- Pointer 必須明確指出 anchor spec + section 名稱
- 本專案目前的 SSOT anchors:
  - Tabs vs SegmentedControl → `tabs.spec.md`「Tabs 與 SegmentedControl 的分界」
  - Select vs RadioGroup → `select.spec.md`「與 RadioGroup 的分界」
  - Checkbox vs Switch → `checkbox.spec.md`「與 Switch 的分界」
  - HoverCard vs Tooltip → `hover-card.spec.md`「與 Tooltip 的分界」
  - Row primitives 共用 → `patterns/element-anatomy/item-anatomy.spec.md`
  - Field Controls 共用 → `components/Field/field-controls.spec.md`

**禁止事項**:
- ❌ 兩 spec 都寫完整對照(保證漂移)
- ❌ 建孤立 `xxx-selection.spec.md` / `xxx-comparison.spec.md` 承載比較 — 世界級 DS 都把比較放元件 spec 內
- ❌ 單向指向(A → B,B 沒指回 A)
- ❌ Pointer 只說「見 X spec」不說 section 名稱

## 邊界案例覆蓋(Scope 預設 — 減少重複)

適用狀態必須有明確說明 — disabled / loading / empty、dark mode / density、icon-only。不適用則明文「本元件無 X 狀態」,不沉默省略。

**Scope 預設**:
- **Field 家族**(Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea / Switch / Slider / SegmentedControl / Checkbox / RadioGroup)→ 直接寫「Mode / disabled / readonly 詳 `field-controls.spec.md`」
- **Dark mode**:元件靠 semantic token 切換(無自訂 palette)→ 「Dark mode 由 semantic token 自動處理(見 `color.spec.md`)」
- **Density**:元件用 `--field-height-*` / `--layout-space-*` → 「Density 由 token 自動切換」
- **純 wrapper**(無互動狀態,如 Separator / Skeleton / CircularProgress / ProgressBar)→ 「本元件無互動狀態」一行帶過

元件特有(non-inherit)狀態必展開寫;繼承自 family / token 的行為 pointer 即可。

## spec.md 與 .tsx 職責分離

- spec 只記錄設計原則(「為什麼」「何時用」)— 讓 AI 能舉一反三推導邊緣情況
- 可程式化規則(具體 token class / pixel 值 / 條件邏輯)寫進 `.tsx`
- 判斷標準:「這條規則能直接變成 code 嗎?」能 → .tsx;不能、需要人類判斷 → spec
- 可推導的值用 `calc()` / 公式表達,不硬寫結果(例:divider 內縮 = `(行高 - 文字行高) / 2`)
