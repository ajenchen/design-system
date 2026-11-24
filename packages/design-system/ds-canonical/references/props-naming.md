# 元件 Props 命名 — 詳細對照表

Canonical `packages/design-system/ds-canonical/rules/ui-development.md`「元件 Props 命名」的詳細展開(callback / Badge / prefix·suffix / 尺寸參數 / 相容政策(改名 / 移除)/ icon canonical)。

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
(選項原文最後那一句「舊名字保留一個版本」已被 user 2026-11-15 原話取代 —— 見下方「相容政策」;引文照原樣保留,不改字。)
同一套名字也回答了表格工具面板的寬度參數該叫什麼(user 2026-11-11 逐字:「此外，所有data table的工具面板應該都要具備可以被消費者調整寬度的能力對吧？處理方式照你建議，但好奇我們ds width通常是用在哪？這邊不得用的原因為何」→ 照甲 = `width` + `minWidth` / `maxWidth`)。
盤點與推翻紀錄:audit-r7(2026-11-11)「尺寸類 prop 稽核」— 撐滿 3 名、跟內容 4 寫法、Input 漏原生 width、DataTable `height` 實為上限。

| 要表達的事 | 名字 | 值 | 例 |
|---|---|---|---|
| 寬怎麼長(撐滿 / 跟內容 / 固定) | `width` | `'fill'`(撐滿容器)\|`'hug'`(跟內容)\|數字(px,固定寬)—— **每個元件只列自己支援的值**。Dialog 另收寬度檔名 `'sm'\|'md'\|'lg'\|'xl'`(檔名與數字都是最大寬,受視窗四邊留白夾住;不收 `'fill'` / `'hug'`;`../../src/components/Dialog/dialog.spec.md`「寬度檔位」) | `<Select width={160}>`、`<Button width="fill">`、`<Input width="hug">`、`<DialogContent width="lg">` |
| 高怎麼長 | `height` | 同上(目前只有 Dialog:`'fill' \| 'hug'`) | `<DialogContent height="hug">` |
| 表格每一列的高怎麼長 | `rowHeight` | `'hug'`(跟內容長高);不寫 = 固定列高(由 `size` 決定)。2026-11-17 起,之前叫 `autoRowHeight` | `<DataTable rowHeight="hug">` |
| 上下限 | `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | 數字(px);需要 CSS 單位或關鍵字時另收字串(例:`'100%'`、`'none'` = 沒有上限)。`minWidth` 只能把元件自己的下限往上拉(第 8 條) | `<DataTable maxHeight={400}>`、`maxHeight="none"` |
| 大小檔位(跟密度一起變的高度 / 字級 / 內距) | `size` | `'sm' \| 'md' \| 'lg'`(Button / SegmentedControl 多一檔 `xs`) | `<Select size="sm">` |
| 子部位的寬 | `<部位>Width`(同一個值只有一個名字) | 數字(px)\|CSS 長度字串(比例寬) | Field / FieldGroup 的 `labelWidth` |
| 使用者可拖寬的面板 | `widthRange` / `defaultWidth` / `width`(受控) | 數字(px) | Sidebar / AppShellAside / AgentPanel(既有,不動) |

**規則**:
1. **撐滿 / 跟內容只准用 `width="fill"` / `width="hug"`**。禁止 `fullWidth` / `block` / `autoWidth` / `autoHeight` / `fluid` / `stretch` / `shouldFitContainer` 這類同義名(外部各家的名字,M23:DS 已有 canonical 就不採外部名)。
2. **數字一律是 px**。只有需要比例或 CSS 關鍵字的地方才另收字串(`labelWidth="30%"`、`maxHeight="100%"`)。rem 固定寬(跟使用者字級縮放)目前沒有參數管道,刻意要 rem 的地方照舊用 class(DataTable 篩選列兩格,`field-control-group.spec.md`「禁止事項」末條)。
3. **名字要說行為**:是上限就叫 `max*`,不叫 `height` / `width`(DataTable `height` 2026-11-15 改 `maxHeight` 的理由);`fill` 只表示「永遠撐滿」,「依內容、上限是格子」不能叫 `fill`(否則跟 Dialog `height="fill"` 同名不同義,AGENTS.md「命名 3 重 test」第 (3) 題)。
4. **`size` 只表示檔位**,不得拿來當寬度或長度。**只管寬的檔位放在 `width`、不另開 `size`**(Dialog:A18 成品頁 v5 第二題的甲案 = DialogContent 參數只用 width;選項與建議是 AI 擬的,user 2026-11-15 回「其他的部分照你建議我沒有意見」採納)—— 一個元件只有一個寬度參數,檔名與數字是同一個軸上的值(同第 7 條)。例外(已存在,不擴張):正方形媒體的 `size` = 邊長 px(Avatar / CircularProgress / AgentLogo;Avatar 另收模式詞 `'fill'`)。資料欄位與複合字不受這條管(`FileInfo.size` 位元組、`pageSize` / `maxSize` 是數量 / 位元組)。DataTable 欄定義用 `meta.width` 不用 TanStack `size`,理由同(`DataTable/column-types.ts` 註解)。
5. **改名 / 移除照下方「相容政策」**:0.x 與預發布版**不留舊名**(不標 `@deprecated`、不在內部把舊名轉成新名),同一版把 DS 自己的程式、範例、規格改完,同一個 PR 在變更帳本寫一條(能機械改寫就附 `fix`);1.0 以後的正式版才改回「留舊名一個版本」。
6. **拿掉漏出來的 HTML 原生 `width` / `height`**:欄位家族(Input / NumberInput / LinkInput)的 `<input type="text">` 原生 width / height 沒有作用,型別上必須 Omit,改走 DS 的 `width` 軸;否則 `<Input width="hug">` 型別會過、畫面毫無反應。
7. 判斷「同一個字在別處是不是不同義」(AGENTS.md 命名 3 重 test 第 (3) 題)的答案:`width` 在全 DS 都是「這個元件的寬」—— 模式詞與數字是同一個軸上的值,不是兩種意思;各元件能填的值不同是**型別範圍**不同(看編輯器提示),不是語意不同(這是甲案自己寫明的代價:「每個元件的 `width` 能填的值不完全一樣,要看編輯器提示」)。
8. **`minWidth` 只能把元件自己的下限往上拉**:有效下限 = max(元件預設下限, 傳入值)。傳得比預設下限小,照預設下限畫,不會讓元件更窄。DropdownMenu(預設下限 `max(180px, 觸發元件寬)`)、SelectMenu(`max(觸發元件寬, 15rem)`)與表格三個工具面板(`../../src/components/DataTable/data-table.spec.md`「工具面板的寬度」)同一套 —— 同一個名字只有一個意思(AGENTS.md 命名 3 重 test 第 (3) 題)。依據:決策頁 r10 第 4 題甲(AI 擬、AI 建議;選項原文「全部改成「只能往上拉」」「下拉選單永遠不比觸發的按鈕窄、不小於預設下限」),user 2026-11-17 對這題沒有留言,同日回「我把我有意見的部分都留言了，沒意見的部分照你建議」= 採甲。2026-11-17 前下拉選單的 `minWidth` 是「整個取代預設下限」(可以比觸發元件窄),帳本 `0.1.0-beta.149` 記一條 behavior。

**2026-11-15 收斂並移除的舊名**(升版照表改;全部登記在變更帳本 `../../ds-changes.json` 的 `0.1.0-beta.149` 節,帶 `fix` 的由 `qijenchen-ds-codemod upgrade` 自動改):Button / SegmentedControl `fullWidth` → `width="fill"`;FieldControlGroup `block` → `width="fill"`;Input `autoWidth` → `width="hug"`;FieldGroup `horizontalLabelWidth` → `labelWidth`;DataTable `height` → `maxHeight`(`"auto"` → `"none"`、`"400px"` → `{400}`、`"100%"` 照寫);DialogContent `autoHeight` → `height="hug"`(2026-09 已停用,閘 `scripts/overlay-story-contract-invariant.mjs` S3);DialogContent `maxWidth` → `width`(A18:檔名或數字;它的行為一直是「寬」,不是只當上限,第 3 條)。原本「先保留一個版本、行為不變」,user 2026-11-15 定下相容政策之後同一天拿掉(見下方「相容政策」)。**欄位家族新增固定寬**:Select / Combobox / DatePicker / DatePicker.Range / PeoplePicker / TimePicker / Input 收 `width` 數字,NumberInput / LinkInput 收 `'fill' | 數字`(`../../src/components/Field/field-controls.spec.md`「寬度軸(width: fill / hug)」)。

**2026-11-17 移除的舊名**(A96;同上,登記在帳本 `0.1.0-beta.149` 節、帶 `fix`):DataTable `autoRowHeight` → `rowHeight="hug"`(`autoRowHeight={false}` 或不寫 → 不寫 = 固定列高)。

**世界級對照**(只列 2026-11-15 讀到原文的):
- CSS `width` 一個屬性同時收長度 / 百分比與關鍵字(`auto` / `max-content` / `min-content` / `fit-content` / `stretch`);`stretch`「behaving similar to `100%`」、`fit-content`「Use the available space, but not more than max-content」([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/width))—— 一個軸名同時收模式詞與長度。
- Figma:`layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL'`,「maps directly to the "Horizontal sizing" dropdown in the Figma UI」([Figma Plugin API](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/))—— 設計師熟悉的 Fill / Hug。
- Adobe React Spectrum:所有元件共用 style props `width` / `height` / `minWidth` / `maxWidth` / `minHeight` / `maxHeight`,型別 `Responsive<DimensionValue>`(token、字串或數字)([Styling](https://react-spectrum.adobe.com/react-spectrum/styling.html))—— 上下限一律 `min*` / `max*`。
- Atlassian Modal:`width?: number | string | WidthNames`(`'small' | 'medium' | 'large' | 'x-large'`)、「The recommended way to specify modal width is using named size options」;`height?: number | string`([`@atlaskit/modal-dialog` types.d.ts](https://unpkg.com/@atlaskit/modal-dialog/dist/types/types.d.ts) L4、L39-L47)—— 同一個 `width` 收檔位與長度。
- GitHub Primer Dialog:`width` = small 296 / medium 320 / large 480 / xlarge 640,「Also accepts any valid CSS width value」;`height` 收 `auto`(「variable based on contents」)([Dialog.tsx](https://raw.githubusercontent.com/primer/react/main/packages/react/src/Dialog/Dialog.tsx) L123-L140)。
- Mantine Popover:`width?: PopoverWidth`,「Dropdown width, or `'target'` to make dropdown width the same as target element @default 'max-content'」([Popover.tsx](https://raw.githubusercontent.com/mantinedev/mantine/master/packages/@mantine/core/src/components/Popover/Popover.tsx) L85-L86)—— 模式詞與長度共用一個 `width`。
- 反方(不採,理由見決策頁乙案):MUI / Polaris 撐滿用布林 `fullWidth`、長度另取名字 —— 要另外發明「數字寬」的名字,AgentPanel 既有的 `width` 也得改名。

**機械閘**:`scripts/sizing-props-invariant.mjs`(`npm run test:sizing-props`,CI 必跑;`--selftest` 對照組):R1 公開元件 props 不得有撐滿 / 跟內容的同義名、也不得把已移除的舊名加回來(0.x 標了 `@deprecated` 也紅,政策讀 `scripts/lib/compat-policy.mjs`);R2 DS 自己的 JSX 不得用已移除的舊名(含 `<DialogContent maxWidth>`,閘夾具也不例外);R3 `size` 只能是檔位(例外清單 = 上面第 4 條);R4 欄位家族型別不得漏出原生 `width` / `height`;R5 DS 自己的 `<DialogContent width>` 只寫檔名、不寫數字(閘夾具除外;`dialog.spec.md`「寬度檔位」)。
**2026-11-15 同日第二批(A19)新增**(預設全部不變):表格三個工具面板 `DataTableSortManager` / `DataTableFilterPanel` / `DataTableColumnVisibilityPanel` 收 `width` / `minWidth` / `maxWidth`(px;下限保護列、只能拉高,視窗夾限恆在 —— `../../src/components/DataTable/data-table.spec.md`「工具面板的寬度」);`PopoverContent` 收 `width`(數字 | `'hug'`,數字夾在視窗內);`SheetContent` 收 `width`(數字,左右側板,不超過 75%)。依據:工具面板 = 本節開頭 user 2026-11-11 那句(逐字);Popover / Sheet = 決策頁 r9「照既有原則直接做」的「Sheet、Popover 加寬度參數」(預選、user 未逐字選)。視窗夾限一份:`../../src/tokens/elevation/overlay-geometry.ts` `OVERLAY_VIEWPORT_MAX_WIDTH`。同批的「清單列的左右內距改成元件參數」不是尺寸軸,住 `Command` 的 `gutter`(`'field' | 'surface'`,`../../src/patterns/element-anatomy/item-anatomy.spec.md`「Token: `--item-px`」客製方式)。
**待辦(不在 2026-11-15 這兩批)**:~~Dialog `maxWidth` 實為寬度(另案 A18 對話框寬度檔位)~~ —— 2026-11-15 A18 結案:改名 `width`(檔名 sm / md / lg / xl 或數字),見上方舊名清單與 `../../src/components/Dialog/dialog.spec.md`「寬度檔位」;~~DropdownMenu / SelectMenu 的 `minWidth` 是「取代預設下限」,表格工具面板的是「只能拉高」~~ —— 2026-11-17 A95 結案:全部「只能往上拉」,見上方規則第 8 條。

## 相容政策(改名 / 移除;2026-11-15,唯一住處)

**依據**(user 2026-11-15 原話,逐字):
- 「目前整個ds都沒有實際消費者，所以不用顧及改名會造成breaking change 甚至之前整個ds有為了避免消費者被影響而做的多餘的向後相容應該都可以拿掉確保整個ds還是能如期運作且乾淨，因為根本就不會有消費者被影響」
- 「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分，確保ds可以如期運作並乾淨才是重點，反正你發版的時候會有release note,大家自己看release note去更新就好了 看我上述說的是否合理，若合理看有哪些地方要調整才能永遠達到我要求的工作流程」
- 「主要其實也是讓要更新的消費者，通常會是 AI ，可以很清楚明確知道新版增刪改了什麼可以避免breaking change ，也可以更有效率更準確地直接符合新的ds的規範和原則 … 但基本上我們完全不用對這些消費者負責，不用向後相容」
- semver 2.0.0([原文](https://semver.org/spec/v2.0.0.html))第 4 條:「Major version zero (0.y.z) is for initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable.」;第 9 條:「A pre-release version indicates that the version is unstable and might not satisfy the intended compatibility requirements」。
- 同方向的既有規則:M23(f)「『向後相容』不是把新裁示變成可選的理由」(`../rules/meta-patterns.md`)。

**規則**(哪一種政策由 `packages/design-system/package.json` 的 `version` 決定;機器判斷只住 `scripts/lib/compat-policy.mjs`,閘都讀它):
1. **0.x 或帶預發布標籤**(例:`0.1.0-beta.148`)= **不做向後相容**:
   - 改名 / 移除參數、元件、root 出口、token、預設行為時**不留舊名**:不標 `@deprecated`、不在內部把舊名轉成新名、不為「既有 consumer 不會壞」留任何墊片。
   - **同一版**把 DS 自己的程式、範例、規格、模板、閘夾具全部改成新寫法。
   - **登記變更帳本**(取代相容墊片的機制,給升版的消費端 —— 通常是 AI —— 照表改):`../../ds-changes.json`(repo 路徑 `packages/design-system/ds-changes.json`,隨 npm 出貨)「下一版」那一節,每條寫 surface / target / change / to / do / spec,能機械改寫就附 `fix`(rename-prop / rename-export / rename-token);token 退場另在分類表 `retired` 登記 user 原話(`../../src/tokens/orphan-tokens.spec.md`「退場流程」)。節的鍵 = 含這些變更的版本號;已發布的節不改,寫錯在新節加 `errata`。
   - 規格只留「改名紀錄 / 升版對照」,不寫「保留一個版本」;理由欄不得用「向後相容 / 不影響既有 consumer」當理由 —— 預設值要寫它的設計理由,寫不出來就列成待 user 決定的預設值問題。
2. **1.0 以後的正式版**:改名留舊名一個版本(`@deprecated` + 內部轉新名,同時傳時新名勝),下一版才刪。【AI 推導 2026-11-15】沿用 2026-11-15 前第 5 條的寫法;user 還沒有對 1.0 之後的政策說過話,升 1.0 時要再確認。
3. **不在這條政策裡的**:token「要不要退場」仍由 user 逐字決定(改的是對外的 token 組,屬產品 / UI SSOT;那是授權,不是相容)—— 這條政策只拿掉「先保留一版、下一版才刪」的程序。擋舊名寫回的守衛(禁用清單、型別 `Omit`)不是相容,保留。外部套件的名字(Radix / TanStack 型別透傳)不是 DS 的舊名。

**發版說明的登記規則**(新增 / 行為與畫面變更 / 破壞性變更;2026-11-24):目的同上第三段 user 原話(「…可以很清楚明確知道新版增刪改了什麼…」);下面的分界與時點【AI 推導 2026-11-24】—— user 沒有逐條說過哪一類怎麼分,有不同意見時以 user 為準改這裡。
1. **一個改動登記成下面其中一類**,寫進變更帳本「下一版」那一節(與破壞性變更同一節):
   - **破壞性變更**(`changes`):消費端照舊寫會編不過、壞掉,或得到不同結果 —— 上面規則 1 的改名 / 移除 / 必填 / 收窄 / 預設值,與機器量不到的 `behavior` / `rule`。
   - **新增**(`added`):多了可以用的東西,原本的寫法一行都不用改 —— 新元件、新出口或子路徑、新的選填參數、參數多收的值、新 token / utility class、帶預設值的新 labels 鍵、新的 CLI 指令或選項、出貨檔(例 `ds-changes.json`)多的欄位。
   - **行為與畫面變更**(`updated`):既有的東西不用改程式,但看起來或用起來和上一版不同 —— 尺寸、間距、顏色、字級、圖示、動畫、預設文案、鍵盤 / 焦點 / 點擊 / 讀屏朗讀,以及修錯之後的行為。消費端得改程式才不會壞的不是這一類,寫破壞性變更。
   - **無使用者可見變化**(`noVisibleChange`,不進說明):改到預覽看得見的檔,但用 DS 做產品的人在元件畫面與行為上看不到差異 —— 重構、註解、內部型別、只改範例頁(`*.stories.tsx`)的示範內容或說明、只服務自動量測的 `test-only` 範例。一定寫 `reason`(一到三句:為什麼看不到差異)。
2. **每條寫什麼**:`added` / `updated` 寫 `id`(`<版本>/<英數>`)、`target`(消費端寫得出來的名字)、`note`(一到三句:消費端看得到什麼)、`spec`(出貨檔「段名」)、`paths`(涵蓋的 repo 檔,或以 `/` 結尾的資料夾;不用萬用字元,資料夾至少三層、在 `packages/<套件>/src/` 底下要指到 `src/<類別>/<名字>/`);`added` 另可列 `exports`(涵蓋的新出口)。破壞性變更條目也可以帶 `paths`,已寫在那裡的改動不必再寫一條。
3. **誰、什麼時候**:改動的作者(人或 AI 實作者)**在同一個 commit** 寫入條目,不留到合回或發版前補;多包工作時各包的實作者在自己那包的 commit 寫,審查時核對條目與改動對得上。
4. **機械閘**:`scripts/release-notes-coverage-invariant.mjs`(`npm run test:release-notes-coverage`,CI 必跑;`--selftest` 對照組):跟上一個發布 tag 比,改到預覽看得見的檔(集合 = `scripts/release-orchestrator.mjs` 的 `PRODUCT_VISIBLE`)或新增公開出口 / 子路徑(`public-surface-invariant` 量的同一套 exports)卻沒有任何一條涵蓋 → 紅;`paths` 對不到改動、豁免沒寫理由、`paths` 太寬也紅。

**機械閘**:`scripts/compat-policy-invariant.mjs`(`npm run test:compat-policy`,CI 必跑;`--selftest` 對照組):NC1 0.x 下 DS 原始碼不得有 `@deprecated`;NC2 DS 原始碼與規格不得拿「向後相容 / backward compat / 保留一個版本」當理由(「」引文與指回本段的句子除外)。`scripts/public-surface-invariant.mjs`(`npm run test:public-surface`,CI 必跑):跟上一個發布 tag 比整個公開介面(exports 子路徑與出口、出口走得到的型別成員、出貨 CSS 自訂屬性、@utility、預設值),每個破壞性差異都要對到帳本一條,寫了卻沒發生、改名的 to 不存在、spec 不是出貨檔都紅,已發布的節逐位元不改。另外 `scripts/sizing-props-invariant.mjs` R1 / R2 與 `scripts/token-creation-invariant.mjs` C10 依同一支政策判。
**發布說明與消費端**(2026-11-16 接上;2026-11-24 擴成三段):GitHub Release 說明依序「新增 / 行為與畫面變更 / 破壞性變更」三段(沒有條目的段寫「帳本這一節沒有登記」,不省略),由 `scripts/release-github-release.mjs` 從帳本那一節產生(renderer 與讀回驗收 = `../../tools/changes/ledger.mjs`),讀回的說明少任何一個段名、順序不對,或少任何一條 id 就不發布。消費端升版讀已裝套件裡的帳本、跑 `npx qijenchen-ds-codemod upgrade`(自動改帶 `fix` 的條目、列出其餘的 檔:行 / 做法 / 規格);寫入當下另有 fork hook `check_consumer_code_quality.sh` 的已移除名字檢查(`../hooks/lib/_ds_removed_names.sh`)擋「已刪除或改名的名字」(程式與 docs / overlay;名單由帳本投影)。

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

Overflow 一律用 vertical 3-dots;horizontal 3-dots 專給 path/truncation(Breadcrumb / text ellipsis)。
