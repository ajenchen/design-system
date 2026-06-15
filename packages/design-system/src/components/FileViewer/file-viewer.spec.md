---
component: FileViewer
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isOverlay
benchmark:
  - react-zoom-pan-pinch: github.com/BetterTyped/react-zoom-pan-pinch
  - Ant Design Image (preview): github.com/ant-design/ant-design/tree/master/components/image
  - Polaris Image: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Image
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# FileViewer 設計原則

## 定位

FileViewer 是**可延伸的網頁檔案預覽殼層(modal fullscreen)**——負責 overlay / toolbar / 鍵盤 / filmstrip / 詳細資訊面板一切 chrome,檔案本體由 **renderer registry** 按 file type 決定誰渲染。MVP 內建 `ImageRenderer` + `FallbackRenderer`,未來可透過 `registerFileRenderer()` 擴充 PDF / Video / Code 等 renderer 而不動 shell。

**實作基礎**:自建 composite——直接消費 Radix `DialogPrimitive` 而非 DS 的 `<Dialog>` wrapper。原因:FileViewer 需要 edge-to-edge fullscreen(無 viewport inset / 無 rounded-lg / 無 maxWidth),這些全要覆寫 `<Dialog>` 預設。直接消費 Radix primitive 讓 shell 擁有完整 layout 控制權,同時保有 Radix focus trap / Esc / aria-modal 的結構優勢。內部消費 DS 元件:`<Button>` / `<Input>` / `<Empty>` / `<Separator>` / `<AspectRatio>` / `<Textarea>` / `<Field>`+`<FieldLabel>` / `<DescriptionList>` / `<ScrollArea>` / `<DropdownMenu>` / `<ChromeHeader>` / `ItemInlineActionButton` + `patterns/horizontal-overflow`。

**Layout Family**:**非上述 family — composite / multi-region**(Toolbar + Viewport + 可選 InfoPanel + 可選 Filmstrip)。見下「Layout Family Rationale」段。

**世界級對照**:Figma file preview / Google Drive 檢視器 / Dropbox preview / macOS Preview.app / Google Photos lightbox / Notion attachment viewer。共同行為:fullscreen modal / toolbar 含 zoom & download & close / 多檔 filmstrip / ← → 切換 / Esc 關閉 / I 切換 info panel。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## Layout Family Rationale

本元件**不套用 Family 1/2/3/4 任一種**:

- Family 1/2 是單列 row(menu / list item);FileViewer 是整頁 shell
- Family 3 是單行 pill;FileViewer 是 multi-region layout
- Family 4 是可編輯資料輸入;FileViewer 是資訊消費介面

**自 own layout 合理**:世界級 file viewer(Figma / Google Drive / Dropbox / macOS Preview)皆為 fullscreen overlay + fixed toolbar strip + flex viewport + optional side panel + optional bottom strip 的結構。這是 viewer 領域 canonical,不適合塞進既有 row / pill family。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

Family 的 canonical 規定的是「同用途同 layout」;FileViewer 用途(fullscreen preview shell)目前系統內唯一,無共用需求。未來若新增其他 fullscreen viewer(如 `MediaGallery`),再考慮是否升為共用 family / pattern。

---

## Consistency Audit Rationale(偏離 canonical 說明)

根據 CLAUDE.md「Consistency Audit 原則」,列出本元件偏離系統 canonical 的地方與理由:

| 偏離點 | Canonical | 本元件做法 | 理由 |
|--------|-----------|-----------|------|
| Overlay 浮層 | 一般 modal 用 `<Dialog>` | 直接消費 `DialogPrimitive.Root/Content` | 需要 edge-to-edge fullscreen,Dialog 的 inset / rounded-lg / maxWidth 全要覆寫;直接用 Radix primitive 避免對抗 wrapper |
| Theme 鎖定 | 一般元件繼承頁面 theme | Content 內包 `data-theme="dark"` subtree | Viewer chrome 需暗色氛圍讓圖片 / media 顯色正確(對齊 Tooltip pattern——`data-theme="dark"` subtree 是 DS 已有的 canonical 手法) |
| Anatomy 5-story | 完整 5 件套(Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior) | 保留全部 5 件套;Inspector 以多 toggle 並列方式展示(showFilmstrip × readOnly × allowDownload × filesCount) | FileViewer 決策維度 `mode × files count × readOnly × allowDownload × showFilmstrip` 雖超過一般單維 Inspector 範圍,仍值得提供 live 可切換預覽;多 toggle 並列讓 reviewer 一次看到「配置 → 結果」關係,StateBehavior 再補場景矩陣 |
| Layout Family | 聲明 1/2/3/4 家族 | 聲明「非 family — composite」 | 見上「Layout Family Rationale」段 |

---

## 何時用

| 場景 | 範例 |
|------|------|
| 多圖集快速瀏覽 | Jira 附件檢視(screenshot pack)、活動相片集、產品截圖 gallery |
| 設計檔案 review | Figma design review 需 zoom 看細節、Notion 配圖預覽 |
| 教學內容檢閱 | 文件上傳流程預覽、KYC 證件檢視 |
| 附件交互閱讀 | Gmail / Slack 多附件 lightbox 預覽 |

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單張 inline 展示 | `<img>` / AspectRatio | 不需 fullscreen + toolbar 的 chrome overhead |
| 檔案上傳清單列 | `FileItem` | FileItem 是 list 呈現,FileViewer 是 fullscreen preview,不同階段 |
| 需編輯檔案 | 專屬編輯器(Figma / Canva / 內建 editor) | FileViewer 是**檢視**殼,不支援 annotation / crop / 編輯 |
| 短說明浮層 | `Popover` / `HoverCard` | Popover 是輕量非阻斷,FileViewer 是阻斷 fullscreen |
| 操作確認 | `Dialog` | Dialog 是 modal 確認流,FileViewer 是內容消費 |

---

## Anatomy

```
┌──────────────────────────────────────────────────────────┐  ← data-theme="dark" subtree
│ Toolbar(--chrome-header-height,bg-surface-raised border-b)│
│  [icon] file.name …(ellipsis)                            │
│                           [ZoomInput] [Info] [DL] [X]    │  ← zoom→info→download→close(影響力遞增)
├──────────────────────────────────────────────────────────┤
│                                              ┌──────────┐│
│  ←  (absolute,hover-fade)                   │InfoPanel ││
│                                              │ w-80     ││
│              <CurrentRenderer />             │ h-full   ││
│         (ImageRenderer / Fallback / ...)     │          ││
│                                              │ readOnly ││
│                                   →          │  textarea││
│                                              │  metadata││
│                                              └──────────┘│
├──────────────────────────────────────────────────────────┤
│ Filmstrip(h-24,bg-surface-raised border-t,水平捲動 thumb) │
│  [■][■][◼][■][■] …  ← 64×64 thumbnails + fade mask      │
└──────────────────────────────────────────────────────────┘
```

**分區決策**:
- **Toolbar 高度 = `--chrome-header-height`**(隨 page density:md=48 / lg=56)——與 InfoPanel header 同高,視覺對齊;**code 已消費 `<ChromeHeader>` primitive**(Toolbar + InfoPanel header,皆 `<ChromeHeader>` **繼承 page density**,2026-06-15 移除 lockDensity),高度由 primitive 內部套 `h-[var(--chrome-header-height)]`(`chrome-header.tsx`),tsx 不硬寫 height className。**跨家族 SSOT pointer**:FileViewer Toolbar + InfoPanel header 屬 **Chrome header(Fixed-h)家族**,border / padding / dismiss size / withTabs 跨家族契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。FileViewer **不鎖 density**(全 surface 繼承 page;原 `lockDensity="lg"` 只鎖兩個 header、沒鎖 body → header(px-loose@lg=24)與 body(px-loose@page=16)左緣不對齊 = 圖二 bug,已移除,見 `density.spec.md` 消費者清單)。
- **Viewport `flex-1`**——填滿剩餘空間;InfoPanel 透過 `w-80 shrink-0` 從右側切出,不吃 viewport 自然寬
- **Filmstrip 固定 h-24**——預留 thumb 64 + padding;只在 `showFilmstrip && files.length > 1` 時顯示
- **Prev/Next arrows 絕對定位**——避免 layout shift,只在 `files.length > 1` 渲染

---

## Toolbar 三分區(對齊 action-bar pattern)

FileViewer Toolbar 消費 `patterns/action-bar/action-bar.spec.md` 的**左中右三分區**(非 primitive,是 layout 原則):

```
┌────────────────────────────────────────────────────────────────┐
│ [🗎] filename.ext          [Zoom controls]    [Info][DL][X]    │
│     └─ context(左)         └─ data op(中)    └─ action(右)     │
└────────────────────────────────────────────────────────────────┘
```

| 區 | 職責 | FileViewer 對應 |
|---|---|---|
| **左 Context** | 告訴 user「在看什麼」| File type icon + file name(occupy 可用寬度 truncate) |
| **中 Data operation** | 對當前資料的控制 | ZoomInput(`[−][%][+][⌄]`) |
| **右 Action** | session-level 影響力遞增的動作 | Info → Download → Close(見下「順序」) |

**File-type icon 顏色規則**:icon 代表 filename 的**意象**(「這是什麼檔」),依本 DS「icon 與 label 同色」原則走 `text-foreground`,**不走** `text-fg-muted`(後者是裝飾性 / 輔助 icon 的色階)。

### 按鈕順序(canonical triangulation)

**順序:zoom → info → download → close**。

這個順序是三份 DS canonical 交叉驗證的結果:

1. **`patterns/action-bar/action-bar.spec.md`「全局排序:primary 在業務層最右」**——影響力遞增(低→高)
2. **`components/Notice/notice.spec.md` dismiss X 永遠在最右**——關閉動作 always rightmost
3. **`components/Dialog/dialog.spec.md` close 靠右是跨平台慣例**——macOS / Windows / Web 一致

遞增邏輯:
- **zoom** — 同一張檔案的微調(影響範圍:當前 renderer 的 transform state),影響最小
- **info** — 切換附加資訊面板(影響範圍:layout,不破壞現有內容)
- **download** — 把內容搬出 viewer(影響範圍:外部檔案系統,不可逆副作用)
- **close** — 結束整個 viewing session(影響範圍:最大,unmount 所有 state)

### Dismiss canonical(Close X)

Toolbar 右側 `X` + InfoPanel header `X` **都走 `<Button iconOnly dismiss size="sm" />`**(dismiss canonical,見 `components/Button/button.spec.md`「Dismiss 視覺類」+ `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」)。理由:

- **Canonical scope**:FileViewer 是 overlay chrome(Dialog 類),chrome corner close X 歸 Button dismiss 分支(button.spec.md「dismiss prop 規則」典型 case 段:「Dialog / Sheet / Popover / Alert **chrome corner close X** → `<Button iconOnly dismiss />`」);Inline Action dismiss 分支保留給 host chrome padding 內的 Tag / Input clear / Notice 等場景
- **視覺一致**:`dismiss` prop 強制 `variant="text"` + icon 色 `fg-muted → hover foreground`,跟 Inline Action dismiss 外觀一致(cross-implementation dimming canonical),無視覺差異
- **語義區隔**:跟其他 `<Button iconOnly>`(info / download)屬同一元件家族(都是 chrome button),以 `dismiss` prop 明示「結束 session」語意,比 Button vs Inline Action 兩元件混用更清晰

### Prev/Next 檔案切換(idle-fade,對齊 Google Photos / Dropbox lightbox / Carousel)

viewport 左右的 `<` `>` 切檔案箭頭**預設 opacity-0**,由 React state `armVisible` 控制浮現:viewport `onMouseMove` 顯示 → 持續 **2.5s 無 mouse move** 自動淡出 → `onMouseLeave` 立即隱藏(JS idle-timer 機制,對齊 Google Photos lightbox 風格);另加 `focus-within:opacity-100`(a11y CSS fallback,鍵盤 focus 強制顯示)。理由:

- **世界級對照**:Google Photos / Dropbox preview / PhotoSwipe / Instagram lightbox 皆 hover/idle-fade — 常駐箭頭干擾 media(檔案)閱讀。**用 JS idle-timer 而非純 CSS `group-hover`**:CSS hover 在滑鼠停留時箭頭恆顯,idle-timer 才能做到「停留也淡出」的世界級沉浸體驗
- **a11y**:鍵盤 focus 時強制顯示(`focus-within:opacity-100`,不 hover 也知道有箭頭可用)
- **邊界**:第一/最後一張時直接不 render(非 disabled state,避免視覺噪音)
- 對齊 `components/Carousel/carousel.spec.md`「Arrow 行為」canonical

---

## Renderer Registry(延伸機制)

核心 extensibility:FileViewer shell 只懂 `FileRenderer` interface,不硬寫 image / pdf / video 邏輯。

```ts
interface FileRenderer {
  id: string
  canRender: (file: FileInfo) => boolean
  component: React.ComponentType<FileRendererProps>
}
```

**Resolution 順序**:
1. User-registered renderers(依註冊順序)
2. Built-in `ImageRenderer`
3. `FallbackRenderer`(兜底,永遠回 true)

第一個 `canRender(file)` 回 true 的 renderer 渲染。**Fallback 永遠最後**。

**Capability 宣告**:Renderer 透過 `onCapabilitiesChange(caps)` 告訴 shell 當前支援哪些功能。Shell 據此動態決定 toolbar 內容。MVP 只有 `zoom: boolean`,未來擴充 `rotate` / `pageNumber` 不破壞現有 renderer。

**擴充範例**:
```ts
registerFileRenderer({
  id: 'pdf',
  canRender: (f) => f.mimeType === 'application/pdf',
  component: PDFRenderer, // 消費 react-pdf,emit pageNumber capability
})
```

Shell 看到 `pageNumber` capability 時自動在 toolbar 顯示 page navigator(MVP 未實作,預留 interface)。

---

## ImageRenderer 規則

- 消費 `react-zoom-pan-pinch`(zoom + pan 行為 primitive,無 UI);世界級產品 Figma / Miro / PhotoSwipe 同流派 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **圖 render 走 natural size**(不 object-contain):transform scale 管實際顯示大小;避免 CSS pre-scale 跟 transform scale 雙重縮放導致 fit-to-* 算法混淆
- **onLoad 自動 fit-to-page**(世界級 canonical:Figma / Preview.app / Acrobat 開圖預設 fit-page,非 100%)——renderer 計算 `min(cw/iw, ch/ih)` 對應的 zoom %(`image-renderer.tsx` computeFitScale),透過 `onZoomChange` 回報 shell 更新 UI 顯示真實倍率(例:40%) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **zoom = 100% 語義 = natural pixel size**(跟 Figma / Preview 一致),不是 CSS-contained 的 fit scale
- Scroll wheel 縮放;`zoom > 100%` 時可拖曳 pan
- **Wheel step canonical 為 `0.03`(每 tick ~3% scale delta)**——對齊 Figma / Preview.app / Photoshop 細緻度。原 0.1(10%)太粗,接近 Google Slides 離散慣例非世界級連續 zoom。library 內部 multiplicative 乘算 → log 視覺等距(符合「等距」需求)。註:原想加 `smoothStep: 0.005` 作 trackpad 細緻度,但當前 react-zoom-pan-pinch 版本型別不含該 key,**未啟用**;若需要升級到有此 prop 的版本或切 `smoothScroll` API <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **Zoom anchor(中心點)canonical**:
  - **Wheel zoom** — anchor 固定在 **cursor pointer 位置**(react-zoom-pan-pinch default,對齊 Figma / Photoshop / 瀏覽器 cmd-scroll canonical)。user 滑鼠指哪,zoom 就以那點為中心,內容不會「跑掉」 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
  - **± button zoom / preset / fit / input 打字**(沒 cursor 位置時)— 走 library canonical `api.centerView(targetScale, 200)`,自動處理 scale + 置中 + animation + bounds。**不自算 `setTransform`**(動畫期間讀 stale positionX 會漂)
  - **Fit to width / page** — 算 scale emit 回 shell,經由 `centerView` 重新置中
  - **100% 重設**(user 按 `0` 鍵;雙擊是 fit↔100% 條件式 toggle,見下「雙擊」bullet)— `centerZoomedOut: true` 讓 ≤100% 時自動 center,避免內容停在容器角落
  - 結果:user 看哪,zoom 完 **看哪**,視覺焦點不漂移 — 世界級 media viewer 共識
- Min scale 10%,max scale 400%
- **雙擊 = toggle fit-page ↔ 100%**(對齊 Apple Photos / Preview.app / Imgur / PhotoSwipe canonical):當前 zoom 在 fit-page ±5pt 內 → 跳 100% natural;否則 → 回 fit-page。`0` 鍵才是固定重設 100%(`file-viewer.tsx:835`),兩者不同(`image-renderer.tsx:144`)
- 切換檔案時 shell **不重設 zoom**——把「下一張該怎麼初始化 zoom」的決定權交給 renderer:image-renderer 自己 watch `file.url` 變化 → reset loaded → onLoad → 重 fit-page(含 cache 命中時 `<img complete>` 主動觸發,避免 onLoad 不 fire 卡在上一張的 zoom)。原本 shell `setZoom(100)` 在 cache 命中時會卡 100% 不 fit,已移除

---

## ZoomInput 規則

### 結構(2026-04-21 canonical)

```
[−]  [ % input  ⌄ ]  [+]
 │         │         │
 │         │         └─ Button iconOnly Plus(zoom in 到下一個 preset)
 │         └─ Input size="sm" autoWidth(field-sizing:content 隨 value 文字寬)
 │            + text-center + tabular-nums;endSlot = ChevronDown(觸發 DropdownMenu)
 └─ Button iconOnly Minus(zoom out 到上一個 preset)
```

**消費 DS primitive**:
- `<Button>` iconOnly size="sm" 作 ± 按鈕(Minus / Plus icon,disabled 於邊界)
- `<Input size="sm" autoWidth>` 作 % 輸入(autoWidth 隨輸入文字寬;Toolbar inline editing canonical)
- Input `endSlot` escape hatch 包 `<DropdownMenuTrigger asChild>` + `<ItemInlineActionButton icon={ChevronDown}>` 作 chevron(非宣告式 `endAction`——chevron 同時是 DropdownMenu trigger,需 asChild 把 trigger 行為掛到 inline action)
- `<DropdownMenu>` 作 preset + fit 選單(取代先前 `<Popover>` + 手刻 button list)

### 互動規則

- 直接輸入數字 + Enter 套用;輸入非法值 blur 時還原為上一個有效值
- 範圍 **10–400**(對齊 `ImageRenderer.MIN_SCALE = 0.1` / `MAX_SCALE = 4.0`);± 按鈕在邊界 disabled
- ± 按鈕跳到下一個 preset(`10 / 25 / 50 / 75 / 100 / 125 / 150 / 200 / 400`),不是固定 step
- ⌄ DropdownMenu 內容分兩組:**Fit options 在上**(Fit to width / Fit to page)/ **preset 百分比在下**,`<DropdownMenuSeparator />` 分組
- 當前 zoom 在 preset 中的那項視覺標示 `bg-neutral-selected`

### 同 flex 列幾何鐵律(CLAUDE.md 規則)

`[−]` / `[%input]` / `[+]` 三個 slot **都是 h-field-sm**,統一高度確保 gap 不被 hover bg 吃掉。Toolbar 包在 `<ChromeHeader>`(繼承 page density,2026-06-15 移除 lockDensity)內 → h-field-sm 隨 page density 解析(`uiSize.spec.md`:sm 在 md = 28px / lg = 32px)。Button iconOnly size="sm" aspect-square 與 Input size="sm" 同高,視覺嚴格對齊。

### Why inline(不抽獨立 primitive)

目前只 FileViewer 消費。當 PDF / Video viewer 也需要時,再依「建立前必查既有 pattern」原則從 FileViewer 抽出升級為 `patterns/zoom-control/` pattern primitive。

---

## InfoPanel 規則

- **寬度固定 w-80(320px)**——對齊 Figma right panel(320)的業界慣例;Google Photos 用 360 偏寬,FileViewer 走 Figma 偏窄以讓 viewport 多一些空間 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **Header 高度 = `--chrome-header-height`**(隨 page density:48 md / 56 lg)——與 Toolbar 等高,視覺對齊;消費 `<ChromeHeader>`(繼承 page,2026-06-15 移除 lockDensity)
- **內容分兩區**:
  - 「說明」Textarea(可編輯 / readOnly 依 `readOnly` prop)
  - 「檔案資訊」`<dl>`:檔名 / 類型 / 大小 / 自訂 metadata 條目
- **預設關閉**,user 主動 toggle(I 鍵 or Info 按鈕);切檔案時 InfoPanel 保持同步顯示下一個 file 的資訊
- **Description 變化持久化**:onBlur 時若 draft 與原值不同,呼叫 `onDescriptionChange(fileId, description)`;consumer 負責寫後端
- **Readonly 時不觸發 onDescriptionChange**;placeholder 改為「尚無說明」

---

## Filmstrip 規則

- **僅在 `showFilmstrip === true && files.length > 1` 顯示**
- **Thumb 固定 64×64**——小到能塞 10+ 檔在畫面上,大到能辨識內容
- **thumb gap `gap-[var(--layout-space-tight)]`**(density-aware token,非寫死 gap-1)——世界級 lightbox(Google Photos / Dropbox)都用緊密 gap
- **當前 thumb**:`ring-2 ring-primary`(明顯 outline);其他 `ring-1 ring-border` + `hover:ring-border-hover`
- **ScrollIntoView**:切換當前 file 時 active thumb 自動 scroll 到視野中央
- **消費 `horizontal-overflow` pattern**:隱藏 native scrollbar + fade-mask + scroll arrows(canScroll 時)
- **Thumb 內容**:image 用 `<img object-cover>`;非 image 用 FileText icon + ext label
- **A11y**:整個 strip `role="group"` + `aria-label`,每個 thumb `<button>` + `aria-current`(當前)。**非 `tablist`**——filmstrip 是「選圖導航」非「切換 N 個 tabpanel」,lightbox 單一 viewport 不符 W3C tabs pattern(tab MUST 對應自己的 tabpanel + roving)。對齊 APG grouped-carousel + PhotoSwipe / codeaccessible.com lightbox 共識(2026-06-01 M26 source-verified)

---

## 鍵盤支援

| 鍵 | 行為 | 生效條件 |
|---|------|---------|
| `Esc` | 關閉 viewer | Radix Dialog 預設 |
| `ArrowLeft` | 上一個檔案 | `files.length > 1` |
| `ArrowRight` | 下一個檔案 | `files.length > 1` |
| `+` / `=` | zoom in(下一個 preset) | `capabilities.zoom === true` |
| `-` | zoom out(上一個 preset) | `capabilities.zoom === true` |
| `0` | 重設 zoom 到 100% | `capabilities.zoom === true` |
| `F` | Fit to page | `capabilities.zoom === true` |
| `I` | 切換 InfoPanel | 永遠 |

**焦點在 input / textarea / contentEditable 時不觸發**——避免 user 打字時被快捷鍵劫持(寫入 description 打到 `-` 不應 zoom out)。

---

## 視覺 Token

| 區塊 | Token | 說明 |
|------|-------|------|
| Overlay | `bg-overlay` | 與 Dialog 共用;覆蓋背景頁面 |
| Viewport bg | 無自身 bg(`bg-overlay` 透出) | Q1 2026-04-30 canonical(`file-viewer.tsx`「Q1 mask 透明度」註解):outer 刻意不設 bg,半透明 Overlay 透出 image 周圍,對齊 Notion / Dropbox lightbox mask idiom |
| Toolbar / Panel / Filmstrip bg | `bg-surface-raised` | chrome 為遮蓋型浮層必須不透明;**不用 bg-surface**(dark = white α8 半透明,outer 透明時失去 backdrop 會洗白)|
| 分隔線 | `border-divider` | Toolbar 底 / InfoPanel 左 / Filmstrip 頂 |
| 檔名文字 | `text-body-lg text-foreground` | Dialog title 同級 |
| 按鈕 | `Button variant="text" size="sm" iconOnly` | viewer chrome 密集 UI 用 text variant(不搶焦點) |
| Thumb 當前選中 | `ring-2 ring-primary` | 選中 canonical(與 DS 其他選中視覺一致) |
| Thumb 預設 | `ring-1 ring-border` + hover `ring-border-hover` | |

**Dark mode**:FileViewer chrome 鎖 dark(`data-theme="dark"` subtree);背景頁面的 theme 不影響 viewer chrome——viewer 是獨立沉浸式 context,類似 Tooltip / 全螢幕影片播放器的 convention。

**Density**:FileViewer **全 surface 繼承 page density**(2026-06-15 移除 lockDensity — 原本只鎖兩個 ChromeHeader、沒鎖 body → header(px-loose@lg=24)與 body(px-loose@page=16)左緣不對齊,圖二 bug)。chrome-header-height 隨 page(48 md / 56 lg),header 與 body 同密度 → 左緣對齊;Filmstrip `h-24`(96px)+ thumb 64×64 屬媒體展示框尺寸,**刻意不隨 density 放大**(viewer 是展示殼不是工作區)。Toolbar 內 `<Button size="sm">` 與 `<ZoomInput h-field-sm>` 隨 page density(sm 在 md = 28px / lg = 32px)。

---

## 狀態處理的職責邊界

| 狀態 | 處理方式 |
|------|---------|
| **Loading**(圖片載入中) | 由 renderer 自己處理(例:`<img>` 的自然 loading,未來 PDFRenderer 可在內部秀 skeleton)。shell 不提供全頁 loading state(shell / renderer 分工見「Renderer Registry」+「ImageRenderer 規則」) |
| **Empty**(`files.length === 0`) | 不渲染整個 viewer(return null);consumer 透過 `open=false` 控制 |
| **Error**(圖片載入失敗 / renderer crash) | MVP 不處理——renderer 自己處理;未來可加 error boundary 幫 Fallback 兜底 |
| **Unknown file type** | FallbackRenderer 自動兜底,顯示 Empty + 下載提示(resolution 順序見「Renderer Registry」) |

**Dark mode**:整個 viewer chrome 鎖 dark,不隨頁面 theme 切。

---

## 禁止事項

- ❌ **不 nested FileViewer**——viewer 疊 viewer 焦點陷阱崩壞;要在 viewer 內展示另一個檔案,改 filmstrip 切換
- ❌ **不用 FileViewer 做編輯**——viewer 是**檢視**殼,需 annotate / crop / mask 改用專屬編輯器
- ❌ **不硬寫 shadow-md/lg 等 Tailwind 預設陰影**——用 `shadow-[var(--elevation-N)]` (N ∈ {100,200})(對齊 DS 陰影 token 系統)
- ❌ **不繞過 registry 直接 switch file.mimeType 渲染**——破壞 extensibility,新檔案類型被迫改 shell;一律走 `registerFileRenderer`
- ❌ **不把 toolbar 按鈕順序改成 close → zoom**——違反「影響力遞增」canonical,close always rightmost 是跨 DS 慣例
- ❌ **不自包 TooltipProvider / ThemeProvider**——對齊 DS「元件不得自包 Provider」規則,共享 app-level Provider
- ❌ **不讓 keyboard shortcut 在 input/textarea focus 時觸發**——`+`/`-`/`I` 等與打字衝突,必須排除

---

## A11y 預設

Radix DialogPrimitive 自動處理:
- `role="dialog"` + `aria-modal="true"`
- `<DialogPrimitive.Title>`(sr-only)自動成 `aria-labelledby` 目標——screen reader 開啟時讀「檔案檢視器:{file.name}」
- Focus trap:焦點鎖在 viewer 內
- Esc 關閉(Radix DismissableLayer 預設)
- Backdrop click 關閉**非** Radix outside-click:Content 為 `fixed inset-0` 全螢幕覆蓋整個 viewport、Overlay 是其後層 sibling,Radix outside-click 不會 fire。實際靠自寫 geometric onClick handler(判斷 click 座標是否落在 `<img>` rect 外 → 才關)

自加的 a11y:
- 所有 iconOnly button 皆有 `aria-label`(中文,跟 DS 其他元件風格一致)
- Filmstrip `role="group"` + `aria-label` + thumb `<button>` + `aria-current`(非 tablist;見「Filmstrip 規則」段理由)
- InfoPanel 用 `<aside aria-label="檔案詳細資訊">` 語意標記
- `onOpenAutoFocus={e => e.preventDefault()}` 避免焦點自動跑進第一個 tabbable(讓鍵盤從 viewport 開始)

---

## 相關

- `../Dialog/dialog.spec.md` — 一般 modal 對話框(FileViewer 是 fullscreen variant,直接用 Radix primitive 而非 Dialog wrapper)
- `../DropdownMenu/dropdown-menu.spec.md` — ZoomInput preset / fit 選單消費(取代先前 Popover)
- `../Empty/empty.spec.md` — FallbackRenderer 佈局
- `../AspectRatio/aspect-ratio.spec.md` — Filmstrip thumb 固定比例
- `../ScrollArea/scroll-area.spec.md` — InfoPanel body 高度受限時 scroll(`file-viewer.tsx:478`);filmstrip 不用 ScrollArea(刻意走 fade-mask,屬 horizontal-overflow pattern)
- `../../patterns/horizontal-overflow/horizontal-overflow.spec.md` — Filmstrip 水平捲動 + fade mask
- `../../patterns/action-bar/action-bar.spec.md` — Toolbar 按鈕順序 canonical
- `../FileItem/file-item.spec.md` — 上傳清單列元件(與 FileViewer 不同用途,FileItem 是 list item,FileViewer 是 fullscreen preview)
