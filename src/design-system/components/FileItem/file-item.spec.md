---
component: FileItem
family: 2
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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
| `rich` | Avatar 48px square(固定) | 閱讀模式（ListItem md） | 需要縮圖預覽的檔案（圖片、文件） |

compact 為預設——多數 upload 清單是「快速掃視多檔」場景，只有需要縮圖預覽才升級為 rich。

## Typography（兩 mode 都 scanning typography · 2026-04-23 user 指示）

**兩 mode 統一 scanning typography**(row 帶 `leading-compact`,對齊 MenuItem / Steps 的 Family 1 scanning idiom):

| | compact | rich |
|---|---|---|
| label | text-body (14px) + `leading-compact` (1.3) | text-body (14px) + `leading-compact` (1.3) |
| description | text-caption (12px) + `leading-compact` | text-caption (12px) + `leading-compact` |
| ItemContent `mode` | `"scanning"` | `"scanning"` |
| Gap token | `--item-gap-label-desc-scanning` | `--item-gap-label-desc-scanning` |

**為什麼兩 mode 都 scanning**:FileItem 是檔案列表 row — 使用者需快速掃視多檔(Gmail attachment / Google Drive 清單),掃描 typography 視覺緊湊符合語義。Rich mode 保留 Avatar 48 thumbnail 作視覺引導,但文字層採 scanning idiom。

## 結構(2026-04-23 修正對齊 item-anatomy canonical)

### 共通 layout invariants(兩 mode 都遵守)

| 間距 | 值 | 來源 canonical |
|------|-----|--------------|
| **Label ↔ Description gap** | `--item-gap-label-desc-scanning`(2px,scanning mode)— FileItem 走 scanning typography(掃視密集列表) | `patterns/element-anatomy/item-anatomy.spec.md`「Label ↔ Desc 間距 / 4 token 矩陣」+ primitive `<ItemContent mode="scanning">` |
| **Content ↔ ProgressBar gap** | `gap-2`(8px) | 兩 mode 一致(compact 用 py-2 + absolute 自然達成;rich 用 explicit flex-col gap-2) |
| **Suffix 高度**(小 suffix,icons ≤24) | `h-[1lh]` + items-center inline 對齊 label 第一行 | `patterns/element-anatomy/item-anatomy.spec.md`「24px 閾值對齊規則」 |

### compact（預設）

```
[📎]  [ label
       ↓ --item-gap-label-desc-scanning (2px,scanning mode md)
       desc?        ] [suffix h-[1lh]]
      [ ██████████░░ ] ← 底部 progress bar(absolute,content 與 bar ≈ 8px gap)
```

### rich（完整呈現）

```
[Avatar 48 square    [ label ─────────────────── ↑ label top = avatar top
 固定,top-align       ↓ --item-gap-label-desc-scanning (2px,scanning mode md)
 作視覺引導]           desc                        ]  [suffix h-[1lh]]
                      ↓ 自動填滿餘空間(min 8px gap)
                     [ ██████████░░ ] ────────── ↓ bar bottom = avatar bottom(1-line 時)
```

### Rich layout invariant(2026-04-23 user 校準)

**1-line desc 時**:
- Content col `minHeight = AVATAR_SIZE (48)` + `justify-between` + `gap-2`
- **label 頂 = avatar 頂**(row `items-start`)
- **progress bar 底 = avatar 底**(minHeight + justify-between 的剩餘空間分配)
- 中間 gap 自動填(label+desc+bar 總高 < 48 時,剩餘空間成為 gap,至少 `gap-2`=8px)

**multi-line desc 時**:
- Content 自然高度超過 avatar 48
- Progress bar 溢出 avatar 底(正常語義:內容撐長了)
- **desc ↔ progress bar 保持 8px min gap**(`gap-2` 強制)

**無 progress bar 時**:`justify-center` 取代 `justify-between`,content 垂直置中對齊 avatar 中心。

### Rich Avatar 對齊的明文例外(上游 item-anatomy 24px 規則的例外)

item-anatomy「> 24 prefix + 有 desc」規則要求 prefix 對齊 content 塊**中心**(items-center)。
FileItem rich **刻意不遵守**這條,使用 `items-start`(top-align),原因:

> **當 FileItem rich 被放在「檔案上傳管理 box」等 tight-stack 情境**(consumer 移除 border 並 0 gap 相連時),avatar 作為**每個 item 的視覺邊界引導**——若 avatar 中心對齊,連續 item 的 avatar 會擠在一起失去「每筆檔案一個 thumbnail」的視覺節奏。top-align 讓 avatar 明確標示每個 item 的起點。

### Avatar 尺寸(固定 48px)

Avatar **固定 48px square**,不隨 content 高度變化。content(label + desc + bar)可自然 > 48(2-line desc 時)或 < 48(無 desc + 無 bar 時),avatar 始終 48。

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
| **compact + 無 progress**(form attachment 靜態態) | `bg-secondary rounded-md`(= neutral-3 色) | 靜態清單(form / 訊息附件)背景色區隔出「檔案 row」邊界,跟純文字內容區分。**為何 `bg-secondary` 不 `bg-neutral-3`**:`--secondary` 是 semantic token 經 `@theme inline` 橋接成合法 Tailwind utility,`--color-neutral-3` 是 primitive token(僅 `:root` CSS var)不生成 utility,寫 `bg-neutral-3` 會 silent 失效。對齊 Badge low / ProgressBar track SSOT(同色) |

### Hover 行為 canonical(2026-04-23)

**FileItem 永不顯示 hover-bg**,不論 mode / status / onClick。affordance 只靠 `cursor-pointer`(onClick 存在時)+ actions icon / hover-swap(status slot icon fade → action icon fade)。

**Rationale(permanent visual anchor → 不加 hover-bg double-emphasis)**:

| Mode | 永久 visual anchor | 加 hover-bg 後果 |
|------|-------------------|-----------------|
| rich | `border + rounded-md + bg-surface` 永遠 card | card + hover-bg = 雙層強調,視覺 heavy |
| compact Type B(無 status) | `bg-secondary rounded-md` 永遠 pill | pill bg + hover-bg neutral-hover 兩層相近灰,視覺雜 |
| compact Type A(uploading / error / completed with bar) | 底部 2px progress bar(分隔線型 permanent affordance) | bar + hover-bg 同時並存,affordance 重複 |

三種型態**都已 anchored**,hover-bg 是多餘的視覺層。Cursor + click 本身已是足夠互動 affordance,世界級檔案 card / attachment 皆如此。

**世界級對照**(M8 / M12 benchmark):

| DS | File card / attachment hover 行為 | 跟本 canonical 對齊? |
|----|----------------------------------|----------------------|
| Slack file tile | border highlight,**無 bg 變化** | ✓ |
| Notion file callout | **無 bg 變化**,action icons fade in | ✓ |
| Figma file card | shadow lift,**無 bg 變化** | ✓ |
| Gmail attachment chip | **無 bg 變化**,download icon fade in | ✓ |
| Dropbox / Google Drive file **row**(flush transparent 無 permanent anchor) | **有** hover-bg | Opposite case(證明 canonical:anchored → 無、flush → 有) |

**跟 MenuItem / DataTable row 對比**(它們用 hover-bg):兩者是 **flush transparent row**(無 permanent bg / border),hover-bg 是唯一 affordance。FileItem 三種型態皆已 anchored → 反向 canonical。

**反例**(本 session 修正):
- 原 code `hoverClass = onClick ? 'cursor-pointer hover:bg-neutral-hover' : ''` → rich card 上 hover 多一層灰 bg 雙層強調;Type B pill 上 hover 加 `bg-neutral-hover` 跟 pill 底色近似造成視覺雜
- 修為 `hoverClass = onClick ? 'cursor-pointer' : ''`

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
| **Row-click**(= Type B 行為) | **推薦**:consumer 傳 `onClick` 讓整 row 可點 → **預設用 FileViewer 開啟**(consumer 決定,也可直接下載)。Hover-swap + Row-click 可並存。 |
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
| Row-click | **`onClick` 為主要 affordance** → **預設 FileViewer 開啟**(consumer 決定,也可下載) |
| Rich 背景 | `border card`(永遠) |
| Compact 背景 | `bg-secondary`(區隔「這是檔案 row」;primitive `--color-neutral-3` 的 semantic 橋接名,見邊框 / 背景章節) |
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

### Description ReactNode 可含 clickable 元素

Description 是 ReactNode,**不限純文字**。常見場景:
- Error 描述含 "View log" 需可點 → 用 `<a className="underline">View log</a>` 或 inline Button:

```tsx
<FileItem
  mode="compact"
  name="backup-failed.json"
  status="error"
  description={
    <>
      Network timeout.{' '}
      <a href="#logs" className="underline hover:text-error-hover">View log</a>
    </>
  }
  onRetry={noop}
/>
```

視覺上 underline + hover 色變讓使用者知道「那段文字可點」。

### 不可混用 invariants

**Invariant 1 — rich 跟 compact 不可混用**:
同一 list 內**只能一種 mode**。rich 是「檔案 card」視覺語言(border + avatar + 完整 metadata),compact 是「掃視密集列表」視覺語言(paperclip + filename),兩者並排會:
- 高度差異過大(rich ~72px / compact ~36px)破壞 row rhythm
- Avatar vs paperclip prefix 視覺語言衝突
- consumer 要混用代表情境定位不清 —— 選一種

**Invariant 2 — Type A completed 跟 Type B 不共存**:
Type A completed(100% bar + ✓)屬「剛完成的 upload session」視覺;Type B(無 bar)屬「已存 attachment」視覺 —— 業務語義互斥。完成後 consumer 會把 item 轉成 Type B(移除 status 屬性),不會同時顯示「completed with bar」+「無 bar」。

**合法 mixed 情境**(email 草稿 / 多步驟 upload flow):Type A **active**(`uploading` / `error`)+ Type B(saved attachments)— 只在 **compact mode 內**。

---

## List wrapper canonical(多 item 間距)

`FileItem` 連續排列時 list wrapper gap,**統一規則**(2026-04-23 簡化,user 指示):

| Mode | List wrapper gap | Rationale |
|------|----------------|-----------|
| **Rich**(單一 mode list) | `gap-2`(8px) | card 邊框不相黏(standalone card invariant) |
| **Compact**(單一 mode list,所有情境) | `gap-1`(4px) | 統一 — 不論 Type A only / Type B only / Type A+B mixed,都用 gap-1 簡化 canonical。Type A 無 bg 的 0-gap 選項已捨棄,簡化 consumer 心智負擔 |

**Rich + Compact 不可混用**(見 Invariant 1 上方),故無「混用 gap」決策。

### List wrapper 本身不加視覺

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

// ✅ Compact form attachment list(靜態,有 bg-secondary)
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

**Trash/Delete 不是 dismiss 語意**:`dismiss` 嚴格保留給「X close overlay session」(Dialog / Sheet / Popover / Alert close X)。Row 的 Trash/Delete 語意是 `onRemove`(從集合移除一個 item,見 `.claude/rules/ui-development.md`「元件 Props 命名」「onRemove」),**不套 Button `dismiss` prop**:
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

## A11y 預設

- **`aria-busy` for uploading**:`status="uploading"` 時 row 自動 `aria-busy="true"`,SR 朗讀「busy」避免 user 嘗試互動已 in-flight item。
- **Error state live region**:`status="error"` row 自動 `role="status"` + `aria-live="polite"`,error 訊息(label + description)即時 announce,user 不用主動 navigate 過去。`polite` 不打斷既有 SR 朗讀,適合 file upload 非緊急情境。
- **Action button labels**:Download / retry / remove 等 inline action 必傳 `aria-label`(中文 / consumer locale)— 「下載 report.pdf」/「重試上傳」/「移除附件」,單純「下載」/「刪除」缺檔名 context SR user 無法區分多 row。
- **ProgressBar 整合**:消費的 `<ProgressBar>` 自帶 `role="progressbar"` + `aria-valuenow` / `aria-valuemax`,本元件不再重複;keyboard 不需 focus progress bar(被動指示器,非互動元素)。
- **Row clickable**:傳 `onClick` 時自動 `role="button"` + `tabIndex=0` + Enter / Space activate,keyboard user 與 mouse user 等價可達 FileViewer / download。
- **Status icon hover-swap a11y**:hover-swap 不改變 SR 語意 — passive icon `aria-hidden`,active action button 自帶 `aria-label`,避免 SR user 收到視覺 swap 噪音。

---

## 與 FileUpload 的分界

| 元件 | 職責 | 場景 |
|------|------|------|
| **FileItem** | 單一檔案 row primitive — 顯示一個檔案的 name / status / progress / actions | List 內的單筆 / detail / preview / message attachment |
| **FileUpload** | Dropzone + file list orchestrator — 拖放區 + 多 FileItem 排列 + 上傳狀態管理 | 完整上傳流程入口 |

**判斷**:

- **完整上傳流程**(drag-drop / validate / list multiple files)→ 用 `FileUpload`(內部消費多個 `FileItem`)
- **單一檔案展示 / preview**(message bubble 附件 / detail page header / FileViewer 觸發點)→ 直接用 `FileItem`
- **Form attachment field**(留言區附件、ticket attachments)→ 視場景:有上傳行為走 `FileUpload`,只展示既有附件走 `FileItem` list(Type B)

**簡單記**:**有 dropzone 用 FileUpload,沒 dropzone 用 FileItem**。FileItem 不應自帶 dropzone(會跟 FileUpload 重複職責)。

---

## 禁止事項

- ❌ **不用 FileItem 做 generic list row**(menu / settings 列表 / nav)→ 改 `MenuItem`。FileItem prefix(paperclip / Avatar 48 thumbnail)、status pattern(uploading / error)、ProgressBar slot 都是檔案專屬語義,套到 generic row 會視覺 / 語意誤導。
- ❌ **不用 FileItem 做 selection picker**(選檔案、選 template)→ 改 `Combobox` / `Select` / `Listbox`。FileItem 設計是「展示已存在的檔案 row」,不是「從候選池挑一個」;hover / selected state 與 picker 語義不對齊。
- ❌ **不在 FileItem 內塞自組 ProgressBar**(`<div className="bg-primary h-1" style={{width: `${progress}%`}} />`)→ 必消費內建 `<ProgressBar>` SSOT。自組會視覺漂移(高度 / 動畫 / status 色不一致)+ 失去 a11y attributes。
- ❌ **不混用 rich + compact 在同一 list**(詳「Invariant 1」)— 高度差破壞 row rhythm,prefix 視覺語言衝突。
- ❌ **不用 FileItem 做下載進度**(瀏覽器原生下載 UX 已足夠)— FileItem 為 upload narrative 設計,download progress 走自訂元件。

---

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
