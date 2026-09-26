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


# FileUpload 設計原則

## 定位

FileUpload 是**拖放 / 點擊上傳區塊**——可拖曳檔案進入或點擊觸發檔案選取浮窗。核心職責是「上傳觸發 + 拖放偵測」;它**不 own 單筆檔案列的視覺規格**(狀態圖示 / 縮圖 / 進度條 / 列排版屬 `FileItem` 的 SSOT),但**可 orchestrate 內建清單**——透過 `files` prop 內部組合 `FileItem` 渲染已上傳清單(dual-path,見「Props 行為」與「禁止事項」);consumer 自組 `FileItem` 清單亦合法。

**實作基礎**:自建 — native HTML5 `<input type="file">` + drag-and-drop event(dragenter/dragover/dragleave/drop)+ DOM-level state 切換。選擇 native input 是為了保留檔案選取語意與瀏覽器安全邊界；drag state 只增補同一 input contract。

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
| `hover` = `drag-over`（**統一,純 border-driven,對齊 Ant Dragger `colorPrimaryHover`**)| 游標懸停 / 拖檔進入 | **`border-drop-target-border`**（DS「可放下的區域」配對,= `--primary-hover`,2026-09-03 起與 `AgentFabDock` 停靠帶共用同一組 token;只變邊框）+ 底維持 surface（不變 bg）。state 信號靠邊框,非底色;兩態同視覺 |
| `loading`（**deferred**）| `loading` prop 為 true | **Deferred:其唯一用途(無清單單檔/頭像替換)場景未定義,showcase 僅呈現 3-state(idle/drag-over/disabled);prop 在 tsx 保留供未來。** 行為:CircularProgress 取代內容;`cursor-progress`(不加 `pointer-events-none`,互動由 isBlocked guard 擋);aria-busy=true。有清單的 flow 進度一律走 FileItem 自身的 progress bar（uploading status）—— FileUpload 內建 list 仍 `surface=form`(dropzone 非獨立浮層 upload manager,見 file-item.spec.md「upload-manager 浮層面板 composition」)|
| `disabled` | `disabled` prop 為 true | **語意 token(非 opacity — dashed outline surface 走 DS outline-disabled 慣例,3/4 世界級 Ant/Polaris/Carbon 用 token)**:`bg-disabled` 底 + 邊框不變色 + 文字/icon → `fg-disabled`(由 `<Empty disabled>` 控,icon-circle 維持 muted)+ `cursor-not-allowed`(移除 `pointer-events-none` 後生效)|

**邊框變色瞬間切換、不過渡**(2026-09-26 待辦總帳 L9「全部瞬間」延伸到外框,user:「確定這樣才是一致設計語言就做」;同一次滑過底色瞬間、外框卻 0.15 秒 = 兩套手感;SSOT = `../../tokens/motion/motion.spec.md`「hover 回饋不做過渡」;2026-09-26 前是 `transition-colors` 0.15 秒)。

**State 優先序**:`disabled > loading > drag-over > idle`。disabled 最硬(完全不可用),loading 次之(處理中,user 要等),drag-over 最柔(互動中),idle 預設。

**loading vs disabled 的差異**:
- **loading** = 暫時不可互動(async 處理中),不變灰,顯示進度指示;user 知道「正在做」
- **disabled** = 永久 / 條件性不可用,變灰 + cursor-not-allowed;user 知道「現在不能用」
- 混用會破壞語意 — `loading=true` 時不要同時 `disabled=true`

**為什麼用 dashed border**:dashed 表示「可放下的暫時目標」，與永久容器使用的 solid boundary 區分；drag-active 再用 state token 提升可放置訊號。

**為什麼這裡不填底色**（2026-09-03 user 提問「FileUpload 的邏輯不一樣吧」→ 全掃確認）:本元件是**常駐**拖入區,靜止就看得見(dashed 邊框),使用者是「瞄準它」把檔案丟進來;被拖的是 OS 拖曳影像、DS 管不到,所以回饋只能長在區域上,而換邊框色已足夠。相對地 `AgentFabDock` 的右緣停靠帶是**暫態**區域(靜止不存在、拖曳中才出現),需要 `--drop-target` 整區底色才讀得出範圍,落點回饋則由鈕自己的所見即所得預覽承擔。**兩者共用同一組 token(顏色語言統一),組合不同(情境不同)** —— SSOT 對照表在 `color.spec.md`「Drop target」段。

---

## 兩種觸發外觀(`variant`,2026-06-03 加)

| variant | 觸發外觀 | 用途 | 拖放 |
|---------|---------|------|------|
| `dropzone`(預設)| 大型 dashed 拖放區(上述 4 狀態)| 「拖放有價值」+ 主要上傳區 | ✓ drag + click |
| `button` | 緊湊 `<Button variant="tertiary" startIcon={Upload}>` | form 內單欄、空間省、與其他 field 並列 | click-only |

**兩 variant 共用** `onUpload` / `onReject` / `accept` / `maxSize` / `files` 清單渲染;**都可放進 `<Field>` control slot**。對齊 Ant `Upload`(button list)vs `Upload.Dragger`(dropzone)。M21 prop-variant test 過(同上傳行為、不同觸發外觀、value 結構同 `File[]`)。

**vs 直接用 `<Button>`**:Button 只有觸發外觀、無上傳邏輯(hidden input / accept / maxSize / onReject);任何檔案上傳一律 FileUpload,空間緊湊才選 `variant="button"`。

> **FileUpload 常出現在 form**(`*Excel file` 欄位等)—— `variant` 只決定「觸發外觀大小」,**非「form vs 非 form」**;兩者都常在 form 裡。

## dropzone children 插槽 vs 預設結構

**預設**:直接渲染 `<Empty icon={Upload} title description />`——**重用 Empty 元件擁有的「icon + title + description 垂直居中」SSOT**(`../Empty/empty.spec.md`)。FileUpload 自己不重畫這套 layout,避免字體 / gap / icon 尺寸未來雙邊漂移。

**覆寫**:`variant="dropzone"` 傳 children 時整個替換(不渲染 Empty)。`variant="button"` 固定渲染以 `buttonLabel` 命名的原生 DS Button，忽略 `children`、`title`、`description`。dropzone 典型客製場景:
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
- 移除焦點:在 callback 前把 focus 交給下一項 remove button；沒有下一項則前一項；清單清空則回 FileUpload owner trigger（dropzone 或 button）。禁止 item unmount 後讓 focus 掉到 `body`。移除鈕不在 Tab 路上(見「A11y 預設」檔案清單鍵盤),但仍可由程式聚焦;焦點接力到哪一列,清單的 Tab 停靠點就跟到哪一列(2026-09-25 待辦總帳 B9)。
- `variant` / `buttonLabel`: 見「兩種觸發外觀」段

---

## 禁止事項

- ❌ **不在 FileUpload 裡自己重刻 FileItem primitives**(自畫 status icon / thumbnail / progress bar / row layout):那些是 `FileItem` 的 SSOT;FileUpload 若內建 list,**必 consume 既有 `<FileItem>`,不 replicate**
  - 2026-04-24 canonical 明確化:DS 提供 dual path — (a) FileUpload own via `files` prop composing FileItem(見「Props 行為」`files`)(b) consumer 自組 `{files.map(f => <FileItem ... />)}` 仍合法（2026-06-03 修:原引用「Post-upload file list」節為 phantom — 該節從未寫出,只剩 dangling reference）
  - 禁止的是「自己重畫 FileItem 視覺規格」(status 色 / thumbnail ratio / progress bar 等),不是「內建 list」本身
  - FileUpload 擁有 upload lifecycle，row anatomy 則直接組合既有 FileItem primitive，避免平行維護第二套 file row
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
- **同檔重選**(2026-07-05 D4):input value 於 dispatch 後清空 — 「上傳失敗修正後重選同檔」「刪除後重傳同檔」仍觸發 `onUpload`(瀏覽器對同路徑檔案不重發 change event,不清空則靜默無反應)
- **拖曳滑過內部子元素**(2026-07-06 深度計數):pointer 移過 Empty 的 icon/title 時 drag-over 高亮不熄滅 — dragenter/dragleave 成對 +1/−1 深度計數,計數 > 0 即維持高亮;不依賴 `e.relatedTarget`(Safari/WebKit 的 dragleave relatedTarget 恆 null,guard 法必失效,故已於 2026-07-06 廢棄換深度計數),避免經典 drag-flicker
- **Disabled / loading 時拖檔 drop**(2026-07-05 D4):操作被吞掉 — 仍 `preventDefault` 擋瀏覽器預設「在當前 tab 開啟被丟檔案」的整頁導航,`onUpload` 不觸發
- Disabled / loading 見「四狀態視覺」;dark mode / density 由 semantic token 自動處理

---

## A11y 預設

- **dropzone**:`role="button"` + `tabIndex=0`(disabled 或 loading 時 `-1`)，Enter / Space 開啟檔案選取浮窗，disabled 時帶 `aria-disabled=true`。
- **button**:使用原生 DS `<Button>`，鍵盤與 disabled 語意由 button 元素提供；accessible name 來自 `buttonLabel`，不使用 dropzone 的 children/name-from-content 規則。
- `<input type="file">` 以 `className="hidden"`(`display:none`)隱藏，移出無障礙樹且不可聚焦；互動由當前 variant 的可見觸發元件承載。
- **dropzone accessible name(name-from-content + custom children 例外)**:預設(未傳 children)時 name 來自 wrapper 內 `<Empty>` 的 title + description 文字,非 input 本身。若 consumer 傳入**只有 icon / branding 圖像、無可見文字**的 children，`role="button"` wrapper 會失去 accessible name；此時必須在 `<FileUpload>` root 傳 `aria-label`，或確保 children 含可見文字。

### 檔案清單鍵盤(`files` + `onRemove`)= 一個 Tab 停靠點

2026-09-25 待辦總帳 B9「路線乙」(`governance/planning/2026-09-25-interaction-and-hover-remediation.md`),user 逐字(附條件同意,條件查證成立記在該列):「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」。
規則與一手依據住 `../../../ds-canonical/references/keyboard-model-canonical.md`「列上有小按鈕的一串」;本段只列本元件的按鍵表。2026-09-25 前:每一列的移除鈕各佔一站、沒有方向鍵。
判定與執行 = `../../lib/roving-list-keyboard.ts`(2026-09-26 與 Sidebar / TreeView / Command 四份合一,待辦總帳〇節「按鍵規則合併」;判定表 `scripts/test-roving-list-keyboard.mjs`),本元件只提供「誰是列、列裡有哪些東西」;鍵盤處理掛在捕獲階段(同 Sidebar),`description` 裡放進來的選單鈕按 `↓` 也是換列(批次細節 X6)。列裡若有輸入框,它的方向鍵與空白鍵屬於它自己,`Tab` 仍一下離開。

| 鍵 | 焦點在列上 | 焦點在這一列的按鈕上(移除鈕,或 `description` 裡的連結) |
|---|---|---|
| `↑` `↓` | 上 / 下一列,不繞回 | 回到上 / 下一列(焦點落在列上) |
| `Home` `End` | 第一 / 最後一列 | 同左 |
| `→` | 進這一列的第一顆按鈕(沒有就不動) | 下一顆;最後一顆停住 |
| `←` | 不動 | 上一顆;第一顆 → 回到列 |
| `Tab` / `Shift+Tab` | 一下離開清單 | 同左(先回到本列,再往下 / 往上走一站) |
| `Enter` / `Space` | —(列本身沒有動作) | 啟動那顆按鈕 |

- 別列的按鈕、這一列的按鈕都不在 Tab 路上(`tabIndex=-1`,`→` 才進得去);從外面 Tab 回來,落在上次停的那一列,沒停過(或那一列已被移除)→ 第一列。
- 身分:容器 `role="grid"`(`aria-label="已上傳的檔案"`)、每列 `role="row"`(可聚焦,焦點框 = 內描邊 `focus-visible:focus-ring-inset`,同 FileItem 整列焦點框的幾何,`focus-canonical.md`「框怎麼畫」;**compact 清單裡有 `status` 的列**(進度條貼列底)框改畫在列自己的 `::before` 框圖層、在進度條那一段連同兩端各 2px 的縫挖空,列本身不畫全域外描邊 —— 框圖層與遮罩都由 FileItem 提供(`FILE_ITEM_RING_LAYER_CLASS` / `fileItemRingCutoutStyle`,挖的位置與進度條同源),規則與理由見 `../FileItem/file-item.spec.md`「焦點框 × 貼著列底的進度條」)、列的唯一子元素 FileItem `role="gridcell"`。
- 為什麼是 grid:W3C listbox 模式明說選項裡不能互動,「To present a list of interactive elements, see the Grid Pattern」(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/listbox/listbox-pattern.html#L31-L33>)。
- 列上多動作時用 grid / row、列的直接子元素是 gridcell:Fluent List「the list item roles should be `grid`, and `row` … each direct child of the `ListItem` component has a role `gridcell`」(<https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-list/stories/src/List/ListDescription.md#L58>);React Aria GridList 同構(`role: 'grid'` <https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/gridlist/useGridList.ts#L192>、`'row'` / `'gridcell'` <https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/gridlist/useGridListItem.ts#L417-L462>)。
- 容器與列用 `div`,不用 `ul` / `li`:W3C ARIA in HTML 的 `ul` 允許角色不含 grid(<https://www.w3.org/TR/html-aria/#el-ul>),`li` 在清單裡除了 listitem 不准換角色(<https://www.w3.org/TR/html-aria/#el-li>)。
- **沒有 `onRemove` 的唯讀清單維持純 `ul` / `li`,不是焦點站**:列上沒有可操作的東西(`focus-canonical.md`「問題一」:不可操作 → 不可聚焦)。
- 按鈕上的 `↑` `↓`、「先回到本列再離開」、唯讀清單不收成一站:AI 推導(`keyboard-model-canonical.md` 來源總帳);`Esc` 不規定(同該檔)。
- 驗證:`file-upload.stories.tsx`「檔案清單鍵盤走法驗證」(test-only play)。

---

## 相關

- `../FileItem/file-item.spec.md` — 已上傳檔案的 list row 渲染(配對元件)
- `../Empty/empty.spec.md` — 本元件預設 children 消費,「icon + title + description」SSOT
- `../Button/button.spec.md` — `variant="button"` 消費的觸發元件(見「兩種觸發外觀」)
- 本 spec 的 Anatomy / 狀態表與 `file-upload.tsx` — canonical authority

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `empty.spec.md`
- `file-item.spec.md`
