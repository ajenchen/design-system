# Alert 設計原則

## 定位

Alert 是**持久性通知**，嵌入在頁面中。用於系統狀態提示、警告、錯誤訊息。使用者需要主動 dismiss 或處理。

**實作基礎**：消費 Notice primitive（共享 Toast 的 layout + icon + theme 策略）。

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。Alert 透過 Notice 繼承 Family 2 結構。

---

## 何時用

- **頁面內需要持續存在的狀態通知**：方案即將到期、帳戶驗證未完成、需要更新付款方式
- **頂部全域警告**（`placement="fixed"`）：系統維護中、服務降級、重要公告
- **表單 / Dialog 內的 inline 提示**：複雜動作的前置警告（刪除前的資料影響說明）
- **需要使用者處理才會消失的訊息**：有 CTA 可以解決問題、或需明確按下 dismiss

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 操作結果短暫回饋（儲存成功、刪除失敗）| `Toast` | Toast 自動消失，不佔頁面空間 |
| 需要阻斷背景互動 | `Dialog` | Alert 是 inline，不阻斷 |
| 欄位級驗證錯誤 | Field error message | Alert 是頁面級，欄位錯誤靠在欄位下方 |
| 成功訊息需要使用者確認 | `Toast`（非阻斷）/ `Dialog`（需確認）| Alert 的持久成本對成功訊息太高 |

---

## 與 Toast / Notice 的分界

**本節是 SSOT**——Toast spec 反向引用此節，避免兩側漂移。

- **Alert**：持續顯示的 on-page 通知，使用者需主動 dismiss 或永不關閉（如頂部全域警告）
- **Toast**：短暫浮動通知，自動消失（預設 3–5 秒）
- **Notice**：兩者共用的內部 layout primitive，consumer **不直接使用**（由 Alert / Toast 消費）

**判斷法**：問「這個訊息重要到需要使用者 acknowledge 嗎？」

- 是（方案到期、帳戶未驗證、系統維護中、錯誤需要處理）→ **Alert**
- 否（儲存成功、已複製、上傳完成）→ **Toast**

---

## 禁止事項

- ❌ **不在 Alert 內放長篇內容**：Alert 是摘要 + CTA,超過 2–3 行的內容改用 Dialog 或導向獨立頁面
- ❌ **不把 error form validation 做成 Alert**：欄位級錯誤必須貼近發生位置（FieldError）,使用者才能快速定位；頁面級 Alert 只放非欄位的整體錯誤（如提交失敗、權限不足）
- ❌ **Alert 不疊 Alert**：同區出現多個 Alert 視覺雜訊重,整理成一組 messages 或合併為單一 Alert with list
- ❌ **destructive 操作確認不用 Alert**：刪除 / 離開等需要明確確認的動作用 Dialog,Alert 無法承載 confirm / cancel 雙按鈕的阻斷流程

---

## A11y 預設

- **預設**：`role="alert"` + `aria-live="polite"`——screen reader 在空閒時讀出 Alert 內容，不中斷使用者目前動作
- **error variant 可升級**：`aria-live="assertive"` 中斷 screen reader 目前朗讀，立即讀出 Alert（僅用於真正 critical 的錯誤，避免濫用干擾）
- **dismiss 按鈕**：必須有 `aria-label`（如「關閉通知」），使用 `ItemInlineActionButton`
- **CTA 按鈕**：放在 Alert 內時 size 固定為 `xs` tertiary,文字描述動作（「前往設定」「立即更新」）

---

## Appearance

### Subtle

淺底色 + 四邊 1px border（色相 hover 色）：

| Variant | Bg | Border | Icon 色 |
|---|---|---|---|
| neutral | `bg-muted` | `border-border` | `text-fg-muted` |
| info | `bg-info-subtle` | `border-[var(--info-hover)]` | `text-info-text` |
| success | `bg-success-subtle` | `border-[var(--success-hover)]` | `text-success-text` |
| warning | `bg-warning-subtle` | `border-[var(--warning-hover)]` | `text-warning-text` |
| error | `bg-error-subtle` | `border-[var(--error-hover)]` | `text-error-text` |

不設 `data-theme`，元素跟隨頁面 theme。Subtle bg 在 light/dark 都有足夠對比。

### Solid

飽和底色，跟 Toast 完全相同的 theme 策略：

| Variant | Bg | data-theme | 視覺 |
|---|---|---|---|
| neutral | `bg-surface-raised` | `{inverse}` | 跟頁面相反 |
| info | `bg-info` | `"dark"` | 藍底白字 |
| success | `bg-success` | `"dark"` | 綠底白字 |
| warning | `bg-warning` | `"light"` | 黃底深字 |
| error | `bg-error` | `"dark"` | 橘底白字 |

## Placement

| 值 | 圓角 | Border | 用途 |
|---|---|---|---|
| `inline`（預設） | `rounded-md`（4px） | 有 | 頁面內嵌 |
| `fixed` | 無（`rounded-none`） | 無 | header 底下全域警告 |

Alert 是 inline 容器（不是浮層），用 `rounded-md`（4px）。Toast 是浮層用 `rounded-lg`（8px）。

## 為何無 Inspector / SizeMatrix

- **無 Inspector**:Alert 的關鍵決策維度是 `variant`(5 色)× `appearance`(subtle / solid)× `placement`(inline / fixed),已在 `ColorMatrix` 完整呈現 variant × appearance 矩陣,再加 `PlacementMatrix` 呈現 placement——互動切換式 Inspector 不會比這兩張矩陣更能傳達 Alert 的設計規格。
- **無 SizeMatrix**:Alert 無 `size` prop,其視覺尺寸繼承自 Notice primitive(14px body / 16px icon / fixed padding),不隨 density 變動。尺寸規格由 `Notice` spec own。改 Notice 時 Alert 自動跟進,不需要 Alert 有獨立 SizeMatrix。

對應 anatomy story:保留 `Overview` + `ColorMatrix` + `StateBehavior` + 元件特有 `PlacementMatrix`。

---

## API

```tsx
<Alert variant="warning" title="即將到期" description="您的方案將在 3 天後到期" />
<Alert variant="error" appearance="solid" title="系統錯誤" />
<Alert variant="info" placement="fixed" title="系統維護中，部分功能暫停" />
```

## 相關

- `../Notice/notice.spec.md` — Alert 消費的 layout primitive（與 Toast 共用）
- `../Toast/toast.spec.md` — 非阻斷短暫通知（同一套視覺策略）
- `../Dialog/dialog.spec.md` — 需要阻斷背景的警告改用 Dialog
