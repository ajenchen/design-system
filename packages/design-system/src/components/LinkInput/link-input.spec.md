---
component: LinkInput
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design Input: github.com/ant-design/ant-design/tree/master/components/input
  - MUI TextField: github.com/mui/material-ui/tree/master/packages/mui-material/src/TextField
---

# LinkInput 設計原則

## 定位

LinkInput 是 **URL 的**輸入與顯示元件。外觀基於 Input，但 value 以藍色連結樣式呈現，可直接點擊開啟。核心互動差異：**點擊 value 是開啟連結，不是進入編輯**。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 LinkInput 特有的原則。

## Controlled-only rationale(Dim 26)

本元件採 **controlled-only**:`value` + `onChange`,不支援 `defaultValue` uncontrolled fallback(value pair V1)。對齊 Field 家族 canonical(Combobox / DatePicker / TimePicker / SelectMenu 同,rationale 見各 spec 同名段);LinkInput 內部另有「連結顯示 ↔ 編輯中」狀態與 `value` 雙向 sync,dual-mode 會引入 race condition。未來要改 dual-mode 需 `useControllableState` helper,屬 major API 擴充。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **需要儲存的外部 URL**：網站連結、文件 URL、repo 地址、社群連結
- **顯示時使用者希望直接點開**：在 readonly / table cell / 設定頁可點擊開啟
- **需要 URL 格式驗證**（blur 時驗證 protocol + 結構）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純字串 slug（`my-project-name`）| `Input` | 不是完整 URL，不需驗證 protocol 與點擊開啟 |
| Email 地址 | `Input` + `type="email"` | Email 不是 URL,`mailto:` 點擊體驗取決於 OS 設定,非核心需求 |
| 內部 React Router 路徑 | `Input`（或自訂元件）| Router 路徑不是絕對 URL,LinkInput 的 protocol 驗證會 false reject |
| Markdown 連結（顯示文字 + URL）| 自訂編輯器 | LinkInput 只處理 URL value,不處理 display text 搭配 |
| URL 清單（多個 URL）| 多個 LinkInput 或自訂清單元件 | 單一 LinkInput 一次一個 URL |

---

## 兩種顯示狀態（edit mode 內）

### Link 狀態

有合法 URL 且未在編輯中時：
- value 以 `text-primary` 藍色顯示，hover 加底線，點擊開啟連結
- 右側 Pencil inline action 觸發編輯模式
- 點擊 value 是開啟連結，不是編輯——這是 LinkInput 與 Input 的核心互動差異

### Input 狀態

正在編輯、無值、或 URL 格式不合法時：
- 外觀與 Input 一模一樣（bareInput + placeholder）
- blur 時驗證格式，合法則自動切回 link 狀態
- 格式不合法維持 input 狀態 + error 邊框，直到格式正確

---

## 驗證

遵循 Field 共用驗證標準（blur validation）：

1. **blur 時驗證**——使用者離開 field 時才檢查格式
2. **開始打字時清除 error**——輸入任一字元即移除錯誤狀態(Escape 還原原值亦清除);單純重新 focus 不清除
3. **Enter 觸發 blur**——等同離開 field
4. **Escape 取消編輯**——回復原值，不觸發驗證

URL 格式要求：必須包含 `http://` 或 `https://` protocol。

---

## 空值

沒有 URL 時直接顯示 placeholder 並允許輸入，不需要先按 Pencil——因為沒有連結可以開。

---

## 極長 URL（邊界）

- **顯示文字 = hostname**:link 狀態預設只顯示 hostname（去 `www.`,如 `https://github.com/org/repo` → `github.com`）,非完整 URL;`label` prop 可覆寫顯示文字。完整 URL 載於 `href`
- **單行 truncate**:link / readonly / display 狀態超寬時 ellipsis 截斷,不換行
- **編輯態**:原生 input 水平捲動,無長度上限

---

## readonly / disabled

與其他 Field 一致：
- readonly：顯示藍色連結（可點擊），無 Pencil action
- disabled：連結灰化，不可點擊

---

## 禁止事項

- ❌ 不在 link 狀態下讓點擊 value 進入編輯——點擊連結必須開啟連結
- ❌ 不在打字過程中即時驗證格式——等 blur
- ❌ 不省略 protocol（http/https）驗證——裸 domain 不是合法 URL

---

## 為何無 StateBehavior

LinkInput 是 **Field Controls family 成員**——互動狀態(focus / invalid / disabled / readonly)完全繼承 `../Field/field-controls.spec.md` SSOT「Mode 狀態」。LinkInput 特有的狀態(edit 輸入 vs display link-chip)已在 `Overview` 中說明。重寫 StateBehavior = 與 field-controls SSOT 漂移。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix` + `Accessibility`。互動 state 見 Input 的 `StateBehavior` + field-controls.spec.md。

---

## 相關

- `../Input/input.spec.md` — 純文字 / slug / email 等非 URL 場景
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）
- `../Field/form-validation.spec.md` — blur 驗證標準

## A11y 預設

**ARIA / Pattern**:native `<input type="url">` element 預設 a11y;label 關聯靠 `id`(`fieldCtx.id`)+ FieldLabel `<label htmlFor>`(native `for` 機制);input 上另設 `aria-invalid` / `aria-describedby`(error 時 `aria-errormessage`)。

**Keyboard 行為**:

- Tab — focus
- 字母鍵 — 輸入
- Enter — 提交,觸發 blur 驗證
- Esc — 取消編輯,回復原值,不觸發驗證

**Focus**:原生 input outline 已關閉;focus 視覺提示由 Field wrapper 的 `focus-within:!border-primary` 提供(滑鼠點入也亮藍框,對齊 Field wrapper canonical)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-item.spec.md`
- `input.spec.md`
- `textarea.spec.md`
