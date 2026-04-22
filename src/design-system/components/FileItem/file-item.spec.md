# FileItem 設計原則

**檔案上傳列表項目**——顯示檔案名稱、上傳進度、狀態（uploading / completed / error）。

**實作基礎**：組合元件——Icon + Text + ProgressBar + Button，無 external primitive base。

**Layout Family**：CLAUDE.md 4-Family Model **Family 2（List item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「List item layout」章節的 reading-mode 規格。FileItem 在 rich mode 用 avatar 作 item boundary。

**命名 rationale**：`compact / rich` 表達精簡 vs 完整內容呈現（對齊 Discord embed type='rich' / Slack rich preview / Notion rich text 世界級 idiom）。不叫 `lg/sm`——兩者是資訊量不同的展示策略，不是同一結構的尺寸縮放。

---

## 何時用

- **檔案上傳清單**：drag-drop upload、multiple file selector 的選中檔案列表
- **附件展示**：email / comment / ticket 的附件列表（rich mode 顯示縮圖 + 檔名）
- **批次處理進度**：CSV / JSON 匯入的逐檔進度追蹤（compact mode，預設）
- **上傳錯誤回報**：顯示哪些檔案失敗 + 重試按鈕

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 只是顯示已上傳檔名（純連結）| `LinkInput` / plain `<a>` | FileItem 承載 upload 狀態，靜態連結不需要 |
| 下載進度（不是上傳）| 自訂 download 元件 | FileItem 專為 upload 流程設計，下載有不同 UX（瀏覽器原生）|
| 照片 / 影片 gallery | Grid / Carousel | Gallery 需要預覽 grid 佈局，FileItem 是 list 單行 |
| 資料夾階層 | `TreeView` | FileItem 是平面列表，階層用 tree |

---

## Mode

| Mode | Prefix | Typography | 適用場景 |
|---|---|---|---|
| `compact`（預設） | Paperclip icon 16px | 掃描模式 | 批次上傳的一般檔案（CSV、JSON） |
| `rich` | Avatar 48px square | 閱讀模式（ListItem md） | 需要縮圖預覽的檔案（圖片、文件） |

compact 為預設——多數 upload 清單是「快速掃視多檔」場景，只有需要縮圖預覽才升級為 rich。

## Typography（對齊 item-layout 兩種閱讀模式）

| | compact（掃描模式，預設） | rich（閱讀模式，完整呈現） |
|---|---|---|
| label | text-body (14px) leading-compact (1.3) | text-body (14px) 預設行高 (1.5), font-medium |
| description | text-caption (12px) leading-compact, fg-secondary | text-body (14px) 預設行高 (1.5), fg-secondary |

## 結構

### compact（預設）

```
[📎]  [ label + desc?   suffix ]
      [ ██████████░░░░░░░░░░░░ ]
```

標準 item-layout row（icon prefix）。content 和 bar 之間 gap-2（8px）。

### rich（完整呈現）

```
[Avatar 48px]  [ label + desc        suffix ]
               [  (justify-between)         ]
               [ ██████████░░░░░░░░░░░░░░░░ ]
```

Avatar 獨立在左（不在 item-layout 內）。右側 flex-col justify-between，minHeight = 48px。
ProgressBar 底部對齊 avatar 底部。justify-between 自動分配 gap(有 desc 時 ≈ 2px)。

**Avatar 尺寸約束**:rich mode 的 avatar 高度必須容納 label + description + ProgressBar 三段垂直內容(具體像素計算見 `file-item.tsx`)。

## Padding

| Mode | 規則 |
|---|---|
| compact(預設) | 消費 item-layout 公式(py 隨 size / density 變化,padding / gap 對齊 menu item 規格) |
| rich | py 固定(高度由 avatar 決定,不走 row 公式),padding / gap 採 rich 專屬 token(具體值見 `file-item.tsx` cva) |

## 邊框 / 背景(AR15-21 canonical,2026-04-21 · 2026-04-22 擴充)

| Mode | 容器視覺 | Rationale |
|------|---------|-----------|
| **rich**(所有 status) | `border border-divider rounded-md bg-surface` | Rich mode **永遠是「檔案 card」**,不因 status 改變——Slack / Notion / Linear attachment 皆獨立 card;邊框讓每個 row 視覺上是自立單元 |
| **compact + 有 progress**(上傳中 / 類 Upload manager 完成態) | 無背景、無邊框,只靠 progress bar 提供 affordance | 「正在發生」/「剛發生」的動態 narrative,progress 本身就是視覺焦點 |
| **compact + 無 progress**(form attachment 靜態態) | `bg-neutral-3 rounded-md` | 靜態清單(form / 訊息附件)背景色區隔出「檔案 row」邊界,跟純文字內容區分;hover 時 `bg-neutral-hover` 覆蓋 |

**❌ 反例**:
- Rich mode 無邊框 → 與一般 list item 無法區分,跟 MenuItem 混淆
- Compact mode 靜態 item 無 bg → 純文字列,使用者不知這是「可點下載的檔案」
- 外層 list wrapper 加邊框 / `overflow-hidden` → 雙重邊框(list 邊框 + item card 邊框)視覺干擾;並強制邊框相黏破壞 card 自立性(2026-04-22 user 糾正)

---

## 可下載狀態 canonical(2 use case)

**核心區分**:「檔案可下載」不是單一 state,而是 **2 種使用場景**,各自有 prop signature + 視覺節奏。

### Type A — Upload manager(Google Drive / Dropbox 類上傳管理 box)

**語意**:上傳流程的延續——完成後**仍保留 progress + status narrative**,使用者能回顧「這檔剛被上傳且已完成」。

| 屬性 | 值 |
|------|---|
| `status` | `"completed"`(持續保留,不清除) |
| Progress bar | 100% 完成條(不隱藏) |
| Status icon | 綠 ✓(passive) |
| hover 行為 | **status slot hover-swap**:✓ → Download ↓(icon button)觸發 `onDownload` |
| Row-click | **亦可**(同 Type B):consumer 傳 `onClick` 讓整 row 可點 → 打開 FileViewer / 下載(與 hover-swap 並存,consumer 擇一或都用) |
| Rich 背景 | `border card`(永遠) |
| Compact 背景 | 無(progress bar 還在) |
| 刪除按鈕 | optional(業務權限) |

```tsx
<FileItem
  mode="rich"
  name="report.pdf"
  status="completed"
  onDownload={() => download(id)}
  actions={<Button size="xs" iconOnly variant="text" startIcon={Trash2} onClick={del} aria-label="刪除" />}
/>
```

### Type B — Form attachment(表單 / 訊息附件靜態態)

**語意**:附件列表——檔案「已經在那」,不再是 upload 動作的延續。

| 屬性 | 值 |
|------|---|
| `status` | **`undefined`**(不傳;無 progress / 無 status icon) |
| Progress bar | 無 |
| Status icon | 無 |
| hover 行為 | 整 row `hover:bg-neutral-hover` + cursor-pointer |
| Row-click | **`onClick` 為主要 affordance** → download / FileViewer(consumer 決定) |
| Rich 背景 | `border card`(永遠) |
| Compact 背景 | `bg-neutral-3`(區隔「這是檔案 row」) |
| 刪除按鈕 | optional(業務權限) |

```tsx
<FileItem
  mode="compact"
  name="report.pdf"
  description="2.3 MB"
  onClick={() => openViewer(id)}
  actions={hasDeletePermission ? <ItemInlineActionButton icon={Trash2} size="sm" onClick={del} /> : undefined}
/>
```

**選用判斷**:
- 上傳剛發生 / 還在 upload box 情境 → Type A(保留 narrative)
- 檔案進駐表單 / 留言 / 既有資料 → Type B(靜態)

---

## List wrapper canonical(多 item 間距)

`FileItem` 連續排列時,**list wrapper 的 gap 取決於 list 內是否可能出現 standalone card/pill**(公式詳 `patterns/element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」)。

### 單一類型 list

| List 內容 | 永久視覺層分類 | gap | 為什麼 |
|----------|--------------|-----|--------|
| 全 rich | standalone card(`border + bg-surface + rounded-md + inset`) | **`gap-2`**(8px) | Card 邊框融合 |
| 全 compact Type B(無 status,`bg-neutral-3`) | standalone pill(`bg + rounded + inset`) | **`gap-1`**(4px) | bg 塊融合 |
| 全 compact Type A(有 status,有 progress bar) | flush + 底部 progress bar 分隔線 | **0 gap 合法** | progress bar = 分隔線型 affordance |

### 混合類型 list(real-world:email 草稿 / 多步驟 upload flow)

取**最保守(最大)gap**,因為任意相鄰組合一定不出事:

| Mixed 組合 | gap 決策 | rationale |
|-----------|---------|-----------|
| Rich + Compact 任意混用 | **`gap-2`** | rich 永遠必 gap-2,取 max |
| Compact Type A + Type B 混用 | **`gap-1`** | 兩個 Type B 相鄰時會 bg 融合 → 必防 |
| Compact Type A only(可確定全 progress bar) | 0 gap 合法 | 同「全 Type A」 |

**判斷流程**(consumer 寫 list 時):
1. 若 list 只有 compact 且**所有 item 保證有 status**(e.g., Google Drive upload box 只顯示上傳中 / 剛完成的檔案)→ 0 gap
2. 若 list 可能包含 compact Type B(`bg-neutral-3` 靜態 item,如表單附件、留言附件)→ `gap-1`
3. 若 list 含 rich → `gap-2`

### List wrapper 本身不加視覺

- **無 border / 無 rounded / 無 overflow-hidden**:FileItem rich 自帶 card,list 若再加外框 → 雙重 card / 強制邊框合併(user 2026-04-22 指出的 `border rounded-lg overflow-hidden` 反例)

```tsx
// ✅ Rich list
<div className="flex flex-col gap-2">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>

// ✅ Compact Type B(form attachment,靜態灰底)
<div className="flex flex-col gap-1">
  {files.map(f => <FileItem key={f.id} mode="compact" {...f} />)}
</div>

// ✅ Compact Type A only(upload manager,全有 status)
<div className="flex flex-col">
  {files.map(f => <FileItem key={f.id} mode="compact" status={f.status} progress={f.progress} {...f} />)}
</div>

// ✅ Compact mixed Type A + Type B(email 草稿、舊附件 + 新上傳)
<div className="flex flex-col gap-1">
  {allFiles.map(f => <FileItem key={f.id} mode="compact" status={f.isUploading ? 'uploading' : undefined} {...f} />)}
</div>

// ❌ 反例:list 加外框 + overflow-hidden
<div className="flex flex-col border rounded-lg overflow-hidden">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>
```

**List wrapper 本身的視覺**(2026-04-22 user 直指):
- **不應該有外框**(無 `border` / 無 `rounded-*` / 無 `overflow-hidden`)
- FileItem 各自 own 視覺(rich card / compact bg),list wrapper 只負責垂直排列 + gap

```tsx
// ✅ Rich list
<div className="flex flex-col gap-2">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>

// ✅ Compact form attachment list(靜態,有 bg-neutral-3)
<div className="flex flex-col gap-1">
  {files.map(f => <FileItem key={f.id} mode="compact" {...f} />)}
</div>

// ❌ 反例:list wrapper 加 border + overflow-hidden 強制邊框相黏
<div className="flex flex-col border rounded-lg overflow-hidden">
  {files.map(f => <FileItem key={f.id} mode="rich" {...f} />)}
</div>
```

**Clickable → 下載 / 預覽 canonical**(AR15):
- FileItem 提供 `onClick` prop,consumer 傳入即進 clickable 模式(hover + cursor + keyboard)
- Type A / Type B 都可以用 `onClick`(Type A 可跟 `onDownload` hover-swap 並存)
- consumer 決定具體行為(download / FileViewer),元件只提供 row 可點擊能力

## ProgressBar

**SSOT**:FileItem 不自 roll bar,消費 `../ProgressBar/progress-bar.spec.md` 元件(Radix Progress 包裝 + 本 DS token)。避免視覺漂移。

| 屬性 | 值 | 依據 |
|---|---|---|
| 消費元件 | `<ProgressBar status={...} value={...} height={compact ? 2 : undefined} />` | 本 DS ProgressBar SSOT(公開 API 固定 4px;`height` 是 internal-only 逃生艙,FileItem 為唯一合法 consumer) |
| status 映射 | `uploading → inProgress` / `completed → success` / `error → error` | ProgressBar `status` 原生支援 |
| height 映射 | `compact → 2px` / `rich → 4px`(預設) | compact mode 極密集 row layout 需要更細 track;rich mode 走 DS 預設 4px |
| value | `status === 'completed' ? 100 : progress` | completed 永遠 100% |

改動進度條視覺(高度 / 色 / 動畫) → 去 ProgressBar 改,**本元件無本地 bar 實作**。

## Actions（suffix,row dedicated region canonical）

Consumer 自行組合。按 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Row action 絕對值 cap」,**row dedicated action 絕對值 cap = ≤ 24px,不隨 row tier 放大**。依 row 高度分兩種實作:

| Mode | Row 高度 | 實作 | 尺寸 |
|------|---------|------|------|
| `rich` | 56 (≥ 28) | **Button iconOnly `size="xs"`**(24 固定,不隨 row 放大) | 24 |
| `compact` | 24 | **ItemInlineActionButton**(row 太小容不下 Button xs 24,會填滿 row 無呼吸) | icon 16, hover-bg 22 |

```tsx
// Rich(row 56)→ Button xs iconOnly 固定 24(≤ 24 cap)
<FileItem actions={
  <Button size="xs" iconOnly variant="text" startIcon={Trash2} aria-label="刪除" onClick={del} />
} />

// Compact(row 24)→ Inline Action(因 Button xs 24 會填滿 row)
<FileItem actions={
  <ItemInlineActionButton icon={Trash2} size="sm" aria-label="刪除" onClick={del} />
} />
```

**為什麼 Row ≥ 28 用 Button xs 固定**:row 放大不代表 action 要放大——世界級 DS(Material DataGrid / Polaris / Atlassian / Apple HIG)row action 都是固定小 icon button(20–24),row 高度變化只影響 row padding 與 content,不影響 action 尺寸。

**為什麼 Row ≤ 24 用 Inline Action**:compact row 高度 24 裝不下 Button xs(24)——Button 會填滿整個 row,失去 row padding 與 icon 呼吸空間。Inline Action(icon 16 + hover-bg 22)剛好符合「action ≤ row - padding」的呼吸需求。

**Trash/Delete 不是 dismiss 語意**:`dismiss` 嚴格保留給「X close overlay session」(Dialog / Sheet / Popover / Alert close X)。Row 的 Trash/Delete 語意是 `onRemove`(從集合移除一個 item,見 CLAUDE.md `# 元件 Props 命名原則`「onRemove」),**不套 Button `dismiss` prop**:
- Rich mode Button `variant="text"` 預設 icon 已是 fg-muted → foreground,hover 弱化視覺自然呈現
- Compact mode ItemInlineActionButton 本來就 fg-muted → foreground(Inline Action default)

參見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Real case 表」+「Row action 絕對值 cap」。

## Status ↔ Action hover-swap（passive → active affordance）

**世界級 UX pattern**（Gmail / Slack / Dropbox 附件 convention）:status 預設是 passive 狀態標記(綠 ✓ / 紅 ✗),使用者 hover 整個 row 時,**狀態 icon 自動換成「相應的操作」**,click 即觸發:

| status | Passive icon | Hover 換成 | Consumer handler |
|--------|-------------|-----------|------------------|
| `completed` | `CircleCheck` 綠 ✓ | `Download ↓` | `onDownload` |
| `error` | `XCircle` 紅 ✗ | `RotateCw ⟲` | `onRetry` |
| `uploading` | *(progress %)* | *(無 swap)* | — |

**幾何一致性(2026-04-22 canonical · row action ≤ 24 cap)**:status slot 容器大小 **= consumer 的 delete action 尺寸**:
- `mode="rich"` → `var(--field-height-xs)`(24 固定,與 Button xs iconOnly 同)
- `mode="compact"` → 16px(與 ItemInlineActionButton icon 同)

Passive status icon 置中於 action-sized 容器,hover 時 active action 填滿同一容器。這讓 flex gap token 測量的是**兩個同尺寸 action slot 之間的真實 gap**,不被 hover bg overflow 吃掉——status slot 尺寸 = 同 size delete slot,gap token 才能如實呈現;歷史 bug 細節見 CLAUDE.md `# 失敗記憶索引`。

世界級 DS 的幾何鐵律:**同一 flex 列的互動元素必須有統一 box 尺寸**,gap token 才能如實呈現。

**Backward compat**:consumer 若沒傳 `onDownload` / `onRetry`,status icon 永遠保持 passive(不響應 hover)——既有使用者無感。

**為什麼值得這麼做**:
- passive 階段清楚告知使用者檔案狀態(✓ / ✗ 顏色強訊號)
- hover 階段立即提供相應行動(completed → 下載 / error → 重試),不需另外挪位置做按鈕
- 符合「改一處看多處」的 design system primitive 思維:passive + active 共用 slot,不讓使用者多認一處

```tsx
<FileItem
  mode="rich"
  name="report.pdf"
  status="completed"
  onDownload={() => downloadFile(id)}   // hover ✓ → ↓
  actions={<Button size="xs" iconOnly variant="text" startIcon={Trash2} onClick={del} aria-label="刪除" />}
/>

<FileItem
  mode="compact"
  name="backup.json"
  status="error"
  description="There's something wrong."
  onRetry={() => retryUpload(id)}        // hover ✗ → ⟲
  actions={<ItemInlineActionButton icon={Trash2} size="sm" onClick={del} aria-label="刪除" />}
/>
```

## Suffix 24px 閾值

| Mode | 最大 suffix 元素 | 有 desc 時 | alignment |
|---|---|---|---|
| compact（預設） | Button xs = 24px ≤ 24px | — | `h-[1lh]` inline |
| rich | Button sm = 28px > 24px | block | `h-[calc(1lh+2px+desc_lh)]` |

## 為何無 Inspector

FileItem 決策維度是 `mode`(compact / rich)× `status`(uploading / completed / error / static)× `size`——已在 `ColorMatrix` / `ModeMatrix` / `SizeMatrix` / `StateBehavior` 四張矩陣完整覆蓋。互動 Inspector 不會比結構性矩陣對照更有教學價值——「選 mode 的 test / 選 status 的 test」是需要 side-by-side 比對的決策,不是單值試玩。

ColorMatrix 已建:展示 status × 元素(filename / description / progress bar / status icon)色彩矩陣,明示 status 只驅動 **progress bar + status icon + description** 升階,**不染容器背景**(避免整 row 轉紅蓋過其他 metadata)。Container hover / selected / disabled 則走 item-anatomy row primitive SSOT。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — 閱讀模式（compact / rich）
- `../Avatar/avatar.spec.md` — Avatar shape（rich mode 的 icon 容器）
- `../FileUpload/file-upload.spec.md` — **配對元件**:FileUpload 是拖放 / 點擊上傳區塊,FileItem 是已上傳檔案 row 顯示;兩者構成完整 file-handling 元件組
- `../LinkInput/link-input.spec.md` — 純連結（非 upload 流程）替代
- `../TreeView/tree-view.spec.md` — 階層 file structure 場景
- `../ProgressBar/progress-bar.spec.md` — ProgressBar SSOT(FileItem consumes ProgressBar for upload bar)
- `../../tokens/color/color.spec.md` — Track 底色（`bg-secondary` 使用原則）
