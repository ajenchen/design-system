# 元件 Props 命名 — 詳細對照表

Canonical `packages/design-system/ds-canonical/rules/ui-development.md`「元件 Props 命名」的詳細展開(callback / Badge / prefix·suffix / 尺寸參數 / icon canonical)。

## 關閉 / 移除類 callback canonical(按語意分層,不合併)

四個名稱各有語意,不可替換:

| Callback | 語意 | 典型元件 | 世界級對照 |
|----------|------|---------|-----------|
| `onClose` | **關閉 overlay session** — 浮層關閉回背景 | Dialog / Sheet / Popover / FileViewer / HoverCard | React Aria `onClose` / Material `DialogProps.onClose` |
| `onDismiss` | **通知被忽略** — 暫時訊息被關,不影響流程 | Alert / Notice / Toast / Coachmark | Polaris `Toast.onDismiss` / iOS `dismiss()` |
| `onCancel` | **放棄、不提交** — 不交出任何值(預選的也不算),流程停在這裡等使用者 | AgentDecisionCard(2026-11-15 由 `onSkip(answers)` 改名)/ Field 就地編輯 / DataTable 格編輯器 | Ant Design Modal `onCancel` / React Spectrum AlertDialog `onCancel` |
| `onRemove` | **從集合移除 item** — parent collection 狀態變化 | PeoplePicker / Combobox multi-select tag / Tag(in list) | Material `Chip.onDelete` / React Aria `onRemove` |
| `onClear` | **欄位內容清空** — value 設 empty,元件不關 | Input / Select / Combobox / DatePicker clear | Ant `allowClear` + `onClear` / Polaris `clearButton` |
| `onClearSelection` | **清空多選集合** — 取消所有勾選項(非清欄位內容)| BulkActionBar | Polaris `ResourceList` bulk clear / Material DataGrid `onRowSelectionModelChange([])` |

**禁止**:用同一名 cover 多語意(`onClose` 同時表達 Tag 的 `onRemove`;`onClear` 同時表達「清欄位」與「清勾選」→ 後者必用 `onClearSelection`,2026-07-18 決策12)。spec 寫 callback 時必明示哪一類。

## Badge 類 prop 名 canonical(按放置,不按「是 badge」籠統命名)

Badge 在不同 anchor 有兩種截然不同視覺 / 語意,prop 名區分:

| Prop | 用途 | 典型 anchor | Badge 型態 |
|------|------|------------|----------|
| `badge` | **Pill 內 inline badge** — label 右側 flex | Button(有 label)/ Tab item / Chip | inline count |
| `overlayBadge` | **疊視覺重心** — absolute 於 icon/avatar 角 | iconOnly Button / pure Icon | top-right count overlay |
| `badgeCount`(Avatar 專用) | count overlay,內部用 `<Badge variant="critical">`,貼 avatar 右上 | Avatar | overlay but Avatar 語意 |
| `status`(presence dot — Avatar / ProfileCard / PeoplePicker) | **非 Badge** — SVG presence dot,貼右下 | Avatar | presence indicator |

**禁止**:同 prop 名兼 inline + overlay。世界級 Material `BadgedBox`(overlay)vs `Chip.label`(inline)分開;Ant `<Badge overflowCount>` vs `<Tag>` 分開。

**`status` 兩個 value-set family(刻意 overload,非隱性衝突)**:(1) **presence** `'online' | 'away' | 'busy' | 'offline'` — Avatar / ProfileCard / PeoplePicker;(2) **lifecycle** `'uploading' | 'completed' | 'error'`(FileItem / FileUpload;TreeItem 只用其中的 `'completed' | 'error'` = 步驟導覽樹每一頁的結果,2026-10-07)/ `'inProgress' | 'success' | 'error'`(ProgressBar)。兩 family 各自 self-consistent,prop 名沿用同一 presence/lifecycle 軸。

**禁止組合**:有 label 的 Button / Chip 疊 `overlayBadge`(badge 飄到 chrome 邊緣遠離 icon 語義) → 計數改用 `badge` inline。詳 `badge.spec.md`「Overlay 適用元件 canonical」。

## `prefix` / `suffix` canonical(按「prop 型別」判,非按位置一刀切)

`prefix` / `suffix` 這對字在 DS 有 3 種身份,**只有當它是「放 ReactNode 的內容插槽 prop」時才禁**:

| 形態 | 判定 | 改用 / 對齊 |
|------|------|-----------|
| **ReactNode 內容插槽 prop**(`prefix?: ReactNode`)| ❌ **禁** — 位置名不傳達放什麼 | 內容描述名:`startIcon`/`endIcon`(icon)、`avatar`(ReactNode)、`endContent`/`endAction`(trailing slot)。對齊 Material `startIcon`/`endIcon`、Atlassian `iconBefore`/`iconAfter` |
| **值格式 affix 字串 prop**(`prefix?: string`)| ✅ **允許** — 黏在值上的貨幣/單位符號,屬格式化非插槽 | `NumberInput.prefix='$'`/`suffix='kg'`。對齊 Ant `InputNumber.prefix` |
| **結構 anatomy 詞彙 / 內部原語 / CSS 變數**(`ItemPrefix`/`ItemSuffix`、`--item-prefix-slot`、`data-prefix-type`、spec 的 `[prefix][content][suffix]` 骨架)| ✅ **允許** — 位置就是結構槽的身分(類比 CSS `::before`/`::after`),非 consumer 內容 prop | item-anatomy SSOT(`item-anatomy.spec.md`)|

**一句話判準**:**「是 ReactNode 內容插槽 consumer prop 嗎?是 → 禁(改內容名);否(格式字串 / 結構原語)→ 合法。」** `ui-development.md`「Props 命名」禁令的標的是**內容插槽**,非格式字串或結構詞彙——三者程式碼裡 0 衝突(全庫掃證實無任何元件暴露 ReactNode prefix/suffix 插槽 prop)。

## 尺寸參數(寬 / 高 / 上下限 / 檔位)canonical(2026-11-15,唯一住處)

**依據**:user 2026-11-11 對決策頁 r9 的回覆(逐字):「循環:兩態　唯讀:A　說明頁:甲　尺寸:甲　對話框寬:訂檔位　浮層密度:跟按鈕　主題:甲」。
其中「尺寸:甲」選的是決策頁第四題的甲選項,選項原文(AI 擬、user 選,逐字):「寬度一律叫 width,可以填 "fill"(撐滿)、"hug"(跟內容)或數字;高度同理;上下限叫 minWidth / maxWidth;大小檔位叫 size。輸入框、下拉需要固定寬時也用 width 填數字。舊名字保留一個版本,畫面不變。」
同一套名字也回答了表格工具面板的寬度參數該叫什麼(user 2026-11-11 逐字:「此外，所有data table的工具面板應該都要具備可以被消費者調整寬度的能力對吧？處理方式照你建議，但好奇我們ds width通常是用在哪？這邊不得用的原因為何」→ 照甲 = `width` + `minWidth` / `maxWidth`)。
盤點與推翻紀錄:audit-r7(2026-11-11)「尺寸類 prop 稽核」— 撐滿 3 名、跟內容 4 寫法、Input 漏原生 width、DataTable `height` 實為上限。

| 要表達的事 | 名字 | 值 | 例 |
|---|---|---|---|
| 寬怎麼長(撐滿 / 跟內容 / 固定) | `width` | `'fill'`(撐滿容器)\|`'hug'`(跟內容)\|數字(px,固定寬)—— **每個元件只列自己支援的值**。Dialog 另收寬度檔名 `'sm'\|'md'\|'lg'\|'xl'`(檔名與數字都是最大寬,受視窗四邊留白夾住;不收 `'fill'` / `'hug'`;`../../src/components/Dialog/dialog.spec.md`「寬度檔位」) | `<Select width={160}>`、`<Button width="fill">`、`<Input width="hug">`、`<DialogContent width="lg">` |
| 高怎麼長 | `height` | 同上(目前只有 Dialog:`'fill' \| 'hug'`) | `<DialogContent height="hug">` |
| 上下限 | `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | 數字(px);需要 CSS 單位或關鍵字時另收字串(例:`'100%'`、`'none'` = 沒有上限) | `<DataTable maxHeight={400}>`、`maxHeight="none"` |
| 大小檔位(跟密度一起變的高度 / 字級 / 內距) | `size` | `'sm' \| 'md' \| 'lg'`(Button / SegmentedControl 多一檔 `xs`) | `<Select size="sm">` |
| 子部位的寬 | `<部位>Width`(同一個值只有一個名字) | 數字(px)\|CSS 長度字串(比例寬) | Field / FieldGroup 的 `labelWidth` |
| 使用者可拖寬的面板 | `widthRange` / `defaultWidth` / `width`(受控) | 數字(px) | Sidebar / AppShellAside / AgentPanel(既有,不動) |

**規則**:
1. **撐滿 / 跟內容只准用 `width="fill"` / `width="hug"`**。禁止 `fullWidth` / `block` / `autoWidth` / `autoHeight` / `fluid` / `stretch` / `shouldFitContainer` 這類同義名(外部各家的名字,M23:DS 已有 canonical 就不採外部名)。
2. **數字一律是 px**。只有需要比例或 CSS 關鍵字的地方才另收字串(`labelWidth="30%"`、`maxHeight="100%"`)。rem 固定寬(跟使用者字級縮放)目前沒有參數管道,刻意要 rem 的地方照舊用 class(DataTable 篩選列兩格,`field-control-group.spec.md`「禁止事項」末條)。
3. **名字要說行為**:是上限就叫 `max*`,不叫 `height` / `width`(DataTable `height` 2026-11-15 改 `maxHeight` 的理由);`fill` 只表示「永遠撐滿」,「依內容、上限是格子」不能叫 `fill`(否則跟 Dialog `height="fill"` 同名不同義,AGENTS.md「命名 3 重 test」第 (3) 題)。
4. **`size` 只表示檔位**,不得拿來當寬度或長度。**只管寬的檔位放在 `width`、不另開 `size`**(Dialog:A18 成品頁 v5 第二題的甲案 = DialogContent 參數只用 width;選項與建議是 AI 擬的,user 2026-11-15 回「其他的部分照你建議我沒有意見」採納)—— 一個元件只有一個寬度參數,檔名與數字是同一個軸上的值(同第 7 條)。例外(已存在,不擴張):正方形媒體的 `size` = 邊長 px(Avatar / CircularProgress / AgentLogo;Avatar 另收模式詞 `'fill'`)。資料欄位與複合字不受這條管(`FileInfo.size` 位元組、`pageSize` / `maxSize` 是數量 / 位元組)。DataTable 欄定義用 `meta.width` 不用 TanStack `size`,理由同(`DataTable/column-types.ts` 註解)。
5. **改名一律留舊名一個版本**:`@deprecated` JSDoc + 內部轉成新名(畫面不變),同時傳時新名勝出;DS 自己的程式、範例、規格不得再用舊名。
6. **拿掉漏出來的 HTML 原生 `width` / `height`**:欄位家族(Input / NumberInput / LinkInput)的 `<input type="text">` 原生 width / height 沒有作用,型別上必須 Omit,改走 DS 的 `width` 軸;否則 `<Input width="hug">` 型別會過、畫面毫無反應。
7. 判斷「同一個字在別處是不是不同義」(AGENTS.md 命名 3 重 test 第 (3) 題)的答案:`width` 在全 DS 都是「這個元件的寬」—— 模式詞與數字是同一個軸上的值,不是兩種意思;各元件能填的值不同是**型別範圍**不同(看編輯器提示),不是語意不同(這是甲案自己寫明的代價:「每個元件的 `width` 能填的值不完全一樣,要看編輯器提示」)。

**2026-11-15 收斂的舊名**(全部 `@deprecated` 保留一個版本,行為不變):Button / SegmentedControl `fullWidth` → `width="fill"`;FieldControlGroup `block` → `width="fill"`;Input `autoWidth` → `width="hug"`;FieldGroup `horizontalLabelWidth` → `labelWidth`;DataTable `height` → `maxHeight`(`"auto"` → `"none"`)。
既有的 Dialog `autoHeight` → `height="hug"`(2026-09 已停用,閘 `scripts/overlay-story-contract-invariant.mjs` S3)。**2026-11-15 A18 加一個**:DialogContent `maxWidth` → `width`(檔名或數字;舊名 number = px、string 原樣當 CSS 寬,畫面不變;兩個同時傳時 `width` 勝、開發模式 warn)—— 它的行為一直是「寬」,不是只當上限(第 3 條)。**欄位家族新增固定寬**:Select / Combobox / DatePicker / DatePicker.Range / PeoplePicker / TimePicker / Input 收 `width` 數字,NumberInput / LinkInput 收 `'fill' | 數字`(`../../src/components/Field/field-controls.spec.md`「寬度軸(width: fill / hug)」)。

**世界級對照**(只列 2026-11-15 讀到原文的):
- CSS `width` 一個屬性同時收長度 / 百分比與關鍵字(`auto` / `max-content` / `min-content` / `fit-content` / `stretch`);`stretch`「behaving similar to `100%`」、`fit-content`「Use the available space, but not more than max-content」([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/width))—— 一個軸名同時收模式詞與長度。
- Figma:`layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL'`,「maps directly to the "Horizontal sizing" dropdown in the Figma UI」([Figma Plugin API](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/))—— 設計師熟悉的 Fill / Hug。
- Adobe React Spectrum:所有元件共用 style props `width` / `height` / `minWidth` / `maxWidth` / `minHeight` / `maxHeight`,型別 `Responsive<DimensionValue>`(token、字串或數字)([Styling](https://react-spectrum.adobe.com/react-spectrum/styling.html))—— 上下限一律 `min*` / `max*`。
- Atlassian Modal:`width?: number | string | WidthNames`(`'small' | 'medium' | 'large' | 'x-large'`)、「The recommended way to specify modal width is using named size options」;`height?: number | string`([`@atlaskit/modal-dialog` types.d.ts](https://unpkg.com/@atlaskit/modal-dialog/dist/types/types.d.ts) L4、L39-L47)—— 同一個 `width` 收檔位與長度。
- GitHub Primer Dialog:`width` = small 296 / medium 320 / large 480 / xlarge 640,「Also accepts any valid CSS width value」;`height` 收 `auto`(「variable based on contents」)([Dialog.tsx](https://raw.githubusercontent.com/primer/react/main/packages/react/src/Dialog/Dialog.tsx) L123-L140)。
- Mantine Popover:`width?: PopoverWidth`,「Dropdown width, or `'target'` to make dropdown width the same as target element @default 'max-content'」([Popover.tsx](https://raw.githubusercontent.com/mantinedev/mantine/master/packages/@mantine/core/src/components/Popover/Popover.tsx) L85-L86)—— 模式詞與長度共用一個 `width`。
- 反方(不採,理由見決策頁乙案):MUI / Polaris 撐滿用布林 `fullWidth`、長度另取名字 —— 要另外發明「數字寬」的名字,AgentPanel 既有的 `width` 也得改名。

**機械閘**:`scripts/sizing-props-invariant.mjs`(`npm run test:sizing-props`,CI 必跑;`--selftest` 對照組):R1 公開元件 props 不得新增撐滿 / 跟內容的同義名;R2 DS 自己的 JSX 不得用已停用的舊名(含 `<DialogContent maxWidth>`);R3 `size` 只能是檔位(例外清單 = 上面第 4 條);R4 欄位家族型別不得漏出原生 `width` / `height`;R5 DS 自己的 `<DialogContent width>` 只寫檔名、不寫數字(閘夾具除外;`dialog.spec.md`「寬度檔位」)。
**2026-11-15 同日第二批(A19)新增**(預設全部不變):表格三個工具面板 `DataTableSortManager` / `DataTableFilterPanel` / `DataTableColumnVisibilityPanel` 收 `width` / `minWidth` / `maxWidth`(px;下限保護列、只能拉高,視窗夾限恆在 —— `../../src/components/DataTable/data-table.spec.md`「工具面板的寬度」);`PopoverContent` 收 `width`(數字 | `'hug'`,數字夾在視窗內);`SheetContent` 收 `width`(數字,左右側板,不超過 75%)。依據:工具面板 = 本節開頭 user 2026-11-11 那句(逐字);Popover / Sheet = 決策頁 r9「照既有原則直接做」的「Sheet、Popover 加寬度參數」(預選、user 未逐字選)。視窗夾限一份:`../../src/tokens/elevation/overlay-geometry.ts` `OVERLAY_VIEWPORT_MAX_WIDTH`。同批的「清單列的左右內距改成元件參數」不是尺寸軸,住 `Command` 的 `gutter`(`'field' | 'surface'`,`../../src/patterns/element-anatomy/item-anatomy.spec.md`「Token: `--item-px`」客製方式)。
**待辦(不在 2026-11-15 這兩批)**:~~Dialog `maxWidth` 實為寬度(另案 A18 對話框寬度檔位)~~ —— 2026-11-15 A18 結案:改名 `width`(檔名 sm / md / lg / xl 或數字),見上方舊名清單與 `../../src/components/Dialog/dialog.spec.md`「寬度檔位」;DropdownMenu / SelectMenu 的 `minWidth` 目前是「取代預設下限」,表格工具面板的 `minWidth` 是「只能拉高」(下限保護列)—— 同名、對「比預設小」的處理不同,要不要統一是行為改變,未改。

## 常用 icon canonical

| 語義 | Icon | 反例 |
|------|------|------|
| 溢出選單 / 更多動作 | **`MoreVertical`** | ❌ `MoreHorizontal`(row 內水平排 icon 跟水平動作按鈕群視覺混淆,縱向三點更明確) |
| 路徑收合(Breadcrumb ellipsis)| `MoreHorizontal` | 唯一保留 `MoreHorizontal` — 沿路徑方向省略,非 overflow menu |
| 關閉(Close / Dismiss)| `X` | ❌ `XCircle`(error status,語義衝突) |
| 成功 / 完成 | `Check` / `CircleCheck` | — |
| 失敗 / 錯誤 | `XCircle` | — |
| 警告 / 提醒 | `TriangleAlert` | — |
| 資訊 / 說明 | `Info` | — |

**世界級對照**:Linear / Notion / GitHub / Figma 全部用 vertical 3-dots 作 overflow;horizontal 3-dots 專給 path/truncation(Breadcrumb / text ellipsis)。
