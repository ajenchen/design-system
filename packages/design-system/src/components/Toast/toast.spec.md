---
component: Toast
family: 2
traits:
  - hasVariants
variants:
  neutral:
    when: "非狀態通知;一般 announcement / tip(『已複製到剪貼簿』『偏好已儲存』)"
    world-class: ["Polaris Toast default", "Sonner default", "Linear toast neutral"]
  info:
    when: "資訊性提示(『新版本可用』『同步完成』);非錯誤、非成功"
    world-class: ["Material Snackbar info", "Ant notification info"]
  success:
    when: "成功確認(『訂單已寄送』『付款完成』『5 筆資料已匯入』)"
    world-class: ["Polaris Toast success", "Linear toast success", "Stripe payment success"]
  warning:
    when: "可恢復警告(『有未儲存變更』『連線不穩』『token 將過期』)"
    world-class: ["Ant notification warning", "Carbon Notification warning"]
  error:
    when: "錯誤(『匯入失敗』『權限不足』『網路斷線』);action prop 可加重試"
    world-class: ["Polaris Toast error", "Material Snackbar error", "Linear toast error"]
sizes: {}
benchmark:
  - Radix Toast primitive: github.com/radix-ui/primitives/tree/main/packages/react/toast
  - Polaris Toast: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Toast
  - MUI Snackbar: github.com/mui/material-ui/tree/master/packages/mui-material/src/Snackbar
  - Carbon Notification: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Notification
  - Ant Design notification: github.com/ant-design/ant-design/tree/master/components/notification
---

# Toast 設計原則

## 定位

Toast 是**短暫的浮動通知，自動消失**。用於操作結果回饋（成功 / 失敗 / 警告）。不阻斷使用者操作。

**實作基礎**：基於 sonner（浮動管理）+ 消費 Notice primitive（layout + icon + theme 策略，與 Alert 共用）。

**Layout Family**：本元件是 `patterns/element-anatomy/item-anatomy.spec.md` 所擁有的 **Family 2（List item layout）** 消費者。結構繼承其「List item layout」章節的 reading-mode 規格；Toast 透過 Notice 繼承 Family 2 結構。

---

## 何時用

- **操作結果短暫回饋**：儲存成功、訊息已送出、已複製到剪貼簿、刪除失敗
- **背景非同步動作完成**：檔案上傳完成、資料同步完成、通知已寄出
- **需要「復原」按鈕的操作**：刪除後 10 秒內可 Undo（sonner action 模式；含 `action` 的 toast 預設 `duration` = 10000ms，見「API」段）
- **非關鍵資訊**：訊息即使使用者沒看到也不影響流程

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 關鍵錯誤或警告（使用者必須看到）| `Alert` + `Dialog` | Toast 會自動消失，關鍵訊息必須 persistent |
| 欄位級驗證錯誤 | Field error message | Toast 是頁面級，欄位錯誤靠在欄位下方 |
| 需要使用者確認的訊息（「是否繼續？」）| `Dialog` | Toast 非阻斷且自動消失，無法承載確認流程 |
| 持久性系統狀態（方案過期、帳戶未驗證）| `Alert` | Toast 短暫，狀態需要 persistent |

---

## 與 Alert 的分界

**Alert 是 canonical owner**——完整多維度比較詳見 `../Alert/alert.spec.md`「與 Toast / Notice 的分界」。

簡述：**Toast** = 短暫浮動自動消失（操作回饋）；**Alert** = 持續顯示需 acknowledge（系統狀態）。判斷法「訊息重要到需要 acknowledge 嗎」在 Alert spec。

---

## 禁止事項

- ❌ **不用 Toast 做 critical confirmation**：Toast 會自動消失，使用者可能沒看到就消失——關鍵訊息改用 Alert 或 Dialog
- ❌ **不用 Toast 取代 error validation**：欄位錯誤訊息要貼近發生位置（FieldError），Toast 定位遠離錯誤欄位,使用者難對應到錯誤來源
- ❌ **不同時彈 > 3 個 Toast**：同時多則 Toast 視覺雜訊重且無法閱讀，sonner 預設只顯示最近 3 則（`visibleToasts=3`），超出的仍在 DOM 內但以 `data-visible=false` 隱藏堆疊（非 queue 到 DOM 外或延後建立）；應用層若批量觸發 toast,整理成單一 Toast with list 或改用 Alert
- ❌ **不把需要 user action 的內容放 Toast**：action 按鈕僅限「復原 / Undo」這類非必要後手——強制 CTA（付款、確認刪除）用 Dialog

---

## A11y 預設

- **預設**（success / info / neutral）：`Toaster` 的 stable sibling `role="status"` + `aria-live="polite"` 在 screen reader 空閒時讀出，不中斷使用者。
- **error / warning 升級**：另一個 stable sibling `role="alert"` + `aria-live="assertive"` 立即播報。severity 完全由 `variant` 路由，沒有 per-instance 降級開關。
- **DS 自帶完整 announcer**：consumer 只需在 app root 掛一次 `<Toaster />`，不必、也不應另建 live region。`Toaster` 就地渲染三個 DOM siblings：Sonner 視覺 `<section aria-live="polite">`、DS polite region、DS assertive region；後兩者不在 Sonner section 內。
- **視覺 Toast 不是 live region**：Sonner 2.0.7 在 `dist/index.mjs` 寫死 viewport `<section aria-live="polite" aria-relevant="additions text" aria-atomic="false">`，`Toaster` props 沒有對應 override；每則 visual toast 則是 `tabIndex=0` 的 `<li data-sonner-toast>`，custom JSX 放在其內。DS 因此把 custom visual root 設為 `role="group" aria-live="off"`，將其從 Sonner 父層 polite 變更播報中切出，避免重複播報或 warning / error 被父層降成 polite。`aria-live` 是 inherited ARIA state，明確 `off` 是對父層的局部 override，且不會從 accessibility tree 隱藏內容。
- **不用 `aria-hidden` 隱藏視覺 Toast**：Sonner `<li>` 仍可由 ⌥T / Alt+T hotkey 聚焦，group 內的標題、描述、action 和 dismiss 仍可被閱讀與操作。含互動子元素的 toast 不可包在 `aria-hidden` 中。
- **連續相同訊息仍會播報**：`toast()` 每次呼叫都產生單調遞增 sequence，announcer 會 replace live region 的 text node；即使文案完全相同也有可觀察的 child-list mutation，不會因 React 相同 string 而被略過。
- **SSR-safe**：module scope 只保留 listener / sequence，render 期間不讀 `window` / `document`；DOM text-node 更新只在 client `useEffect` 訂閱後執行。`Toaster` 尚未 mount 前呼叫 `toast()` 不會製造 server-side DOM side effect，app-level 合約仍是先在 root 安裝單一 `Toaster`。
- **action 與關閉鈕之間的分隔線**（2026-08-06 補；原本未定義）：由 Notice 基座自動放，與 Alert 完全一致——兩者共用同一個 suffix 容器與同一顆 X（`notice.tsx`）。語意 SSOT → `patterns/action-bar/action-bar.spec.md` 第五節理由 3（誤觸保護）：有 `action` 時加，只有 X 時不加。**不因 action 的 variant（tertiary 有框 / text 無框）而改變**——結構相同就該行為相同
- **關閉按鈕**：畫面上可見的 X 關閉鈕由 Notice 渲染（`<Button dismiss aria-label="關閉通知">`，見 `../Notice/notice.tsx`），已自帶 `aria-label`，不是 sonner 內建 close 鈕（本 DS 用 `sonner.custom` + `unstyled`，未開 `closeButton`）。若 consumer 自訂 `action`，務必為自訂互動元素提供 `aria-label`。
- **自動關閉計時器與鍵盤暫停路徑**（2026-07-05 D4）：sonner 計時器只在滑鼠 hover / pointer 按住 / 分頁切離時暫停——**Tab 鍵盤焦點進入 toast 不暫停倒數**（sonner 2.x 行為，`expanded / interacting` 只由 mouse / pointer 事件設定）。鍵盤替代路徑是 sonner 內建 hotkey **⌥T（Option+T / Alt+T）**：焦點跳入 toast 區域並展開 stack（`expanded=true`）→ 倒數暫停，焦點離開後恢復。為給鍵盤使用者足夠反應時間，含 `action` 的 toast 預設 `duration` 加長為 10000ms（見「API」段；WCAG 2.2.1 Timing Adjustable）。

---

## Container 架構

三層結構（所有 variant 統一）：

1. **Shadow wrapper**：`rounded-lg`（8px）+ `elevation-200`（浮層陰影）。永遠在頁面 theme 解析。
2. **Bg layer**：`bg-{color}`。有色相 variant 在頁面 theme 解析。
3. **Theme layer**：`data-theme` + `text-foreground`。content token 在此 re-resolve。

### 為什麼分三層

陰影 token（`--elevation-200`）在 dark mode = 25% black（`--black-a25`），light mode = 4% black（`--black-a04`）。如果陰影跟 `data-theme="dark"` 在同一層，light 頁面上的 dark toast 會有過重的 dark 陰影。分開讓陰影永遠用頁面 theme 的輕陰影。

## Variant × Theme 策略

| Variant | Bg | data-theme | 視覺 |
|---|---|---|---|
| neutral | `bg-surface-raised`（同層翻轉） | `{inverse}` | light 頁→暗底, dark 頁→亮底 |
| success | `bg-surface-raised`（同層翻轉） | `{inverse}` | 同上 + 綠色 icon |
| info | `bg-info`（outer） | `"dark"`（inner） | 藍底白字 |
| warning | `bg-warning`（outer） | `"light"`（inner） | 黃底深字 |
| error | `bg-error`（outer） | `"dark"`（inner） | 橘底白字 |

neutral/success 的 bg + data-theme 在同一層，因為 `bg-surface-raised` 需要跟 data-theme 一起翻轉。

## API

```tsx
toast({
  variant: 'success',
  title: '操作成功',
  description: '變更已儲存至伺服器',
  action: { label: '復原', onClick: handleUndo },
})
```

- `title`（必填）：主要訊息
- `description`（選填）：補充說明，自然換行
- `action`（選填）：tertiary xs 按鈕
- `duration`（選填）：自動關閉時間；預設依 `action` 而定——有 `action` → **10000ms**（鍵盤焦點不暫停 sonner 倒數，10 秒給鍵盤使用者足夠時間按到「復原 / 重試」，見「A11y 預設」段；2026-07-05 D4 user 拍板，對齊 Polaris toast with action ≥10s / Carbon actionable notification 預設 persistent），無 `action` → **4000ms**

## 寬度（元件級常數）

Toast 使用單一元件級寬度，以維持穩定的訊息行長與頁面遮蔽上限；canonical 數值與 utility 由 `toast.tsx` 擁有，調整時連同對應 story baseline 驗證。

對照世界級：Material Snackbar 固定 344px、Sonner default toast 固定寬度——**單一元件的 canonical 寬度屬於該元件自己的 design spec，不抽為跨元件 token**。Token 系統只管共享值（如 `--field-height-*`、`--layout-space-*`）；單一元件獨有的結構常數留在 component code + 本 spec。

## Inspector 形態特例 / 為何無 SizeMatrix

- **Inspector(函式觸發形態)**:Toast 透過 `toast()` **函式觸發**,不是 JSX 元件——anatomy `Inspector` story 以 Controls 編 ToastOptions + 觸發按鈕即時跳出對應通知,取代典型 JSX prop 面板;ToastOptions schema 另完整列於 `Overview` 表格。
- **無 SizeMatrix**:Toast 固定寬度 **360px**(見本 spec「寬度(元件級常數)」段),單一 canonical width 跨 variant 不變——參考 Material Snackbar 344px / Sonner default。無 sm/md/lg size prop,也不隨 density 變(浮層是獨立視覺語境)。

對應 anatomy story:`Overview` + `Inspector` + 元件特有 `ContainerArchitecture`(三層結構解 shadow 陰影 bug) + `ColorMatrix`(Variant × Theme 策略) + `StateBehavior`(dismiss / stacking / pause / swipe) + `Accessibility`。

---

## shadcn passthrough 例外說明

Toast 的 public API 是 `toast()` 函式(imperative 觸發)+ `<Toaster />` Provider(app-level,置於 main.tsx 一次)。**兩者皆非「forwardRef + ...props + asChild」canonical shadcn 元件 pattern**:

- `toast(...)` 是 imperative API(sonner 負責 queue / stack / animation / auto-dismiss),consumer 不需持有 DOM ref
- `<Toaster />` 是 Provider(sonner 內部管理 viewport container),consumer 在 app root 放一次,無 consumer-facing DOM operation

**sonner 已實作 stack / viewport 內部**(Toaster 就地渲染外層 `<section aria-live="polite">` viewport region,以 CSS `position: fixed` 覆蓋 viewport——非 portal,sonner 不用 `createPortal`)。多則同時觸發時 sonner 不是 queue 到 DOM 外,而是全部渲染進 DOM、預設只顯示最近 3 則(`visibleToasts=3`)、超出項以 `data-visible=false` 隱藏堆疊。DS 另渲染的 polite / assertive announcer 是 Sonner section 的 siblings，不加視覺 wrapper、不影響 geometry。

**app-level-one 是強制合約**：每個 application root 只能 mount 一個 `<Toaster />`。Sonner 使用 module-global toast store，DS announcer 也是 module-global event stream；同一 app 掛多個 Toaster 會讓每個 instance 都渲染同一批視覺 toast、也同時訂閱同一訊息，導致重複視覺與重複播報。DS 不假裝支援 multi-Toaster；各頁 / feature 不另掛，共用 app-shell 那一個。Storybook 每個獨立 story root 各掛一個不違反此合約。

若 consumer 需要程式化控制(`toast.dismiss(id)` / `toast.promise(...)`),使用 sonner 原生 API,Toast 元件層不重新暴露。

---

## 邊界案例

- **Disabled(action button)**:Toast 本身為 ephemeral notification 無 disabled state(自動消失,不需禁用);若 `toast()` 傳入 `action` button(sonner ToastOptions),該 button 在 async 動作中 consumer 可 disable,視覺繼承 Button SSOT(`text-fg-disabled` + `cursor-not-allowed`)。
- **Loading**:Sonner 提供 `toast.promise(promise, { loading, success, error })` API — loading 階段渲 spinner + `loadingText`,promise 成功 / 失敗自動切 success / error variant;本元件不需 wrap。
- **Empty**:`toast()` 必傳 title(API contract);無 title-empty 場景。
- **Icon-only**:`neutral` variant 不渲 status icon,layout 收斂為 `[title + description?]  [action?]  [dismiss X?]`。
- **Dark mode / density**:走 Notice / Sonner 內部策略(見「Theme 策略」段),固定寬度 360px 跨 density 不變。

---

## 相關

- `../Notice/notice.spec.md` — Toast 消費的 layout primitive（與 Alert 共用）
- `../Alert/alert.spec.md` — 持久性通知（同一套視覺策略）
- `../Dialog/dialog.spec.md` — 需要阻斷或確認的通知改用 Dialog
- [sonner](https://sonner.emilkowal.ski/) — 浮動管理 library

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `dialog.spec.md`
- `notice.spec.md`
- `sheet.spec.md`
