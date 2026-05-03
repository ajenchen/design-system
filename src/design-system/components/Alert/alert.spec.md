---
component: Alert
family: null
traits:
  - hasVariants
  - hasInteractiveStates
variants: {}
sizes: {}
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
- ❌ **body action row 不得混入 close X**:close X 必在 chrome corner action group,不可跟 CTA 擺在同一 row(違反 same-row consistency — CTA 是 labeled Button sm tertiary,close X 是 Button iconOnly sm dismiss,box size 與視覺分量不同,同 row 會造成 gap / 對齊錯亂)。完整規則見 `patterns/element-anatomy/inline-action.spec.md`「Same-row consistency rule(防混用)」節
- ❌ **close X 不用 Inline Action 或自刻 `<button><X /></button>`**:corner 屬 action group region,必用 `<Button iconOnly dismiss size="sm" />`(見上方 Chrome corner close X canonical)

---

## A11y 預設

- **預設**：`role="alert"` + `aria-live="polite"`——screen reader 在空閒時讀出 Alert 內容，不中斷使用者目前動作
- **error variant 可升級**：`aria-live="assertive"` 中斷 screen reader 目前朗讀，立即讀出 Alert（僅用於真正 critical 的錯誤，避免濫用干擾）
- **Close X 按鈕**：必須有 `aria-label`(如「關閉通知」),實作見下方「Chrome corner close X canonical」
- **CTA 按鈕**：放在 Alert body action row 時 size 固定為 `xs` tertiary,文字描述動作(「前往設定」「立即更新」)

---

## Chrome corner close X canonical

Alert 右上角的 close X **必須用 `<Button iconOnly dismiss size="sm" />`**,不是 Inline Action、不是自刻 button。

**為什麼是 Button(Cat 3 Action group region)而非 Inline Action**:
- Alert 的 chrome corner 屬 **action group region**(toolbar / chrome corner / standalone 類),實務上 close 左側可並排 refresh / share / minimize 等額外 action + `<Separator orientation="vertical" />`——一旦成為 action group,所有成員必同類(same-row consistency),統一 Button iconOnly
- Inline Action 是「embedded 在 host 內部的 tap target」(Cat 1,如 Input clear X / Tag dismiss X),不參與 action group 規則,兩者不可混用
- `dismiss` prop 自動套 `variant="text"` + `fg-muted → hover foreground` 弱化,視覺輕量不壓過內容

**只有 X close(dismiss 語意「關閉 surface」)才套 `dismiss` prop**——Trash / Delete / Clear / Remove 不屬 dismiss,不套此 prop。

SSOT 詳見 `patterns/element-anatomy/inline-action.spec.md`「Predicate:Inline Action vs Button iconOnly(canonical)」+「Dismiss canonical — X close only」章節;Button 端詳見 `components/Button/button.spec.md`「Dismiss 視覺類」段。

### Corner action group 佈局 canonical

Alert chrome corner 可承載多個 action(close 左側並排):

```
┌─ Alert ────────────────── [⟲] │ [X] ┐   ← chrome corner action group(Button sm)
│ [icon] Title                         │     refresh / share / minimize 等 + Separator + close X
│ Description                          │
│                      [CTA1] [CTA2]   │   ← body action row(Button sm tertiary)
└──────────────────────────────────────┘
```

**規則**:
- 同一 action group 所有 Button 同 `size="sm"`(跟 close X 對齊)
- 多 action 之間用 `<Separator orientation="vertical" />` 分群(`refresh / share` 一群,`close` 一群)
- 若只有 close X 則不需要 Separator(單一 action 即 group)

**世界級對照**:
- **Material Banner**(`<Banner actions={[...]}/>` 右上 close + 可加 refresh)
- **Polaris Banner**(`onDismiss` 走 IconButton,右上 action group)
- **VS Code editor tab** window corner(close + pin + split,全部同 size IconButton)
- **Figma panel corner**(close + collapse 同 group,Separator 分隔)

### Multi corner action 場景

目前 Alert API 只透過 `dismissible` 渲染單一 close X。多 corner action 場景目前不支援;若未來 consumer 有需求,走 Checkpoint 3 決策(M8 benchmark + consumer survey),不預先投機擴 API。

---

## Appearance

### Subtle(預設)

淺底色 + 四邊 1px border(邊框採語意色的 hover tint)。99% 場景用 subtle——視覺重量適中,使用者注意但可繼續主要任務。不設 `data-theme`,元素跟隨頁面 theme。

### Solid

飽和底色,跟 Toast 完全相同的 theme 策略(critical severity 場景:info / success / error 走 dark theme 白字,warning 走 light theme 深字以保對比)。一個頁面最多一個 solid Alert。

Subtle vs Solid 的完整 variant × theme class 對照見 anatomy `ColorMatrix` story。

## Placement

- **`inline`(預設)**:頁面內嵌,圓角 + 邊框,像一張 card 嵌在內容區塊裡
- **`fixed`**:頂部全域警告,無圓角無邊框,橫跨頁面寬度

**為什麼兩種 placement 的圓角不同**:inline 是 content-level card(rounded-md = 4px,對齊 Alert 的 inline 容器身份,與 Dialog / Card 一致);fixed 是 page-level bar(無 radius,橫跨畫面形成整條)。Toast 是浮層用 `rounded-lg`(8px,浮層慣例),跟 Alert 區分。

完整 placement 對照見 anatomy `PlacementMatrix` story。

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

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
- `skeleton.spec.md`
