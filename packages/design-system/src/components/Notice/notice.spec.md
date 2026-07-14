---
component: Notice
family: 2
# variant 語意 = status icon 選擇(見本文「Variant」表);world-class 對照見 frontmatter benchmark 清單
variants:
  neutral:
    when: "一般訊息、系統公告;無情緒色、不掛 status icon"
  info:
    when: "資訊提示(版本更新、流程說明);Info icon"
  success:
    when: "操作成功確認;CircleCheck icon"
  warning:
    when: "可恢復警告(未儲存變更、連線不穩);TriangleAlert icon"
  error:
    when: "錯誤(操作失敗、權限不足);XCircle icon"
sizes: {}
traits:
  - isInternal
benchmark:
  - Ant Design Alert: github.com/ant-design/ant-design/tree/master/components/alert
  - Polaris Banner: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Banner
  - Carbon Notification: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Notification
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Notice 設計原則

**Toast / Alert 共用的視覺佈局層**——跟 MenuItem 為 SelectMenu / DropdownMenu 共用是同一個架構概念。Notice 只負責 layout 和 icon 選擇，色彩由消費者透過 `data-theme` 控制。

## 定位

Notice 是純視覺 primitive，不是獨立使用的元件。消費者：
- **Toast**：浮動 + 自動消失（Sonner）
- **Alert**：inline / fixed 持久通知

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。Notice 語意為 notification（非 row collection），但視覺排版遵循 Family 2 確保跨元件視覺一致。

**尺寸偏離（documented exception）**：Notice / Alert / Toast **單一固定 size**——不實作 Family 2 baseline 的 sm/md/lg，padding 預設不隨 density 變（`px-4 py-3` 固定；唯一例外：Alert `placement="fixed"` 水平 px 改 density-aware，詳「Padding」段）。通知用單一 prominent size 強化「搶注意」的目的性，對齊世界級共識（Material Banner/Snackbar、Polaris Banner、Atlassian InlineMessage、GitHub Flash）。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## Typography

**Family 2 reading-md consumer（2026-06-15 user 拍板,off-grid 偏移收斂）**，md tier 固定不隨 density 變：
- title: `text-body`（14px）**default leading 1.5** — 有 description 時加 `font-medium`
- description: `text-body`（14px）**default leading 1.5** + `text-fg-secondary`（neutral-8）
- label↔desc gap: `--item-gap-label-desc-reading`（ItemContent 預設 mode=`reading` size=`md` 自動選）
- icon: 16px（`ICON_SIZE.md`，item-anatomy.tsx）

相同 body 字級,層級靠 font-weight / color 區分（不靠 font-size,亦不靠 compact 行高）。

> **為何 reading-md 而非 compact（2026-06-15 codify，根治 off-grid 偏移）**：Notice 同時服務 title-only（多數）與 title+desc、Alert（banner）與 Toast（snackbar）。原本 root 套 `leading-compact`(1.3) 形成「reading gap token + scanning 行高」混搭,落在 ItemContent 4 個合法 mode（reading-md/reading-lg/scanning-md/scanning-lg）**之外**的第五種組合（label 14 + desc 14 + 行高 1.3）且未文件化 → 違反 `item-anatomy.spec.md`「偏離 canonical 必明文 rationale」。收斂為純 **reading-md**：title-only 14px 對齊 Ant/Material title-only norm（scanning-lg 的 16px 過大）；desc 維持 14px 可讀（scanning-md 的 12px caption 對通知訊息過小）；title↔desc 階層由 `font-medium` 承載已足夠。對照 FileItem（顯式 `mode="scanning"` + 文件化 = 正確消費範例,file-item.tsx:13/214）。

## Padding（固定）

| 屬性 | 值 | 理由 |
|---|---|---|
| px | `px-4`（16px） | 世界級系統共識（Atlassian/GitHub/Material/Linear 都是 16px） | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| py | `py-3`（12px） | 介於 row（7px）和 section（16px）之間，通知的 sweet spot |
| gap | `gap-2`（8px） | 跟 item-layout icon-text gap 一致 |

不隨 density 變——Toast/Alert 是通知，不是工作區域元件。

**例外——Alert `placement="fixed"` 水平 px density-aware**:Alert 的 fixed placement 傳 `className='px-[var(--layout-space-loose)]'`(`alert.tsx` fixed 分支)覆寫 Notice 的 `px-4`，改用 density-aware 水平 padding（md=16 / lg=24px），讓 fixed alert 嵌在更大佈局時跟周圍 loose-padding 元素（Toolbar / BulkActionBar / DataTable）左右對齊。垂直 `py-3` 仍固定（notification banner family 垂直不隨 density）。故上方「px 固定」限 Notice 預設 / Toast / Alert inline placement；Alert fixed placement 是唯一 documented 例外。

## Layout

item-layout 4-slot：
```
[status icon?]  [title + description?]  [endContent?]  [dismiss X?]
```

- Icon: 16px，`h-[1lh]` inline 對齊 first line
- Dismiss X: `<Button iconOnly dismiss size="xs" />` — chrome corner action group region(Cat 3)。xs 是 **Notification banner family canonical**(Notice / Alert / Toast inherit):ephemeral banner `px-4 py-3` 固定不隨 density,dismiss 邊角小 affordance 輕量不搶眼。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」(overlay header 走 sm native + 負 margin trick;只有 notification banner family 用 xs)+ `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」
- endContent: 通常放 `<Button variant="tertiary" size="xs">`

## Variant

| Variant | Icon | 語意 |
|---|---|---|
| neutral | 無 | 一般訊息 |
| info | Info（ℹ） | 資訊提示 |
| success | CircleCheck（✓） | 操作成功 |
| warning | TriangleAlert（⚠） | 警告 |
| error | XCircle（✕） | 錯誤 |

## Theme 策略

Notice **不設** bg 和 text color。消費者在 container 設 `data-theme` + `text-foreground`，Notice 內所有 token 自然適配。

消費者的 data-theme 策略：

| 場景 | data-theme | text 結果 |
|---|---|---|
| 有色相 solid（info/success/error） | `"dark"` | neutral-9 = 白 |
| warning solid | `"light"`（永遠） | neutral-9 = 黑 |
| neutral solid | `{inverse}`（跟頁反） | 跟隨翻轉 |
| subtle | 不設（跟隨頁面） | 跟隨頁面 |

### 為什麼 data-theme 要搭配 text-foreground

CSS `color` 從 body 繼承的是**已解析的計算值**，不是 `var(--foreground)` 表達式。`data-theme` 改變 `--foreground` 的值，但不改 `color` 屬性。在 theme boundary 設 `text-foreground` class 強制 `color: var(--foreground)` 在正確 context 重新解析。

## 何時用 / 何時不用

**Notice 是 internal primitive**——不進 root barrel front-door、不裸用；透過 `Alert` / `Toast` 等外層通知元件消費；consumer 需要時可經 per-component subpath 包裝並自行確認後使用（`.claude/rules/ui-development.md`「Root barrel front-door 排除」SSOT，internal ≠ 禁用）。

| 場景 | 正確做法 |
|------|---------|
| Inline / fixed 持久通知 | 用 `Alert`（內部消費 Notice）|
| 浮動自動消失的短暫通知 | 用 `Toast`（內部消費 Notice + sonner）|
| 直接在 JSX 中用 `<Notice>` | ❌ **禁止**——失去 Alert / Toast 外層的生命週期與定位管理 |

### 消費者

- `../Alert/alert.spec.md` — inline / fixed 持久通知
- `../Toast/toast.spec.md` — 浮動非阻斷短暫通知

---

## 為何無 SizeMatrix / ColorMatrix

Notice 是 **Toast / Alert 共用的 layout primitive**,刻意不擁有尺寸與色彩變體:

- **無 SizeMatrix**:Notice / Alert / Toast **單一固定 size**(見本 spec「尺寸偏離」段),不實作 Family 2 baseline 的 sm/md/lg——通知的使命是「搶注意」而非「在密度選擇裡協調」。padding 固定 `px-4 py-3`,typography 固定 md tier(14px),不隨 density 變。
- **無 ColorMatrix**:Notice 本身**不設 bg / text color**(見本 spec「Theme 策略」段),色彩完全由 consumer(Alert / Toast)透過 `data-theme` + `text-foreground` 控制。Notice 層級的色彩矩陣沒有意義——視覺對照屬於 consumer 的職責,應查 `alert.anatomy.stories.tsx` 與 `toast.anatomy.stories.tsx` 的 ColorMatrix。

對應 anatomy story:保留 `Overview` / `Inspector` / `StateBehavior` / `Accessibility`,額外追加元件特有的 `VariantIconMap`(展示 5 種 variant 對應的 status icon + 語意)。

---

## 邊界案例

- **Disabled(dismiss button)**:Notice 本身不擁有 disabled state(internal primitive,無互動);內嵌的 `<Button iconOnly dismiss size="xs" />` 在 disabled context 內會自動繼承 Button disabled 視覺(`text-fg-disabled` + `cursor-not-allowed`)。Notice **不提供 disable dismiss 的 API**——`...props` 只 spread 到 root `<div>`,dismiss `<Button>` 不接收 / 不 forward 任何 consumer disabled prop,無 consumer-level prop pass-through 可停用 dismiss。對齊消費者 canonical(`../Alert/alert.spec.md`「Disabled(dismiss button)」:banner dismiss 恆可用,對齊 Polaris / Material Banner「通知關閉鈕應永遠可按」);若需防止 close action(API in-flight)被雙擊,consumer 在 `onDismiss` 內自行 debounce / 加上層鎖,不在 UI 層暴露 disabled 透傳。
- **Loading**:Notice 非 async surface,無 loading state。Body 內若 consumer 注入 CTA Button,該 Button 自行處理 loading。
- **Empty**:Notice 的 `title` 為必填(TypeScript required prop,消費合約),`description` 選填;layout 至少 1 行 title 內容。誤傳空字串時照常 render(無 runtime warn / throw),空 title 的內容責任在 consumer(Alert / Toast)。`neutral` variant 不渲 status icon 時即為 title-only icon-less 形態(見 `NeutralTitleOnly` story),仍合法 render。
- **Icon-only / variant=neutral**:`neutral` variant 不渲 status icon,layout 自動收斂為 `[title + description?]  [endContent?]  [dismiss X?]` 三 slot。
- **`dismissible` 無 `onDismiss`**(2026-07-05 D4):X 渲染條件 = `dismissible`(預設 true)**且**有傳 `onDismiss`——Notice / Alert 為 controlled-only(不自我移除),無 handler 的 X 是可 focus、SR 播報「關閉通知」但按下零反應的死按鈕(假 affordance)。對齊 Polaris Banner(`onDismiss` 存在才顯示 X)/ Ant Alert(`closable` 預設 false)。顯式傳 `dismissible={true}` 卻缺 `onDismiss` 時 dev-only `console.warn` 提示(預設未傳不吵)。

---

## 相關

- `../Alert/alert.spec.md` — 主要消費者（持久通知）
- `../Toast/toast.spec.md` — 主要消費者（短暫通知）
- `../../patterns/element-anatomy/item-anatomy.spec.md` — Notice 的 layout 共用規則
- `../../tokens/color/color.spec.md` — color tokens 和 variant × theme 策略
- `../../tokens/color/primitives.css` — primitives nested theme（`:root, [data-theme]` pattern）

## A11y 預設

**ARIA / Pattern**:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。

**Keyboard 行為**:

- Tab — focus dismiss button(若 dismissible 且有傳 `onDismiss`——X 僅在兩者同時成立時渲染,見「邊界案例」,2026-07-05 D4;consumer 經 `endContent` 注入互動元素時,其 DOM 順序在 dismiss 之前,Tab 先落 endContent)
- Enter / Space — 觸發 focus 中的 dismiss button(原生 button 行為,呼叫 `onDismiss`)

Notice **不**自帶 Esc-to-dismiss 行為(`notice.tsx` 無 keydown handler);dismiss 純粹由 dismiss button 的 `onClick={onDismiss}` 觸發。若 consumer(Alert / Toast)需要 Esc 關閉,於 consumer 層自行掛 keydown。Dismiss 後的焦點處置 Notice 同樣不管理(無 focus restoration 邏輯)——節點移除後焦點落點由 consumer(Alert / Toast host)決定。

**Focus**:Notice 自身渲染的唯一 focusable 元素是 dismiss `<Button>`(consumer 經 `endContent` 注入的互動元素——如上方建議的 tertiary Button——由 consumer 自管 a11y),focus indicator 走 Button canonical(`focus-visible:ring-2 ring-ring`,box-shadow ring 非 CSS `outline`);Notice 本身無 focus management(dismiss 後焦點處置見上段,由 consumer 決定)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `bulk-action-bar.spec.md`
- `coachmark.spec.md`
- `item-anatomy.spec.md`
- `toast.spec.md`
