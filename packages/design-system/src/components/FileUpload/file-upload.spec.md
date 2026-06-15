---
component: FileUpload
family: self-contained
variants:
  dropzone:
    when: "預設 — 大型 dashed 拖放區;「拖放有價值」+ 主要上傳區(drag + click)"
    world-class: ["Ant Upload.Dragger", "Polaris DropZone"]
  button:
    when: "form 內單欄 / 空間省 / 與其他 field 並列 — 緊湊 Button 觸發(click-only)"
    world-class: ["Ant Upload(button list)"]
sizes: {}
traits:
  - hasInteractiveStates
benchmark:
  - Ant Design Upload: github.com/ant-design/ant-design/tree/master/components/upload
  - Polaris DropZone: github.com/Shopify/polaris/tree/main/polaris-react/src/components/DropZone
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# FileUpload 設計原則

## 定位

FileUpload 是**拖放 / 點擊上傳區塊**——可拖曳檔案進入或點擊觸發檔案選取浮窗。負責「上傳觸發 + 拖放偵測」,不負責「已上傳檔案清單顯示」(那是 `FileItem` 的職責)。

**實作基礎**:自建 — native HTML5 `<input type="file">` + drag-and-drop event(dragenter/dragover/dragleave/drop)+ DOM-level state 切換。無 external primitive,因為 Radix 沒 File Upload 對應 primitive,其他 UI kit 的 file upload 多數也是自建這層。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Layout Family**:非上述 family — self-contained primitive(獨立拖放區視覺,無 slot 結構)。

**世界級對照**:
- Ant Design `Upload.Dragger` — pattern source
- Polaris `DropZone` — 3 態視覺慣例
- Material / MUI community `react-dropzone` — drag API 慣例
- 本元件取各家最乾淨的 pattern(Dragger 結構 + DropZone 3 態 + 原生 input fallback)

---

## 何時用

- **單檔上傳**(頭像、大頭照、PDF 履歷):`multiple={false}`(預設)
- **批次上傳**(相簿、檔案附件、批次匯入):`multiple={true}`
- **拖放支援為 UX 加分**(圖片、檔案):pointer + touch 都能用
- **搭配 FileItem 顯示已上傳**:上傳後 consumer 以 `FileItem` list 列出

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純文字輸入(無檔案) | `Input` / `Textarea` | FileUpload 只處理二進位檔 |
| 單一檔案型欄位與其他 field 並列(form 內,空間省)| **`<FileUpload variant="button">`**(緊湊 Button 觸發) | 不要在 form 中塞大塊 dropzone 破壞欄位節奏;button variant 共用同上傳邏輯 + files 清單 |
| 僅點擊選檔不需拖放 UX | **`<FileUpload variant="button">`** | 大 dropzone 只在「拖放有價值」才划算;button variant click-only |
| 大量並列上傳多欄(頭像 × 10) | FileItem inline + inline Upload | dropzone 體積大,不適合密集並列 |

---

## 四狀態視覺(world-class dropzone 慣例)

| data-state | 情境 | 視覺 |
|------------|------|------|
| `idle`(預設) | 使用者未互動 | dashed `border-border`（**元件邊框 `--border`,非 `--divider` 分隔線**）+ surface 底 |
| `hover` = `drag-over`（**統一,純 border-driven,對齊 Ant Dragger `colorPrimaryHover`**)| 游標懸停 / 拖檔進入 | **`border-primary`**（只變邊框）+ 底維持 surface（不變 bg）。state 信號靠邊框,非底色;兩態同視覺 |
| `loading`（**deferred**）| `loading` prop 為 true | **Deferred:其唯一用途(無清單單檔/頭像替換)場景未定義,showcase 僅呈現 3-state(idle/drag-over/disabled);prop 在 tsx 保留供未來。** 行為:CircularProgress 取代內容;`cursor-progress`(不加 `pointer-events-none`,互動由 isBlocked guard 擋);aria-busy=true。有清單的 flow 進度一律走 FileItem 自身的 progress bar（uploading status）—— FileUpload 內建 list 仍 `surface=form`(dropzone 非獨立浮層 upload manager,見 file-item.spec.md「upload-manager 浮層面板 composition」)|
| `disabled` | `disabled` prop 為 true | **語意 token(非 opacity — dashed outline surface 走 DS outline-disabled 慣例,3/4 世界級 Ant/Polaris/Carbon 用 token)**:`bg-disabled` 底 + 邊框不變色 + 文字/icon → `fg-disabled`(由 `<Empty disabled>` 控,icon-circle 維持 muted)+ `cursor-not-allowed`(移除 `pointer-events-none` 後生效)|

**State 優先序**:`disabled > loading > drag-over > idle`。disabled 最硬(完全不可用),loading 次之(處理中,user 要等),drag-over 最柔(互動中),idle 預設。

**loading vs disabled 的差異**:
- **loading** = 暫時不可互動(async 處理中),不變灰,顯示進度指示;user 知道「正在做」
- **disabled** = 永久 / 條件性不可用,變灰 + cursor-not-allowed;user 知道「現在不能用」
- 混用會破壞語意 — `loading=true` 時不要同時 `disabled=true`

**為什麼用 dashed border**:世界級 dropzone 的共識(Ant / Polaris / GitHub drag-drop 都如此)——dashed 暗示「暫時、可放下」,solid border 暗示「永久邊界」。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 兩種觸發外觀(`variant`,2026-06-03 加)

| variant | 觸發外觀 | 用途 | 拖放 |
|---------|---------|------|------|
| `dropzone`(預設)| 大型 dashed 拖放區(上述 4 狀態)| 「拖放有價值」+ 主要上傳區 | ✓ drag + click |
| `button` | 緊湊 `<Button variant="tertiary" startIcon={Upload}>` | form 內單欄、空間省、與其他 field 並列 | click-only |

**兩 variant 共用** `onUpload` / `onReject` / `accept` / `maxSize` / `files` 清單渲染;**都可放進 `<Field>` control slot**。對齊 Ant `Upload`(button list)vs `Upload.Dragger`(dropzone)。M21 prop-variant test 過(同上傳行為、不同觸發外觀、value 結構同 `File[]`)。

**vs 直接用 `<Button>`**:Button 只有觸發外觀、無上傳邏輯(hidden input / accept / maxSize / onReject);任何檔案上傳一律 FileUpload,空間緊湊才選 `variant="button"`。

> **FileUpload 常出現在 form**(`*Excel file` 欄位等)—— `variant` 只決定「觸發外觀大小」,**非「form vs 非 form」**;兩者都常在 form 裡。

## children 插槽 vs 預設結構

**預設**:直接渲染 `<Empty icon={Upload} title description />`——**重用 Empty 元件擁有的「icon + title + description 垂直居中」SSOT**(`../Empty/empty.spec.md`)。FileUpload 自己不重畫這套 layout,避免字體 / gap / icon 尺寸未來雙邊漂移。

**覆寫**:傳 children 整個替換(不渲染 Empty)。典型場景:
- 加檔案大小提示(「最大 10 MB」)
- 加範例圖(「拖拉一張 JPG 進來」)
- 加機構 branding(CompanyLogo + 客製文案)

**為什麼用 Empty 而非自己畫**:兩者共用「居中 icon + title + description 說明」的視覺語法,屬同一個 DS 設計語言 primitive。Empty 已 own 此結構(icon Avatar 48px、text-body-lg font-medium 標題、text-body desc、mb-4 / `--item-gap-label-desc-reading-lg` gap),FileUpload 改重畫 = 雙邊漂移。跨元件 DRY = 世界級 DS 治理。

---

## Props 行為

- `onUpload(files)`: 使用者選取或拖放檔案,**過濾後**回傳 `File[]`
- `onReject(files, reason)`: 被擋下的檔案;`reason` 值域 `'size'`(超過 maxSize)/ `'type'`(不符 accept)。同次選取兩類各觸發一次。rejected 檔案的 UI 展示由 consumer 決定(Toast / Alert / FileItem `status="error"`),FileUpload 本身不渲染拒絕訊息
- `multiple`: 預設 `false`(單檔);若 `false` 且使用者拖多檔,**只取第一個**交給 `onUpload`(不拋錯,符合 Ant Design 慣例)
- `accept`: MIME filter,同時支援副檔名(`.pdf`)、通配(`image/*`)、完整 MIME(`application/pdf`)
- `maxSize`: 單檔最大 bytes;超過靜默忽略(consumer 若要錯誤訊息,監聽 `onReject`)
- `disabled`: 完全停用(互動由 `isBlocked` guard 擋 + `cursor-not-allowed`;已移除 `pointer-events-none`,不再靠它擋)
- `files`: uploaded / uploading 檔案清單(`FileUploadStatus[]`:id / name / size? / progress? / status? / description? / thumbnailSrc?)。傳入 → drop zone 下方渲染列表,每項經 `FileItem`(status 對應:uploading = progress bar / completed = ✓ / error = ✗);不傳 → 不顯示。consumer 持 state(progress / status),FileUpload 只負責渲染
- `fileListMode`: 清單每項顯示模式;預設 `'compact'`(單行),`'rich'` 含 thumbnail / size / progress bar
- `onRemove(id)`: 清單移除 callback;有值 → 每項右側顯示 X 移除鈕(ARIA label 由 `removeAriaLabel` 模板客製,預設「移除 {name}」),無 → view-only
- `variant` / `buttonLabel`: 見「兩種觸發外觀」段

---

## 禁止事項

- ❌ **不在 FileUpload 裡自己重刻 FileItem primitives**(自畫 status icon / thumbnail / progress bar / row layout):那些是 `FileItem` 的 SSOT;FileUpload 若內建 list,**必 consume 既有 `<FileItem>`,不 replicate**
  - 2026-04-24 canonical 明確化:DS 提供 dual path — (a) FileUpload own via `files` prop composing FileItem(見「Props 行為」`files`)(b) consumer 自組 `{files.map(f => <FileItem ... />)}` 仍合法（2026-06-03 修:原引用「Post-upload file list」節為 phantom — 該節從未寫出,只剩 dangling reference）
  - 禁止的是「自己重畫 FileItem 視覺規格」(status 色 / thumbnail ratio / progress bar 等),不是「內建 list」本身
  - 世界級對照:Material / Ant / Carbon 皆 FileUpload own list,用自家 FileItem primitive composing;本 DS 採相同 pattern(2026-04-24) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- ❌ **不用 FileUpload 做非檔案觸發**(例:「點擊開啟浮層」——那是 Popover / Dialog)
- ❌ **不移除 dashed border**(改 solid 會與「持久邊界」的視覺語意衝突,使用者直覺失靈)
- ❌ **不把 multiple+bulk 當 default**:單檔是 80% 的場景(大頭照、單張附件),預設 `multiple=false` 讓使用者少一步判斷
- ❌ **不用 color 以外的 state 信號**:drag-over 除色彩外,不加 scale / shadow 等裝飾,避免視覺噪音

---

## 邊界案例

- **超長檔名**:`files` 清單經 FileItem 渲染,label 單行 truncate(ellipsis)— 詳 `file-item.spec.md`「邊界案例」
- **多檔拖放 + `multiple=false`**:只取過濾後第一個檔交給 `onUpload`,不拋錯(見「Props 行為」)
- **空選取(0 檔)**:不觸發任何 callback;`files={[]}` 不渲染清單(等同不傳)
- **maxSize / accept 全擋下**:`onUpload` 不觸發,只觸發 `onReject`
- Disabled / loading 見「四狀態視覺」;dark mode / density 由 semantic token 自動處理

---

## A11y 預設

- `role="button"` + `tabIndex=0`(disabled 時 `-1`)
- Enter / Space 鍵觸發檔案選取浮窗(模擬 click)
- `aria-disabled={true}` 當 disabled
- `<input type="file">` 以 `className="hidden"`(`display:none`)隱藏 — 移出無障礙樹、不可聚焦;互動由外層 `role="button"` wrapper 承載。Accessible name 來自 wrapper 內 Empty 的 title + description 文字(name-from-content),非 input 本身

---

## 相關

- `../FileItem/file-item.spec.md` — 已上傳檔案的 list row 渲染(配對元件)
- `../Empty/empty.spec.md` — 本元件預設 children 消費,「icon + title + description」SSOT
- `../Button/button.spec.md` — `variant="button"` 消費的觸發元件(見「兩種觸發外觀」)
- Ant Design `Upload.Dragger` 原始參考 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- Polaris `DropZone` 原始參考 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
- `file-item.spec.md`
