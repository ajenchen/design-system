---
component: Alert
family: 2
traits:
  - hasVariants
  - hasInteractiveStates
variants:
  neutral:
    when: "中性提示(系統公告、非緊急說明);無情緒色"
    world-class: ["Ant Alert type=info(neutral)", "Polaris Banner default"]
  info:
    when: "資訊性提示(版本更新、流程說明);藍色 hue"
    world-class: ["Ant Alert type=info", "Material Alert severity=info", "Carbon InlineNotification kind=info"]
  success:
    when: "成功狀態的持久性宣告(綁定生效、付款完成需保留確認)"
    world-class: ["Ant Alert type=success", "Polaris Banner status=success"]
  warning:
    when: "警告但非阻斷(方案即將到期、需更新付款方式);最高頻使用"
    world-class: ["Ant Alert type=warning", "Polaris Banner status=warning", "Material Alert severity=warning"]
  error:
    when: "錯誤但非阻斷(系統錯誤但可重試、API 失敗摘要);搭配 aria-live=assertive"
    world-class: ["Ant Alert type=error", "Polaris Banner status=critical", "Carbon InlineNotification kind=error"]
sizes: {}
benchmark:
  - Ant Design Alert: github.com/ant-design/ant-design/tree/master/components/alert
  - MUI Alert: github.com/mui/material-ui/tree/master/packages/mui-material/src/Alert
  - Carbon Notification: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Notification
  - Polaris Banner: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Banner
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Alert 設計原則

## 定位

Alert 是**持久性通知**，嵌入在頁面中。用於系統狀態提示、警告、錯誤訊息。使用者需要主動 dismiss 或處理。

**實作基礎**：消費 Notice primitive（共享 Toast 的 layout + icon + theme 策略）。

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）**——由 Notice primitive own（Notice 消費 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」reading-mode 規格），Alert 透過 Notice 間接繼承,不直接消費 item-anatomy。

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

頂部全域警告同理走 Alert（`placement="fixed"`）：fixed 是**頁面流內**的持久 bar（非 position fixed 浮層），與 Toast 浮層分屬不同層，不互相取代、不衝突。

---

## 禁止事項

- ❌ **不在 Alert 內放長篇內容**：Alert 是摘要 + CTA,超過 2–3 行的內容改用 Dialog 或導向獨立頁面
- ❌ **不把 error form validation 做成 Alert**：欄位級錯誤必須貼近發生位置（FieldError）,使用者才能快速定位；頁面級 Alert 只放非欄位的整體錯誤（如提交失敗、權限不足）
- ❌ **Alert 不疊 Alert**：同區出現多個 Alert 視覺雜訊重,整理成一組 messages 或合併為單一 Alert with list
- ❌ **destructive 操作確認不用 Alert**：刪除 / 離開等需要明確確認的動作用 Dialog,Alert 無法承載 confirm / cancel 雙按鈕的阻斷流程
- ❌ **兩個 action 區域不混用**:chrome corner 只放 close X(必用 `<Button iconOnly dismiss size="xs" />`,不是 Inline Action、不是自刻 `<button><X /></button>`,見下方 Chrome corner close X canonical);body action row 只放 CTA(Button xs tertiary)。close X 混入 body action row 違反 same-row consistency(box size 與視覺分量不同,造成 gap / 對齊錯亂),完整規則見 `patterns/element-anatomy/inline-action.spec.md`「Same-row consistency rule(防混用)」節

---

## A11y 預設

- **一般提示（neutral / info / success）**：`role="status"` + `aria-live="polite"`——screen reader 在空閒時讀出 Alert 內容，不中斷使用者目前動作
- **緊急提示（warning / error）**：`role="alert"` + `aria-live="assertive"`——立即中斷 screen reader 目前朗讀讀出內容。「緊急與否」的界線即 variant 選擇本身：選 warning / error 即 assertive,依 variant 自動套用，無 per-instance 切換 API
- **Close X 按鈕**：必須有 `aria-label`(如「關閉通知」),實作見下方「Chrome corner close X canonical」
- **CTA 按鈕**：放在 Alert body action row 時 size 固定為 `xs` tertiary,文字描述動作(「前往設定」「立即更新」)

---

## Chrome corner close X canonical

Alert 右上角的 close X **必須用 `<Button iconOnly dismiss size="xs" />`**,不是 Inline Action、不是自刻 button。

**為什麼是 Button(Cat 3 Action group region)而非 Inline Action**:
- Alert 的 chrome corner 屬 **action group region**(toolbar / chrome corner / standalone 類),實務上 close 左側可並排 refresh / share / minimize 等額外 action + `<ButtonDivider />`——一旦成為 action group,所有成員必同類(same-row consistency),統一 Button iconOnly
- Inline Action 是「embedded 在 host 內部的 tap target」(Cat 1,如 Input clear X / Tag dismiss X),不參與 action group 規則,兩者不可混用
- `dismiss` prop 自動套 `variant="text"` + `fg-muted → hover foreground` 弱化,視覺輕量不壓過內容

**只有 X close(dismiss 語意「關閉 surface」)才套 `dismiss` prop**——Trash / Delete / Clear / Remove 不屬 dismiss,不套此 prop。

SSOT 詳見 `patterns/element-anatomy/inline-action.spec.md`「Predicate:Inline Action vs Button iconOnly(canonical)」+「Dismiss canonical — X close only」章節;Button 端詳見 `components/Button/button.spec.md`「Dismiss 視覺類」段。

### Corner action group 佈局 canonical

Alert chrome corner 可承載多個 action(close 左側並排):

```
┌─ Alert ────────────────── [⟲] │ [X] ┐   ← chrome corner action group(Button xs)
│ [icon] Title                         │     refresh / share / minimize 等 + ButtonDivider + close X
│ Description                          │
│                      [CTA1] [CTA2]   │   ← body action row(Button xs tertiary)
└──────────────────────────────────────┘
```

**規則**:
- 同一 action group 所有 Button 同 `size="xs"`(跟 close X 對齊)
- 多 action 之間用 `<ButtonDivider />` 分群(`refresh / share` 一群,`close` 一群)——Button 家族 action group 專用 divider(`button-group.tsx`,`role="separator"` 自帶 mx-1),canonical story 同此
- 若只有 close X 則不需要 ButtonDivider(單一 action 即 group)

**世界級對照**:
- **Material Banner**(`<Banner actions={[...]}/>` 右上 close + 可加 refresh)
- **Polaris Banner**(`onDismiss` 走 IconButton,右上 action group)
- **VS Code editor tab** window corner(close + pin + split,全部同 size IconButton)
- **Figma panel corner**(close + collapse 同 group,divider 分隔)

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
- **無 SizeMatrix**:Alert 無 `size` prop,其視覺尺寸繼承自 Notice primitive(14px body / 16px icon / 固定 py),字級與垂直 padding 不隨 density 變動;僅 `placement="fixed"` 的水平 px 走 `--layout-space-loose`(density-aware,跟周圍 loose-padding 佈局對齊,見 alert.tsx)。尺寸規格由 `Notice` spec own。改 Notice 時 Alert 自動跟進,不需要 Alert 有獨立 SizeMatrix。

對應 anatomy story:保留 `Overview` + `ColorMatrix` + `StateBehavior` + 元件特有 `PlacementMatrix`。

---

## API

```tsx
<Alert variant="warning" title="即將到期" description="您的方案將在 3 天後到期" />
<Alert variant="error" appearance="solid" title="系統錯誤" />
<Alert variant="info" placement="fixed" title="系統維護中，部分功能暫停" />
```

---

## 邊界案例

- **Disabled(dismiss button)**:Alert **不提供 dismiss 停用 API**——banner dismiss 恆可用(對齊 Polaris / Material Banner:通知關閉鈕應永遠可按)。Alert 本身亦無 `disabled` prop(持久通知不該被禁用)。若需防止 close action(API in-flight)被雙擊,consumer 在 `onDismiss` 內自行 debounce / 加上層鎖,不在 UI 層加 disable(Alert 不提供 dismiss 停用 API、也不把 disabled 轉傳給內部 dismiss Button;Button primitive 本身支援 disabled,但 Alert 刻意不開洞)。
- **Loading**:Alert 本身不需 loading state(非 async surface);若 Alert body action row 內 CTA 在 async 動作中,該 Button 自己處理 `loading` prop。
- **Empty / icon-only**:Alert 必有 `title`(API contract),無 empty 場景;若無 description 則僅顯示 title + icon,layout 自動收斂。
- **極長字串**:title 單行 truncate、description 自由換行不截斷(皆繼承 ItemContent 預設);description 超過 2–3 行屬誤用,改 Dialog(見禁止事項)。

## 相關

- `../Notice/notice.spec.md` — Alert 消費的 layout primitive（與 Toast 共用）
- `../Toast/toast.spec.md` — 非阻斷短暫通知（同一套視覺策略）
- `../Dialog/dialog.spec.md` — 需要阻斷背景的警告改用 Dialog

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `dialog.spec.md`
- `empty.spec.md`
- `notice.spec.md`
- `skeleton.spec.md`
- `toast.spec.md`
