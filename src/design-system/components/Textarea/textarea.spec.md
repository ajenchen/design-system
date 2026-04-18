# Textarea 設計原則

## 定位

Textarea 是**多行文字**的輸入與顯示元件——Input 的多行版本。格式化邏輯為 identity（value → value）。

**實作基礎**：native `<textarea>` + 橋接 DS token，無 external primitive base。shadcn 同類做法。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Textarea 特有的原則。

---

## 何時用

- **多行 / 長文字輸入**：評論、描述、備註、文章草稿、bio、issue content
- **使用者需要看到已輸入的全部內容**：邊寫邊 review（不像 Input 捲動）
- **內容可能包含換行**：段落、列表、程式碼片段
- **沒有字符數強限制的自由輸入**：content editor、markdown 編輯器 body

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單行文字（姓名、標題、URL、search）| `Input` | 單行用 Input，鍵盤 Enter 應該 submit 而非換行 |
| 數字 | `NumberInput` | 數字不該是自由多行文字 |
| 富文本 / WYSIWYG 編輯 | 專用 rich-text editor | Textarea 是純文字 |
| 搜尋輸入（即使可能長）| `Input` + `Combobox`（searchable）| 搜尋慣例是單行 + instant feedback |
| Code 編輯 | 專用 code editor（Monaco / CodeMirror）| Textarea 無語法 highlight / auto-complete |

---

## 與 Input 的差異

| | Input | Textarea |
|---|---|---|
| 行數 | 單行 | 多行（`rows` prop 控制預設）|
| 高度 | 固定 `h-field-*` | 由 rows / min-h 決定，支援 `resize-y` |
| Padding | `items-center`（單行垂直置中）| `py-2`（上下固定內距，多行需閱讀空間）|
| startIcon / endAction | 支援 | ❌ 不支援（textarea 慣例無 icon 框內）|
| Enter 鍵 | 觸發 form submit | 換行 |
| Readonly 呈現 | 同高度、灰底 | 保留邊框 + padding（讓多行文字有閱讀區）|

---

## Rows / 高度控制

- **`rows` prop**：預設 `3`，控制初始可見行數
- **`resize-y`**：使用者可手動拖拉下邊緣垂直 resize
- **`min-h-*` className**：消費者可透過 Tailwind utility 覆寫最小高度
- **禁止 `resize: horizontal` 或 `both`**：水平 resize 破壞 form 佈局

---

## Size

| Size | 字體 | 使用場景 |
|------|------|---------|
| sm / md | `text-body`（14px） | 一般 form / comment |
| lg | `text-body-lg`（16px） | 長篇閱讀（bio editor、article body）|

sm 與 md 視覺相同（純命名 mapping，對齊 Field family）。

---

## Mode（edit / readonly / disabled）

共用規則見 `../Field/field-controls.spec.md`「Mode」段——三 mode 的色彩 / 互動 / aria 規則 Textarea 全部對齊。

### Readonly 特例

不同於 Input 的 readonly（同高度、緊湊底色），Textarea readonly **保留邊框與 padding**——多行內容需要明確的閱讀區域邊界，完全扁平會讓使用者誤以為可編輯或混在純文字內容中。

---

## 禁止事項

- ❌ 把 Input 強制換行使用（撐高、ignore Enter 為 submit）——多行用 Textarea
- ❌ Textarea 裡放 startIcon / endAction——textarea 慣例無 icon 框內
- ❌ Textarea 啟用水平 resize（`resize-x` / `resize: both`）——破壞 form 佈局
- ❌ 把 Textarea 當 code editor 用（無 syntax highlight / auto-complete）
- ❌ Readonly 時扁平化（移除邊框 + padding）——多行內容需要閱讀區域邊界

---

## 相關

- `../Input/input.spec.md` — 單行文字的對應元件
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / error / focus）
- `../Field/form-validation.spec.md` — blur 驗證標準（多行輸入的驗證時機）
- `../LinkInput/link-input.spec.md` — URL 特殊處理
