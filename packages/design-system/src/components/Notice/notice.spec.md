---
component: Notice
family: 2
variants: {}
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

**尺寸偏離（documented exception）**：Notice / Alert / Toast **單一固定 size**——不實作 Family 2 baseline 的 sm/md/lg，padding 也不隨 density 變（`px-4 py-3` 固定）。通知用單一 prominent size 強化「搶注意」的目的性，對齊世界級共識（Material Banner/Snackbar、Polaris Banner、Atlassian InlineMessage、GitHub Flash）。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## Typography

md tier，固定不隨 density 變：
- title: `text-body`（14px）`leading-compact`（1.3）— 有 description 時加 `font-medium`
- description: `text-body`（14px）`leading-compact` + `text-fg-secondary`（neutral-8）

相同 body 字級,層級靠 font-weight / color 區分。

## Padding（固定）

| 屬性 | 值 | 理由 |
|---|---|---|
| px | `px-4`（16px） | 世界級系統共識（Atlassian/GitHub/Material/Linear 都是 16px） | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| py | `py-3`（12px） | 介於 row（7px）和 section（16px）之間，通知的 sweet spot |
| gap | `gap-2`（8px） | 跟 item-layout icon-text gap 一致 |

不隨 density 變——Toast/Alert 是通知，不是工作區域元件。

## Layout

item-layout 4-slot：
```
[status icon?]  [title + description?]  [endContent?]  [dismiss X?]
```

- Icon: 16px，`h-[1lh]` inline 對齊 first line
- Dismiss X: `<Button iconOnly dismiss size="xs" />` — chrome corner action group region(Cat 3)。xs 是 **Notification banner family canonical**(Notice / Alert / Toast inherit):ephemeral banner `px-4 py-3` 固定不隨 density,dismiss 邊角小 affordance 輕量不搶眼。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」(overlay header 走 sm native + 負 margin trick;只有 notification banner family 用 xs)+ `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss canonical — X close only」
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

**Notice 是 internal primitive**——不直接使用，透過 `Alert` / `Toast` 等外層通知元件消費。

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

- Tab — focus dismiss button(若 dismissible)
- Enter / Space — 觸發 focus 中的 dismiss button(原生 button 行為,呼叫 `onDismiss`)

Notice **不**自帶 Esc-to-dismiss 行為(`notice.tsx` 無 keydown handler);dismiss 純粹由 dismiss button 的 `onClick={onDismiss}` 觸發。若 consumer(Alert / Toast)需要 Esc 關閉,於 consumer 層自行掛 keydown。Dismiss 後的焦點處置 Notice 同樣不管理(無 focus restoration 邏輯)——節點移除後焦點落點由 consumer(Alert / Toast host)決定。

**Focus**:唯一 focusable 元素是 dismiss `<Button>`,focus indicator 走 Button canonical(`focus-visible:ring-2 ring-ring`,box-shadow ring 非 CSS `outline`);Notice 本身無 focus management(dismiss 後焦點處置見上段,由 consumer 決定)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `bulk-action-bar.spec.md`
- `coachmark.spec.md`
- `toast.spec.md`
