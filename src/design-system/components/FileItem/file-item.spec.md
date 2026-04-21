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

## 邊框 / 背景(AR15-21 canonical,2026-04-21)

| Mode | 容器視覺 | Rationale |
|------|---------|-----------|
| **rich** | `border border-divider rounded-md bg-surface` | Rich mode 是「檔案 card」——Slack / Notion / Linear attachment 皆獨立 card 呈現;邊框讓每個 row 視覺上是自立單元 |
| **compact + 有 progress**(上傳中) | 無背景、無邊框,只靠 progress bar 提供 affordance | 「正在發生」的動態狀態,progress 本身就是視覺焦點,不需額外邊框 |
| **compact + 無 progress**(靜態檔案) | `bg-neutral-3 rounded-md` | 靜態清單(已上傳 / 歷史附件)背景色區隔出「檔案 row」邊界,跟純文字內容區分;hover 時 `bg-neutral-hover` 覆蓋 |

**❌ 反例**:
- Rich mode 無邊框 → 看起來像一般 list item,跟 MenuItem 混淆
- Compact mode 靜態 item 無 bg → 純文字列,使用者不知這是「可點下載的檔案」
- 外層 `<FileUpload list>` wrapper 加邊框 → 雙重邊框(list 邊框 + item 邊框)視覺干擾

**Clickable → 下載 / 預覽 canonical**(AR15):
- FileItem 提供 `onClick` prop,consumer 傳入即進 clickable 模式(hover + cursor + keyboard)
- `status="completed"` 的 item 若有 `onClick` → 預設 UX 是「開啟檢視 / 下載」(FileViewer / browser download)
- consumer 決定具體行為,元件只提供 row 可點擊能力

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

Consumer 自行組合。按 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」,FileItem actions 位於 row dedicated region(右側獨立 slot),用 **Button iconOnly size-pair row tier**:

- `mode="rich"` → Button `size="sm"`(28/32 pair row)
- `mode="compact"` → Button `size="xs"`(24 pair row)

**Delete 屬 dismiss 視覺類**(callback `onRemove` / 語意 delete),用 `dismiss` prop 自動套 variant="text" + icon fg-muted → foreground(跟 Inline Action dismiss 視覺一致,cross-implementation dimming canonical):

```tsx
<FileItem actions={<>
  <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="下載" onClick={dl} />
  <Button size="sm" dismiss startIcon={Trash2} aria-label="刪除" onClick={del} />
</>} />
```

**為什麼 Button 非 Inline Action**:FileItem action region 位於 row 內獨立 slot(跟 content 視覺並列),按 predicate「row dedicated action region」→ Button size-pair row tier。Inline Action 保留給 host chrome 內 / row inline suffix(Menu/TreeView suffix ⋯)。詳 item-anatomy.spec.md 完整 predicate。

**Dismiss 視覺弱化**:不管實作走 Button(如本 case)還是 Inline Action(如 Dialog close),dismiss icon 色都弱化。Button `dismiss` prop 自動 override;Inline Action 本來就 fg-muted。

## Status ↔ Action hover-swap（passive → active affordance）

**世界級 UX pattern**（Gmail / Slack / Dropbox 附件 convention）:status 預設是 passive 狀態標記(綠 ✓ / 紅 ✗),使用者 hover 整個 row 時,**狀態 icon 自動換成「相應的操作」**,click 即觸發:

| status | Passive icon | Hover 換成 | Consumer handler |
|--------|-------------|-----------|------------------|
| `completed` | `CircleCheck` 綠 ✓ | `Download ↓` | `onDownload` |
| `error` | `XCircle` 紅 ✗ | `RotateCw ⟲` | `onRetry` |
| `uploading` | *(progress %)* | *(無 swap)* | — |

**幾何一致性(修正 2026-04-19)**:status slot 容器大小 **= consumer 的 delete Button 尺寸**:
- `mode="rich"` → `var(--field-height-sm)` (density-variable:28 md / 32 lg,與 Button sm 同)
- `mode="compact"` → `var(--field-height-xs)` (24 固定,與 Button xs 同)

Passive status icon 置中於 button-sized 容器,hover 時 active Button 填滿同一容器。這讓 flex gap token 測量的是**兩個同尺寸 button slot 之間的真實 gap**,不被 hover bg overflow 吃掉——icon slot 尺寸 = 同 size Button slot,gap token 才能如實呈現;歷史 bug 細節見 CLAUDE.md `# 失敗記憶索引`。

世界級 DS 的幾何鐵律:**同一 flex 列的互動元素必須有統一 box 尺寸**,gap token 才能如實呈現。

**Backward compat**:consumer 若沒傳 `onDownload` / `onRetry`,status icon 永遠保持 passive(不響應 hover)——既有使用者無感。

**為什麼值得這麼做**:
- passive 階段清楚告知使用者檔案狀態(✓ / ✗ 顏色強訊號)
- hover 階段立即提供相應行動(completed → 下載 / error → 重試),不需另外挪位置做按鈕
- 符合「改一處看多處」的 design system primitive 思維:passive + active 共用 slot,不讓使用者多認一處

```tsx
<FileItem
  name="report.pdf"
  status="completed"
  onDownload={() => downloadFile(id)}   // hover ✓ → ↓
  actions={<Button size="sm" dismiss startIcon={Trash2} onClick={del} aria-label="刪除" />}
/>

<FileItem
  name="backup.json"
  status="error"
  description="There's something wrong."
  onRetry={() => retryUpload(id)}        // hover ✗ → ⟲
  actions={<Button size="sm" dismiss startIcon={Trash2} onClick={del} aria-label="刪除" />}
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
