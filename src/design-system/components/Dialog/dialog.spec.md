---
component: Dialog
family: null
variants: {}
sizes: {}
traits:
  - isOverlay
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
├── DialogHeader (SurfaceHeader + Close X)
│   ├── DialogTitle
│   └── Close button (<Button iconOnly dismiss size="sm" startIcon={X} />)
├── DialogBody (flex-1 ScrollArea wrap + inner padding div,pb-bottom)
└── DialogFooter (SurfaceFooter alias)
    └── Action buttons
```

**Padding SSOT**：Header / Body / Footer 的 padding + 分隔線由 `patterns/overlay-surface/overlay-surface.spec.md` own——Dialog 與 Popover 共用同一套 primitive，避免 token 漂移。Dialog 特有行為:Header 的 Close 按鈕;Body 用 `<ScrollArea>` wrap(viewport-fill 專用,SSOT 見 overlay-surface.spec.md 「Body overflow canonical」節 + `components/ScrollArea/scroll-area.spec.md`)。

## Density(2026-04-22 v5 校準:繼承 page density,跟 Sheet 對齊)

Dialog **繼承 page `data-density`**,不自設密度 attribute。這是 overlay primitive 的 canonical(跟 `components/Sheet/sheet.tsx` 對齊 — Sheet 不自設 density,繼承 page 層級 `html[data-density]`,見 sheet.tsx line 111 canonical)。

**歷史備忘**:先前曾設 `data-layout-space="lg"` 給 header/body 寬鬆呼吸,但跟 `--chrome-header-height` canonical 衝突(md page dialog header 期望 48,強設 lg 會變 56)。**已於 2026-04-22 v5 撤回**,Dialog 全盤繼承 page density,header 高度 = `--chrome-header-height` 自動對齊(md=48 / lg=56)。

**世界級對照**:
- Polaris Modal:px 16(= md loose)
- Material M3 Dialog:px 24(= lg loose)
- Atlassian Dialog:px 24
- 我方:跟隨 page density,md=16 / lg=24,兩端都在世界級 range 內。

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

## 關閉按鈕

永遠存在於 DialogHeader 右側。使用 `<Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />`，不可移除——使用者永遠需要明確的關閉手段。

**Size canonical(v5 chrome-unbounded)**:Button native size **sm**(28 md / 32 lg),touch target 亦同。SurfaceHeader 的 `[data-unbounded]` CSS rule 自動對 text variant / dismiss 套負 my `calc((xs-sm)/2)` → **layout 佔位 = 24**(xs 固定)。效果:
- Header 只有 title + close X → max layout = 24 → header = 24 + 2×tight = **48 md / 56 lg = `--chrome-header-height`** ✓
- Header 塞 bounded primary(無 `data-unbounded`)→ header 自然長高

**Canonical 來源**:Dialog 是 overlay chrome，corner close X 屬 action group region，必用 Button(非 Inline Action / 非自刻 button)。詳見 `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss canonical」+ `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」。

## Title

`text-body-lg font-medium truncate`——單行截斷，不換行。

**Header 可成長**:Dialog 提供 `<DialogDescription>` primitive 作副標/補充說明(`mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary` — title body-lg 16 + desc body 14 → reading-lg token)。Consumer 傳 title + description 時 header 自然長高(這也是為何 Dialog / Sheet / Popover 的 SurfaceHeader 刻意 **padding-based 而非 fixed-h** — 宣告 chrome 可成長)。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「為什麼 SurfaceHeader 是 padding-based」+ `tokens/uiSize/uiSize.spec.md`「消費 --chrome-header-height 的 2 種實作 pattern」。

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

**Density**:Dialog **繼承 page density**(v5 校準,跟 Sheet 對齊),見上「Density」段。

---

## 禁止事項

- ❌ **不在 Dialog 內 nested Dialog**：modal 疊 modal 會形成焦點陷阱地獄（使用者無法預測 Esc 關哪一層），複雜多步驟流程改用單一 Dialog + 內部步驟切換
- ❌ **不用 Dialog 顯示非阻斷訊息**：成功 / 失敗的短暫回饋用 Toast；持續性系統狀態用 Alert。Dialog 的阻斷成本過高
- ❌ **不把長 form wizard 塞 Dialog**：超過 3 步驟或表單高度接近全螢幕的流程改用獨立頁面或 Sheet，Dialog 不適合長時間停留
- ❌ **不在 Dialog footer 把 primary action 放左側**：CTA 靠右（`justify-end`）是跨平台使用者期待（macOS / Windows / Web 主流皆如此），反向放置會降低可用性

---

## A11y 預設

Radix Dialog 自動處理：

- **Modal 語意**：`role="dialog"` + `aria-modal="true"`
- **標題綁定**：`<DialogTitle>` 自動成為 `aria-labelledby` 指向對象，screen reader 開啟時讀出標題
- **Focus trap**：焦點鎖在 Dialog 內，Tab 循環不逃出
- **Esc 關閉**：按 Esc 自動關閉
- **Focus return**：關閉時焦點返回 trigger 元素
- **Overlay click**：點擊 overlay 關閉（可透過 `onPointerDownOutside` 阻止）

Consumer 必須保留 `<DialogTitle>`——即使視覺不顯示，也要用 `VisuallyHidden` 包裹提供給 screen reader。

---

## 為何無 Inspector

Dialog 是 modal 浮層元件,關鍵決策維度是 `maxWidth`(400/480/560/720)× `autoHeight` × `destructive` × open/close 行為——已由 `SizeMatrix`(maxWidth 4 檔) / `HeightBehavior`(viewport-fill vs autoHeight) / `DestructiveMatrix` / `StateBehavior`(open / close / ESC / overlay click) 四張矩陣 + `ColorMatrix`(layout + 視覺 token)完整覆蓋。互動 Inspector 切單一 open/close 不如結構性矩陣對照——Dialog 的正確用法是「照情境選 size / 選 autoHeight」,需要 side-by-side 比對決策。

對應 anatomy story:保留 `Overview` + 元件特有 `HeightBehavior` / `DestructiveMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix`。

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
- `coachmark.spec.md`
- `file-viewer.spec.md`
