# FileItem 設計原則

**檔案上傳列表項目**——顯示檔案名稱、上傳進度、狀態（uploading / completed / error）。

**實作基礎**：組合元件——Icon + Text + Progress + Button，無 external primitive base。

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
Progress bar 底部對齊 avatar 底部。justify-between 自動分配 gap（有 desc 時 ≈ 2px）。

**Avatar 尺寸約束**：48px ≥ label(21) + desc(21) + bar(4) = 46px ✓

## Padding

| Mode | py | px | prefix↔content gap |
|---|---|---|---|
| compact（預設） | item-layout formula | `px-3` | `gap-2`（8px） |
| rich | `py-2`（8px 固定） | `px-3`（12px） | `gap-3`（12px） |

rich 的 py 固定——高度由 avatar 決定，不走 row 公式。

## Progress bar

**SSOT**:FileItem 不自 roll bar,消費 `../Progress/progress.spec.md` 元件(Radix Progress 包裝 + 本 DS token)。避免視覺漂移。

| 屬性 | 值 | 依據 |
|---|---|---|
| 消費元件 | `<Progress status={...} value={...} size={...} />` | 本 DS Progress SSOT |
| status 映射 | `uploading → primary` / `completed → success` / `error → error` | Progress `status` 原生支援 |
| size 映射 | `rich → md(4px)` / `compact → sm(2px)` | 與原視覺一致 |
| value | `status === 'completed' ? 100 : progress` | completed 永遠 100% |

改動進度條視覺(高度 / 色 / 動畫) → 去 Progress 改,**本元件無本地 bar 實作**。

## Actions（suffix）

Consumer 自行組合：

```tsx
<FileItem actions={<>
  <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="下載" />
  <Button variant="text" size="sm" iconOnly startIcon={Trash2} aria-label="刪除" />
</>} />
```

用 Button（不是 Inline Action）——FileItem 的 action 是始終可見的獨立操作。
詳見 CLAUDE.md「互動元素三層級」。

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

Passive status icon(16 px)置中於 button-sized 容器,hover 時 active Button 填滿同一容器。這讓 flex `gap-2`(8 px)測量的是**兩個同尺寸 button slot 之間的真 8 px gap**,不被 hover bg overflow 吃掉(原本用 `ItemInlineActionButton` 16 px container + 24 px hover bg overflow,實際視覺 gap 只剩 4 px 違反 8 px 規格)。

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
  actions={<ItemInlineActionButton icon={Trash2} onClick={del} aria-label="刪除" />}
/>

<FileItem
  name="backup.json"
  status="error"
  description="There's something wrong."
  onRetry={() => retryUpload(id)}        // hover ✗ → ⟲
  actions={<ItemInlineActionButton icon={Trash2} onClick={del} aria-label="刪除" />}
/>
```

## Suffix 24px 閾值

| Mode | 最大 suffix 元素 | 有 desc 時 | alignment |
|---|---|---|---|
| compact（預設） | Button xs = 24px ≤ 24px | — | `h-[1lh]` inline |
| rich | Button sm = 28px > 24px | block | `h-[calc(1lh+2px+desc_lh)]` |

## 為何無 Inspector / ColorMatrix

FileItem 是 Family 2 List item 消費者,結構 / 色彩繼承 `item-anatomy.spec.md`:

- **無 Inspector**:FileItem 決策維度是 `mode`(compact / rich)× `status`(uploading / completed / error / static)× `size`——已在 `ModeMatrix` / `SizeMatrix` / `StateBehavior` 三張矩陣完整覆蓋。互動 Inspector 不會比結構性矩陣對照更有教學價值——「選 mode 的 test / 選 status 的 test」是需要 side-by-side 比對的決策,不是單值試玩。
- **無 ColorMatrix**:FileItem 自身無色彩變體(不像 Button / Chip 有 variant),結構色彩完全走 item-anatomy row 共用 token(`text-foreground` / `text-fg-secondary` / `bg-neutral-hover`)。只有 status 驅動的 progress bar + status icon 有色(`bg-primary` / `bg-success` / `bg-error`),已在 `StateBehavior` 的 progress bar 色彩對照表呈現。重寫 ColorMatrix = 複製 item-anatomy + StateBehavior 內容。

對應 anatomy story:保留 `Overview` + `ModeMatrix`(compact vs rich 結構分歧) + `SizeMatrix` + `StateBehavior`(status 驅動的 progress + hover-swap)。

---

## 相關

- `../../patterns/element-anatomy/item-anatomy.spec.md` — 閱讀模式（compact / rich）
- `../Avatar/avatar.spec.md` — Avatar shape（rich mode 的 icon 容器）
- `../FileUpload/file-upload.spec.md` — **配對元件**:FileUpload 是拖放 / 點擊上傳區塊,FileItem 是已上傳檔案 row 顯示;兩者構成完整 file-handling 元件組
- `../LinkInput/link-input.spec.md` — 純連結（非 upload 流程）替代
- `../TreeView/tree-view.spec.md` — 階層 file structure 場景
- `../Progress/progress.spec.md` — Progress bar SSOT(FileItem consumes Progress for upload bar)
- `../../tokens/color/color.spec.md` — Track 底色（`bg-secondary` 使用原則）
