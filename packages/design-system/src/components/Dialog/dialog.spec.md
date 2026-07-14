---
component: Dialog
family: composite
variants: {}
sizes: {}
traits:
  - isOverlay
benchmark:
  - Radix Dialog primitive: github.com/radix-ui/primitives/tree/main/packages/react/dialog
  - Ant Design Modal: github.com/ant-design/ant-design/tree/master/components/modal
  - MUI Dialog: github.com/mui/material-ui/tree/master/packages/mui-material/src/Dialog
  - Polaris Modal: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Modal
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Dialog 設計原則

## 定位

Modal 對話框，基於 Radix Dialog。用於**需要使用者注意力、阻斷背景互動**的操作流程（建立、編輯、確認）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **需要專注的操作流程**：建立 / 編輯複雜表單、多步驟精靈、付款結帳
- **破壞性動作確認**：刪除、離開不儲存、登出多個裝置
- **短暫但重要的資訊**：首次引導、重要公告必須被看到才能繼續
- **需要阻斷背景互動的脈絡**：使用者必須完成或取消此流程才能回到頁面

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 短暫的操作回饋（成功 / 失敗訊息）| `Toast` | Dialog 會阻斷流程，Toast 非阻斷 |
| 持久的頁面內通知 | `Alert` | Alert 是 inline 嵌入，不浮起 |
| 側邊操作面板（不需完全阻斷）| `Sheet` | Sheet 從側邊滑入，視覺更輕、常搭配列表 detail |
| 浮動的精簡選單 | `DropdownMenu` / `Popover` | Dialog 是 modal,DropdownMenu/Popover 是輕量浮層 |
| Hover 才出現的輔助資訊 | `Tooltip` / `HoverCard` | Dialog 需要明確觸發,hover 不該是 modal 觸發 |
| 手機全屏編輯 | `Sheet` (bottom / fullscreen) | Dialog 預設 viewport inset,行動裝置用 Sheet 更自然 |

---

## 結構

```
DialogContent (fixed, centered)
├── DialogHeader(消費 SurfaceHeader)
│   ├── DialogTitle
│   └── Close button(永遠存在,規格見「關閉按鈕」)
├── DialogBody(scrollable——ScrollArea canonical,見下)
└── DialogFooter(消費 SurfaceFooter)
    └── Action buttons
```

**Padding SSOT**：Header / Body / Footer 的 padding + 分隔線由 `patterns/overlay-surface/overlay-surface.spec.md` own——Dialog 與 Popover 共用同一套 primitive，避免 token 漂移。Dialog 特有行為:Header 的 Close 按鈕;Body 用 `<ScrollArea>` wrap(viewport-fill 專用,SSOT 見 overlay-surface.spec.md 「Body overflow canonical」節 + `components/ScrollArea/scroll-area.spec.md`)。

## Density(2026-06-16 定論:全繼承 page,不鎖)

Dialog **不自設任何 density attribute**,layout-space + ui-size 全繼承 page。效果:md page → body `px-loose`=16 / header `py-tight`=12(header 48);lg page → 24 / 16(header 56),隨 page。

**為何不鎖(撤回本 session 一度加的 `data-layout-space="lg"`)**:本 `density.spec` 第 10 行親自定義 layout-space 管「dialog body padding」—— Dialog 若鎖死 layout-space,等於 override 我們自家 dial 對它點名要管的對象失效 = **自相矛盾**。有「同類 padding-density dial」的世界級 DS(SAP Fiori cozy/compact 做 `syncStyleClass` 專門把 page density 同步進 dialog;AWS Cloudscape compact「propagate to all components, in all view types」,例外只列 informational + tiny dropdown,modal 不在內)都讓 **modal 跟 page dial 走**,沒有一家把 modal 釘固定 tier。Material/Atlassian 的固定 24 是因為它們**沒有** density dial(其 24 = 我方 lg)。

**「modal 要寬鬆呼吸」怎麼滿足**:lg 產品自動拿 24(Material 級);md 產品本就要緊湊(資訊密集),16 是合格 modal padding(Polaris Modal = 16,世界級下限)。**「button 不撐高 header」**由 ui-size 繼承 page 解決(button = page sm),與 layout-space 鎖不鎖無關 → 故不需鎖。

**Header 高度**:padding-based = title line-box 24 + `py-tight`×2 → md 48 / lg 56,**隨 page tier**(= `--chrome-header-height` 同 tier 對齊)。

**世界級對照**:Material M3 / Atlassian 24(無 dial,= 我方 lg)/ Polaris 16(= 我方 md 下限)/ SAP Fiori + Cloudscape(有 dial → modal 跟 dial = 我方繼承)。

## Layout

- **水平 padding**：`px-[var(--layout-space-loose)]`（header / body / footer 統一）
- **Header / Footer 垂直 padding**：`py-[var(--layout-space-tight)]`
- **Body 垂直 padding**：`pt-[var(--layout-space-tight)]` + `pb-[var(--layout-space-bottom)]`——底部留較大空間，視覺上不壓迫

## Viewport Inset

Modal 與 viewport 四邊保持 `--layout-space-bottom`（48px）最小間距。maxWidth 也受此限制：`min(maxWidth, 100vw - inset*2)`。

## 高度行為

| 模式 | 條件 | 行為 |
|---|---|---|
| **預設（填滿）** | 不傳 `autoHeight` | `height = 100vh - inset*2`，body 捲動。防止動態內容（載入資料、展開 section）造成 dialog 跳動 |
| **autoHeight** | `autoHeight={true}` | 高度隨內容，超過 viewport 時 `max-height` 安全帽。適合內容量已知且穩定的 dialog（確認框、短表單） |

## maxWidth

預設 512px，consumer 可透過 `maxWidth` prop 調整。型別 `string | number`（傳 number 視為 px）。

**邊界**:上限被 viewport inset 截斷 `min(maxWidth, 100vw - inset*2)`(見「Viewport Inset」);無下限 clamp——過小值不擋,內容溢出走 body 捲動,由 consumer 自負。

## 關閉按鈕

> **跨家族 SSOT pointer**:DialogHeader 屬 **Padding-based overlay header 家族**;border / padding / dismiss size / withTabs(tabs 進 header 時 border auto-suppress)的跨家族視覺契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。本節僅 codify Dialog 特有 close X size + chrome-unbounded rationale。

永遠存在於 DialogHeader 右側。使用 `<Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />`，不可移除——使用者永遠需要明確的關閉手段。

**Size canonical(v5 chrome-unbounded)**:Button native size **sm**(隨 page density:28 md / 32 lg),touch target 亦同。SurfaceHeader 的 `[data-unbounded]` CSS rule 自動對 text variant / dismiss 套負 my → **layout 佔位 = title line-box**(slot 衍生自 `--font-body-lg-size`×1.5=24,見 `overlay-surface.spec.md` slot 段)。效果:
- Header 只有 title + close X → max layout = 24 → header = 24 + 2×`py-tight`(隨 page:md 12 / lg 16)= **48 md / 56 lg**(= `--chrome-header-height` 同 tier 對齊)✓
- Header 塞 bounded primary(無 `data-unbounded`)→ header 自然長高

**Canonical 來源**:Dialog 是 overlay chrome，corner close X 屬 action group region，必用 Button(非 Inline Action / 非自刻 button)。詳見 `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」+ `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」。

### Header actions slot(2026-07-08)

Header 級操作(記錄 prev / next 導覽、header 級溢出選單 ⋮ 等「作用於整個 dialog 內容」的操作)走 `<DialogHeader actions={…}>` slot,**不**塞 children 自刻右側 cluster。

- **何時用**:操作對象是 dialog 承載的記錄本身(切換上下筆、複製連結、更多選單)。欄位級操作仍歸 body;confirm / cancel 歸 footer。
- **分隔線由 DS 自動放**:actions 與內建 Close X 之間 DS 渲 `<ButtonDivider>` — `action-bar.spec.md:281`「最右側為關閉 / 解除按鈕 → 分隔線必須(誤觸保護)」;幾何 = ButtonDivider `mx-1` 於 `gap-2` cluster → 兩側 12px 對稱(同 spec「分隔線幾何」段)。
- **按鈕形態**:`<Button variant="text" iconOnly …>`(text variant 自動 `data-unbounded`,不撐高 chrome header;對齊 action-bar「溢出按鈕一律最低視覺重量」)。
- ❌ **禁**:consumer 在 children 內自刻 cluster + divider(分隔線落點歸 DS,自刻 = 漏分隔線 / 幾何 drift 根因 — 2026-07-08 WM 詳情 header 錨例)。

## Title

`text-body-lg font-medium truncate`——單行截斷，不換行。

**Header 可成長**:Dialog 提供 `<DialogDescription>` primitive 作副標/補充說明(`mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary` — title body-lg 16 + desc body 14 → reading-lg token)。Consumer 傳 title + description 時 header 自然長高(這也是為何 Dialog / Sheet / Popover 的 SurfaceHeader 刻意 **padding-based 而非 fixed-h** — 宣告 chrome 可成長)。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「為什麼 SurfaceHeader 是 padding-based」+ `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」節(含「2 種 pattern 對照」)。

## Footer 按鈕

預設 size `md`，與 Field 系統表單元件尺寸一致。按鈕靠右對齊（`justify-end`），間距 `gap-2`。

## 視覺

- **Overlay**：`bg-overlay`
- **Shadow**：`elevation-200`（浮層級）
- **圓角**：`rounded-lg`
- **背景**：`bg-surface-raised`
- **邊框**：`border-border`
- **分隔線**（header / footer）：`border-divider`

## 動畫

- 進場：fade-in + zoom-in-95 + slide-in-from-center
- 離場：fade-out + zoom-out-95 + slide-out-to-center

## 狀態處理的職責邊界

Dialog 是容器，無整體 disabled / loading / empty 狀態——這些屬於內容層的責任：

| 狀態 | 處理方式 |
|------|---------|
| **Loading**(內容載入中) | Consumer 在 `DialogContent` 內渲染 Skeleton / CircularProgress,不是讓 Dialog 本身等待開啟 |
| **Empty**（如步驟 dialog 還沒資料）| Consumer 在 content 區用 `Empty` primitive |
| **Error**（操作失敗）| Consumer 在 content 區用 `Alert` |
| **Disabled**（整個 dialog）| N/A——dialog 要麼開著（可互動）要麼關著（不存在）。要鎖操作請 disable 內部個別 Button / Field |

**Dark mode**：由 semantic token（`bg-surface-raised` / `border-border`）自動切換，無自訂 palette。

**Density**:Dialog **全繼承 page**(layout-space + ui-size 皆不自鎖),見上「Density」段。

---

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「側邊 / 長停留面板也用 Dialog」 | 視覺重量不同——Dialog 是中央阻斷 modal,Sheet 側滑較輕(見「何時不用」+ 禁止事項「長 form wizard」條) |
| 「autoHeight 是預設」 | 預設填滿(`100vh - inset*2`)防內容載入跳動;autoHeight 只給內容量已知且穩定的短 dialog(見「高度行為」) |
| 「maxWidth 想設多寬都行」 | 受 viewport inset 公式截斷(見「maxWidth」邊界) |
| 「視覺不顯示標題就可拿掉 DialogTitle」 | 必須保留,用 VisuallyHidden 包裹給 screen reader(見「A11y 預設」) |

---

## 禁止事項

- ❌ **不在 Dialog 內 nested Dialog**：modal 疊 modal 會形成焦點陷阱地獄（使用者無法預測 Esc 關哪一層），複雜多步驟流程改用單一 Dialog + 內部步驟切換
- ❌ **不用 Dialog 顯示非阻斷訊息**：成功 / 失敗的短暫回饋用 Toast；持續性系統狀態用 Alert。Dialog 的阻斷成本過高
- ❌ **不把長 form wizard 塞 Dialog**：超過 3 步驟或表單高度接近全螢幕的流程改用獨立頁面或 Sheet，Dialog 不適合長時間停留
- ❌ **不在 Dialog footer 把 primary action 放左側**：CTA 靠右（`justify-end`）是跨平台使用者期待（macOS / Windows / Web 主流皆如此），反向放置會降低可用性

---

## A11y 預設

Radix Dialog 自動處理：

- **Modal 語意**：`role="dialog"`(Radix 刻意**不**設 `aria-modal="true"`,改用 aria-hidden 的 `hideOthers()` 把背景兄弟節點設 `aria-hidden` + FocusScope trap 達成隔離,避免 `aria-modal` 在部分 screen reader 隱藏整頁的已知 bug）
- **標題綁定**：`<DialogTitle>` 自動成為 `aria-labelledby` 指向對象，screen reader 開啟時讀出標題
- **Focus trap**：焦點鎖在 Dialog 內，Tab 循環不逃出
- **Esc 關閉**：按 Esc 自動關閉
- **Focus return**：關閉時焦點返回 trigger 元素
- **Overlay click**：點擊 overlay 關閉（可透過 `onPointerDownOutside` 阻止）

Consumer 必須保留 `<DialogTitle>`——即使視覺不顯示，也要用 `VisuallyHidden` 包裹提供給 screen reader。

---

## anatomy story 結構

Dialog 是 modal 浮層元件,關鍵決策維度是 `maxWidth`(400/480/512/560/720)× `autoHeight` × `destructive` × open/close 行為。互動 `Inspector`(右側 Controls 即時切 `maxWidth` / `autoHeight` 看寬度 tier 與高度模式差異)搭配結構性矩陣 side-by-side 比對,完整呈現「照情境選 size / 選 autoHeight」的決策。

對應 anatomy story:`Overview` + `Inspector` + 元件特有 `HeightBehavior` / `DestructiveMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix` + `Accessibility`。

---

## 相關

- `../Sheet/sheet.spec.md` — 側邊滑入的輕量替代（共用 Radix Dialog base）
- `../Toast/toast.spec.md` — 非阻斷的短暫回饋
- `../Alert/alert.spec.md` — 頁面內持久通知
- `../Popover/popover.spec.md` — 輕量浮層（non-modal）
- `../DropdownMenu/dropdown-menu.spec.md` — 浮動選單
- `../Tooltip/tooltip.spec.md` — hover 輔助資訊
- `../../patterns/overlay-surface/overlay-surface.spec.md` — Header / Body / Footer padding SSOT（Dialog + Popover 共用）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `alert.spec.md`
- `coachmark.spec.md`
- `command.spec.md`
- `dropdown-menu.spec.md`
- `file-viewer.spec.md`
- `overlay-surface.spec.md`
- `popover.spec.md`
- `scroll-area.spec.md`
- `sheet.spec.md`
- `toast.spec.md`
