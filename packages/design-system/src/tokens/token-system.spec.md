<!-- @benchmark-cited: token 分類、產品能不能改 token —— Primer、Material、Ant、Spectrum / React Spectrum / Spectrum CSS、Carbon、Polaris、Atlassian(版本固定網址見正文) -->([來源](https://github.com/primer/primitives/blob/47736486bf67b2a14ba1ada61fa0f57af29bb875/contributor-docs/adrs/adr-006-naming-design-tokens.md))

# Token System 設計原則(SSOT,跨所有 token family)

> **上游 canonical**:所有 token family 共同遵循的分類原則、判斷流程、擺放與命名規則住這裡;個別 family spec(color / typography / uiSize 等)與元件 spec 只講**自己那幾顆值是多少、為什麼**,不重述分類。
> **分類資料不住這裡**:每個名字屬於哪一類、主人是誰、住哪個檔、哪份規格說明它、產品與設計系統誰可以讀 —— 唯一一份是給機器讀的 [`token-registry.json`](./token-registry.json),由 `scripts/token-creation-invariant.mjs`(CI 必跑)拿它驗每一次改動。本檔與其他文件**不再列任何「哪顆是哪一類」的表**。
> 2026-11-11 改寫:舊版「5 層 + 兩張誰可以讀的表」對 342 顆裡的 194 顆說法跟 `README.md` 相反(GitHub issue #171);user 2026-11-10 拍板 token 第 1 題「1甲」改成本檔的三類 / 三題 / 三條規則。

## 一句話原則

**每個值只問一件事:「要改它,該問誰?」**

- 拿掉某一個元件,這個值就沒有意義 → 它是**那個元件的值**,該問那個元件。
- 拿掉任何一個元件,它都還有意義 → 它是**共用刻度**,該問整個系統。
- 問到誰,就住在誰那裡、名字開頭帶誰的名、由誰的規格說明(例外與細節見「三條規則」第 1 條、「命名」)。

顏色多一層**原料**:色票本身不直接用,只給有用途名字的顏色引用。

---

## 三類

| 類別 | 怎麼認 | 住哪 | 要改它問誰 |
|---|---|---|---|
| **原料**(`raw`) | 它上面有一層「有用途的名字」包著它,元件通常透過那一層取值。目前只有顏色有這一層:色票 `--color-blue-7` 被語意色 `--primary` 之類包著 | `color/primitives.css` | 顏色規格 |
| **共用刻度**(`shared`) | 拿掉任何一個元件它都還有意義。例:`--primary`、`--layout-space-loose`、`--field-height-md`、`--radius-md`、`--chrome-header-height` | `tokens/<類別>/` | 那一組刻度的規格 |
| **元件的值**(`component`) | 拿掉某一個元件它就沒有意義。例:`--sidebar-width`、`--tab-height-md`、`--tag-height-sm` | 那個元件資料夾裡的樣式檔 | 那個元件的規格 |

每個名字只落在一類;顆數與逐顆歸屬以分類表為準。分類表另有 `ignore` 一類,收第三方或 Tailwind 自己的變數(`--radix-*`、`--tw-*`),它們不是設計數值。元件內變數(只在主人自己的元素上設值、只有主人自己讀)不是 token,不屬任何一類、不登記 —— 判準見「命名」。

**搬家與收回的紀錄**(住處以分類表 `home` 為準):user 2026-11-10 拍板 token 第 2 題「2甲」—— 原本寄住 `uiSize/uiSize.css` 的 14 顆元件的值,第二階段分批搬到主人資料夾,每批畫面零差異;搬一顆改分類表一列。甲案原文是「分五批,先試搬分頁高;側欄排最後、驗最嚴」(批次:分頁高 → 標籤高 → 頭像重疊量 → 表格列高 → 側欄)。2026-11-11 五批全部搬完:分頁高 → `components/Tabs/tabs.css`、表格列高 → `components/DataTable/data-table.css`、側欄 4 顆 → `components/Sidebar/sidebar.css`、標籤高 → `components/Tag/tag.css`、頭像重疊量 → `components/Avatar/avatar.css`;`uiSize/uiSize.css` 現在只剩共用刻度。實際順序與甲案不同:側欄(甲案排最後)比標籤高、頭像重疊量先搬,這兩批第一輪沒做,審查後(commit a787e743 先把「還沒搬、順序偏離」照實寫進本段)才補上,搬法與驗法同前三批。第 3 題「3全收」的 6 顆只有一處在用的值已收回成元件自己的值(2026-11-11,名字退場、分類表刪列,畫面零差異):表格排序 / 篩選面板寬 3 顆 → `components/DataTable/data-table-sort-manager.tsx`、`data-table-filter-group.tsx`;按鈕群組分隔線 2 顆 → `components/Button/button-group.tsx`;選單最大高度 → `components/Command/command.tsx`。2026-11-13 側欄那 4 顆再收兩顆(AI 依第 0 題做的工程收斂;user 沒有決定過這個改法,只問過一句 —— 2026-11-11 對側欄這幾顆的原話「所以這些token是符合原則有必要產生的？」):`--sidebar-width-min`(240,只有 AppShell 在讀、不隨密度變)→ `components/AppShell/app-shell.tsx` 的常數 `PANEL_WIDTH_MIN_DEFAULT`,畫面零差異;`--sidebar-menu-icon-size`(收合細列寬公式裡的圖示欄)退場,改成 `SidebarProvider` 外層設的元件內變數 `--sidebar-rail-icon-slot`(= 畫出來的圖示寬,不在 `:root` 宣告、不登記)—— 這一顆**畫面有差異**:收合細列寬在「大密度 × 側欄 size sm / md」由 68 改回 64、「一般密度 × 側欄 size lg」由 48 改成 52(圖示在收合前後不再跳 2px;經過與四格數字見 `../components/Sidebar/sidebar.spec.md`「尺寸規範」)。側欄現行剩 `--sidebar-width`、`--sidebar-width-icon` 兩顆。

---

## 判斷流程(新增或檢查一個值時,照順序問三題)

**第 0 題:它需不需要一個全系統看得到的名字?**(每一個新值都要問,不分類別)

只有三種情況需要:
- (a) 兩個以上的**元件**必須用同一個值、而且要一起變;
- (b) 它會跟著密度或明暗主題切換;
- (c) 主人元件自己的程式以外,有人要讀它(設計系統裡的其他元件,或產品),或設計系統裡別的元件要寫它(例:`--item-prefix-slot`、`--tag-max-inline-size`)。產品不寫任何 token(見「誰可以讀」)。【AI 推導 2026-11-16:原句「有人要讀它或覆寫它」;主題甲之後產品不寫,「寫」只剩設計系統內部】

三個都不是 → **不開 token**,寫成元件自己檔案裡的值,不是常識值就加一行註解寫為什麼:

```tsx
// hardcode 24px:Tooltip arrow geometry,只此一處 consumer + 跟 Radix arrow lib 物理綁定
<TooltipArrow width={24} />
```

答 (a) 的人要寫得出「第二個讀者是誰」,或「它屬於哪一組既有刻度」;寫不出來就還不是共用(分類表該列的 `secondReader` / `scale`,閘 C2 強制)。
同一個元件裡多處要同步,用元件自己的常數就夠;跨兩個以上元件才開 token(舊版寫「≥ 2 處」,2026-11-11 收緊成「元件」)。只有展示頁用到的值放 `stories-helpers/`,不開 token(錨:工具列搜尋框下限 160px → `stories-helpers/scene/data-toolbar.tsx`)。
**禁止以「省工」「之後再開」「先寫死試試」為由拒絕開 token**;同理也禁止「之後可能有人用」就先開 —— 現行已出過「同值兩個住所必然漂移」而把 token 退回程式的事(`uiSize/uiSize.css` AgentPanel 面板寬那段註解)。這一句管的是**開新名字**;已經開放給產品讀的名字不拿它當刪除理由 —— 設計系統與 WM 看不到讀者 ≠ 沒有讀者,退場另走 `orphan-tokens.spec.md`「退場流程」(2026-11-15 `--brand` 曾被拿這句誤刪,同日還原;【AI 推導 2026-11-15】)。

**第 1 題:它上面有沒有一層有用途的名字包著它、元件通常透過那層取值?** → 有:**原料**。

**第 2 題:要改它,該問誰?** → 拿掉某一個元件它就沒意義:**元件的值**(主人 = 那個元件);否則:**共用刻度**。

讓答案唯一的兩個補充規定:
- **以「一組」為單位判,不逐顆判。** 同一個名字開頭的各個級距算一組(字級一組、圓角一組、語意色一組、動畫時長一組……)。一組裡某一顆目前只有一個元件在用(例:`--radius-sm` 只有圖表在用),它仍然是那組刻度的一員。**「一組」只指同一用途、彼此只差級距或狀態的一串名字**(`sm` / `md` / `lg`、`100` / `200`、`hover` / `active` / `subtle` / `text`);名字開頭相同、用途卻只屬於某一個元件的,不算組員,照第 0 題自己判(錨:`--motion-duration-shimmer` 開頭是動畫時長,用途卻只有 AgentPanel 的「思考中」文字微光,2026-11-15 收回 AgentPanel)。【AI 推導 2026-11-15:稽核 P10 把「一組」的寬讀法 / 窄讀法列為待決,user 沒有回覆這一題;這裡採窄讀法 —— 它只讓靠開頭搭便車的單一元件值出組,其他名字的歸類不變】閘 C9(丙)照這一句判沒有讀者的共用刻度算不算組員(最後一段是級距 / 狀態、而且同組有人讀才算)。
- **「現在有幾個元件在讀」不決定它是誰的。** 讀者數只用在第 0 題(要不要開名字),不用在第 2 題 —— 讀者數會隨程式改動而變,「要改它該問誰」不會因為多一個讀者而變。例:`--chrome-header-height` 執行期只有標頭元件在讀,但 `uiSize/uiSize.spec.md`「Chrome Header Height」段寫明它是側欄頂部、全域頂部列、產品頁首共用的高度 → 共用刻度。

---

## 三條規則

1. **主人決定三件事:住處、名字開頭、說明它的規格。**
   住處的意思是:預設值和每一段切換(大密度的覆寫、鎖回一般密度的回復、深色主題)都在同一個檔,不分家(閘 C3、C5)。住處原則上在主人那裡:原料 / 共用刻度在 `tokens/<類別>/`(閘 C3 驗在 `tokens/` 底下),元件的值在主人資料夾(閘 C3)。不在主人那裡的只有三種,理由寫在「擺放」:陰影(主人 elevation,跟顏色共用同一段明暗切換,住 `color/primitives.css`);執行期才由別的元件寫值、沒有預設宣告的元件的值,住處 = 寫它的檔(例:`--tag-max-inline-size`);搬家中的元件的值,暫時寄住在別的檔、分類表 `target` 已指向主人資料夾,搬完改 `home`。分類表 `home` 是 null 的不是例外,是待修的缺口(新名字閘 C2 不放行)。【AI 推導 2026-11-16:把分類表與「擺放」已有的情況補進規則 1 的字面,資料不動】【AI 推導 2026-11-16:「搬家中」是審查後補上的第三種 —— 閘本來就不擋 `target` 在主人資料夾的寄住(`--selftest` 的 `--fixture-parked-gap` 把它當該綠),只是這裡原本漏寫;同日閘 C3 補上元件的值 `home` 的檢查:住在主人資料夾以外、又不是搬家中或執行期寫值的,一律紅】
2. **同一個值只有一個住處。**
   程式需要數字版本時可以多一份對照常數;同一個檔裡結構上拆不掉的兩份 CSS 宣告也算一種(例:`--color-white` 在 `:root` 與 `@theme inline` 各一份)。兩種都必須由 `scripts/token-twin-invariant.mjs` 鎖住相等,登記清單只住該閘的 `TWIN_PAIRS` / `CSS_TWINS`(本檔不列,免得清單漂移)。對照常數只能用在不隨密度、明暗主題切換的值 —— 閘要求 CSS 端每一段宣告都等於同一個常數。讀的地方各自寫後備值(`var(--x, 預設)`)也是一份副本:同一顆在兩個以上的檔寫後備值,閘 C3 紅(補這條時已存在的副本逐檔列在分類表 `known.fallbackCopies`,單位是 `名字|檔`,只能變短 —— 已登記的名字在新的檔多一份照樣紅)。【AI 推導 2026-11-16:前兩句把閘已在執行的條件補成文字;後備值那句是新加的檢查,依據就是本條】
3. **分類表只有一份,給機器讀;其他文件只指過去。**
   「誰可以讀」是分類表的一欄,不是另一套規則。新名字先登記才放行(閘 C1、C2)。

---

## 誰可以讀(分類表 `product` / `dsReaders` 兩欄的預設值)

**產品不寫任何 token**(見下方第一條);下表只管「讀」。

| 類別 | 設計系統自己的元件 | 產品 |
|---|---|---|
| 原料 | 只有語意色引用;個別元件要直接讀,必須在該列 `dsReaders` 點名(現有:標籤、頭像、月曆的分類色,`color/color.spec.md`「Primitive 色票與 Tag / Avatar 的消費」段) | 不讀 |
| 共用刻度 | 都可以讀 | 可以讀來對齊;分類表可以逐列收緊成不讀(現有:動畫) |
| 元件的值 | 可以讀來跟主人對齊 | 不讀;**主人的規格點名**才可以讀 |

- **產品不寫任何 token**(主題甲)。user 2026-11-11 對決策頁 r9 的回覆(逐字,同 `../../ds-canonical/references/props-naming.md`「尺寸參數」的依據):「循環:兩態　唯讀:A　說明頁:甲　尺寸:甲　對話框寬:訂檔位　浮層密度:跟按鈕　主題:甲」。「主題:甲」選的選項原文(AI 擬、user 選,逐字):「甲 刻意不開，寫清楚 —— 原則改成「產品不能覆寫；要新品牌色，由 DS 新增一份主題」。現在只有一個品牌，真的有第二個時再開。誰:Polaris(明文不准覆寫)、React Spectrum」(Polaris 原文 [來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/tools/stylelint-polaris/rules/conventions-selector-disallowed-list.mdx#L17)、React Spectrum 原文 [來源](https://github.com/adobe/react-spectrum/blob/360e35170568dfc99a2baaa78e6b7bdd36458d91/packages/dev/docs/pages/react-spectrum/styling.mdx#L234-L242);兩派對照見「世界級對照」)。分類表 `product` 因此只有 `no` / `read` 兩個值;產品寫登記的名字也由閘 C7 擋,範圍與看不到的部分見本節最後一條。
  【AI 推導 2026-11-16】① 甲原文「產品不能覆寫」沒有限定範圍,這裡讀成「任何 token」:元件的值本來就不給產品覆寫(4甲)、共用尺寸開放讀不開放覆寫(5甲),分類表也沒有任何一列開放覆寫 —— 落地只是拿掉分類表「可讀也可覆寫」這個值,資料一列不動。② 甲原文寫在 2026-11-15 用詞更正之前,原文的「新增一份主題」指另一個品牌的一組配色,不是本 DS 現在說的主題(亮 / 暗,`color/color.spec.md`「用詞」)。照現在的用詞:要換品牌色(`--brand`)、互動色(`--primary`)這類顏色,由設計系統新增一組值;那組值涵蓋哪些名字、怎麼掛上去(用哪個屬性、跟亮 / 暗怎麼組合),等真的有第二個品牌時再定,本檔不先開名字或屬性(第 0 題「禁止『之後可能有人用』就先開」)。那組值不叫「主題」,免得跟亮 / 暗混在一起。③ 這一條管產品;設計系統裡的元件之間照樣可以寫(第 0 題 (c),例:`Command` 的 `gutter` 寫 `--item-px`)。
- **產品要「設定」元件的值,走元件參數,不覆寫 token**(user 2026-11-10 拍板 token 第 4 題「4甲」)。理由(AI 寫在選項文件裡的建議理由,user 選了甲案;不是 user 原話):參數有型別、寫錯會報錯、可以每頁不同;覆寫變數寫錯沒有任何提示。【AI 推導 2026-11-16 更正】其中「可以每頁不同」不是參數獨有 —— CSS 變數也能用選擇器分範圍設(Material Web 範例 `.square-buttons { --md-filled-button-container-shape: 0px; }`,[來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/docs/theming/README.md#L40-L48);Ant 巢狀 `ConfigProvider` 只換頁面一部分的 token,[來源](https://github.com/ant-design/ant-design/blob/615d1baef4a4d3197bd611651e6415d15d8bb4ca/docs/react/customize-theme.en-US.md#L112)),不能當理由。原理由裡站得住的只剩型別這一點(參數有型別、寫錯會報錯;覆寫變數寫錯沒有任何提示是它的反面);另補一點(AI 推導,不在原理由裡):參數名是對外合約,元件內部結構或樣式改版不會讓它靜默失效(React Spectrum:「If the internal DOM structure or CSS properties of a React Spectrum component change, this may lead to conflicts with CSS overrides in products.」,[來源](https://github.com/adobe/react-spectrum/blob/360e35170568dfc99a2baaa78e6b7bdd36458d91/packages/dev/docs/pages/react-spectrum/styling.mdx#L239-L241))。4甲 的決定不變。參數收的數字一律是 px(唯一住處 `../../ds-canonical/references/props-naming.md`「尺寸參數」規則 2)。例:側欄寬 —— Sidebar 放在 AppShell 裡時用 Sidebar 自己的 `widthRange`(`initial` = 產品要的預設寬);`defaultWidth` 是產品存下來的使用者寬度紀錄,不是預設寬;`--sidebar-width` 只是產品沒設時的預設。單獨使用(不在 AppShell 裡)的 Sidebar 沒有寬度參數,寬度就是 `--sidebar-width`。(2026-11-16 更正:原寫「AppShell 的 `widthRange` / `defaultWidth`」—— `defaultWidth` 是寬度紀錄、`widthRange` 是 Sidebar 的參數;`../components/Sidebar/sidebar.tsx` 該兩個參數的說明)
- **產品要「對齊」**(自己排的東西要跟 DS 一樣高、一樣內距):讀共用刻度(user 2026-11-10 拍板 token 第 5 題「5甲」:共用尺寸 12 顆 —— 輸入框高度 4、上下內距 3、左右內距 1、堆疊間距 1、樹狀縮排 3 —— 開放讀、不開放覆寫;標頭高照 `uiSize/uiSize.spec.md`「Chrome Header Height」已寫明可讀),或讀主人規格點名可讀的元件的值(目前只有表格列高 3 顆與儲存格左右內距,`components/DataTable/data-table.spec.md`「Inline create row」)。要輸入框還是用元件,不拿 token 自己刻。展示頁:Storybook `Design System/Tokens/UiSize`「產品對齊用的共用尺寸」(權限條件面板讀這些值跟選單對齊,大密度一起示範)。
- **主人規格怎麼點名**:主人規格寫一句以「主人規格點名・產品可讀」開頭、到句號為止,句中寫完整名字(例:`components/DataTable/data-table.spec.md`「Inline create row」)。分類表該列 `product` 不是 `no` 的元件的值必須被點名;被點名的名字分類表那一列也必須是可讀 —— 閘 C7 兩個方向都比,資料仍只有分類表一份,規格那句是給人看的承諾。
- 每一顆的實際值看分類表;產品端違規由閘 C7 擋(本 repo `apps/`),設計系統以外的產品 repo 看不到,登記在分類表 `known.productExternal`。

---

## 擺放

- **原料、共用刻度**:`tokens/<類別>/`。陰影(`--elevation-*`)住 `color/primitives.css`:它跟顏色共用同一段 `[data-theme="dark"]` 切換,放同一個區塊改主題設定一處全聯動;拆出去就有兩處主題觸發點,容易「改 a 壞 b」。拆分條件是「陰影需要獨立的明暗切換」(例:高對比模式不變色但加重陰影),目前不成立。對齊:Atlassian 的 shadow 與 color 同在一份主題檔(atlassian-light.js `--ds-shadow-raised` 與 `--ds-text-subtlest` 同檔,[來源](https://unpkg.com/@atlaskit/tokens@20.9.0/dist/es2019/artifacts/themes/atlassian-light.js));Polaris `shadow` 與 `color` 同住 `themes/base/`([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/shadow.ts#L41))。
- **元件的值**:主人元件資料夾的樣式檔。預設、覆寫、回復三段一起搬(規則 1)。執行期才由別的元件寫值、沒有預設宣告的(例:`--tag-max-inline-size`,由裝 Tag 的那一列量出可用寬後寫入),住處 = 寫它的檔,分類表 `home` 列出每一個寫入的檔;說明仍住主人規格(`../components/Tag/tag.spec.md`「尺寸」)。【AI 推導 2026-11-16】閘 C3 兩個方向都驗:`home` 列出的檔真的寫了它;設計系統執行期檔裡寫它的檔都列在 `home`(字串拼出來的名字看不到,見「機器擋不住」)。搬家中的(還寄住在別的檔、分類表 `target` 已指向主人資料夾)也暫時不在主人那裡,搬完改 `home`(紀錄見「三類」下方「搬家與收回的紀錄」)。【AI 推導 2026-11-16:審查後補寫;閘 C3 對元件的值只放行這兩種不在主人資料夾的情況】
- **用 `var()` 由別的 token 組出來、輸入會隨密度變的值**:公式只寫一份,宣告在 `:root` 與每個換密度的元素上(`uiSize/uiSize.css`「衍生值」段),不只寫在 `:root` —— 否則區塊換密度時它沿用整頁的值(`density/density.spec.md`「局部覆蓋」的保證;閘 `scripts/test-density-subtree-token-parity.mjs`)。主人在自己根元素上重算的也算數(`--table-cell-py` 在 DataTable 根元素的 `data-table-size` 上重算)。這條保證涵蓋哪些值、哪些不在內,住 `density/density.spec.md`「局部覆蓋」。
- **給 Tailwind class 用的轉接名**(例:`h-table-row-md` 背後的 `--spacing-table-row-md: var(--table-row-md)`)跟著本尊走;轉接名本身不登記,只檢查它指向的本尊有登記(閘 C1)。**哪些值開轉接名**(2026-11-15 寫下,稽核 N24):
  - 只為**產品可讀**(分類表 `product` 是 `read`)的值開,**整組開**,不挑單顆:共用刻度(例:`h-field-*`、`h-tree-indent-*`),以及主人規格點名產品可讀的元件的值(例:`h-table-row-*`)。
  - `product: no` 的值**不開**轉接名:轉接名寫在 `@theme inline`,會隨對外彙總檔 `styles/tokens.css` 發給產品,產品的 Tailwind 照樣產得出那個 class,等於把不開放的值開成對外寫法(閘 C7 只看本 repo `apps/`,擋不到外部產品)。2026-11-15 刪了分頁高 `h-tab-*`(稽核 P05)。現況還有一組不合這條:標籤高 `h-tag-*`(`product: no`,只有 Tag 自己的 cva 在用)—— 去留要 user 決定,本條不自動刪。
  - **產品可讀的值與它的轉接名,不得只憑「設計系統 / WM 裡看不到讀者」就由 AI 刪。** 這類名字是對外合約,要不要退場由 user 決定,走 `orphan-tokens.spec.md`「退場流程」(分類表 `retired` 登記 user 原話;0.x 同一版刪、不留舊名,1.0 以後先保留一版 —— 相容政策 `../../ds-canonical/references/props-naming.md`「相容政策」),閘 C10 擋悄悄消失(2026-11-15 樹狀縮排 `h-tree-indent-*` 曾被這樣刪掉,同日還原)。
  - **新增**對外 class 名(例:替 `--layout-space-*` 開 `p-layout-space-loose` 這類寫法)是對外 API 命名,要 user 決定,而且先過命名三重檢驗;本條不自動補。
  【AI 推導 2026-11-15:照稽核 N24 建議的方向寫下,user 沒有逐字決定過這一條;依據是本檔「誰可以讀」表(元件的值預設產品不讀)與分類表 `product` 欄。目前只拿來刪 `product: no` 的分頁高轉接名,沒有新增任何 class】
- 新的元件樣式檔一定要進對外彙總檔 `styles/tokens.css`(`node scripts/gen-figma-make-artifacts.mjs` 自動掃;被元件程式匯入的不收)或被元件程式匯入,否則安裝套件的產品拿不到值(2026-05-26 側欄寬事故;閘 C6)。彙總檔不手改:CI 跑產生器的 `--check`,提交的檔不等於產生器輸出就紅(2026-11-11 接上)。

---

## 命名

- **名字開頭對到哪個主人,以分類表為準,不靠字面猜**(例:`--field-` 是共用刻度;`--table-row-` 的主人是表格;`--tab-` 的主人是分頁)。同開頭、不同主人的(`--chrome-header-height` 共用刻度、`--chrome-header-avatar-size` 標頭樣式自己的值)各寫完整名字一列,不再新增這種情況。
- 原料(都是現有寫法):`--color-<色名>-<階>[-opaque]`、`--color-black`、`--color-white`、`--black-a<透明度>`、`--white-a<透明度>`、`--_<私有中介值>`。
- 共用刻度:`--<用途或刻度名>-<屬性>[-<級距>]`。語意色沿用 Atlassian 流派不帶 `--color-` 前綴(`--primary-hover`,[來源](https://unpkg.com/@atlaskit/tokens@20.9.0/dist/es2019/artifacts/themes/atlassian-light.js));底色深度一組(`--canvas` / `--surface*` / `--overlay` / `--tooltip`)與互動狀態成對一組(`--bg-<state>` 配 `--fg-<state>`)是兩個家族,即使值相同也不合併(Polaris `color-bg` vs `color-bg-surface-disabled`,[來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/color.ts#L258-L286))。
- 元件的值:`--<主人的開頭>-<屬性>[-<級距>]`。**主人的開頭** = 分類表裡這個主人已經在用的第一段(例:DataTable 是 `--table-`、Tabs 是 `--tab-`);主人在分類表還沒有任何一列時,用主人名字的 kebab 寫法(例:`ProgressBar` → `--progress-bar-`)。說明它的規格住主人資料夾(`components/<主人>/` 或 `patterns/<主人>/`)。閘 C2 對新名字查這兩件事;第一段跟別的主人重複(本段第一條「不再新增這種情況」)閘不查,靠審查。【AI 推導 2026-11-16:原公式「`--<主人>-<屬性>`」跟分類表好幾列的開頭對不上(例:DataTable 的 `--table-`、Tabs 的 `--tab-`),改成以分類表為準,資料不動】【AI 推導 2026-11-16:kebab 後備的反例掃描 —— 分類表裡有元件的值的 7 個主人,有 4 個的第一個名字不是 kebab 寫法:DataTable `--table-`(kebab 是 `--data-table-`)、Tabs `--tab-`(`--tabs-`)、header-canonical `--chrome-header-`(`--header-canonical-`)、element-anatomy `--item-`(`--element-anatomy-`);照本條,它們當初的第一個名字都會被 C2 擋。仍採 kebab 的理由:這 4 個都早於本條,閘以同主人既有列的開頭為準,它們之後的新名字照舊用 `--table-` / `--tab-` / `--chrome-header-` / `--item-`,不受影響;主人還沒有任何列時,kebab 是唯一不用人判斷、機器算得出來的寫法(縮成單數、改用概念名都要人判斷,閘驗不了);主人名字是 `components/` / `patterns/` 底下唯一的資料夾名,kebab 寫法因此很少跟別的主人撞(仍可能撞到共用刻度,例:`Field` → `--field-`,這種靠審查)。閘沒有例外通道;真要用別的開頭,改本條與閘,不在分類表開例外】**元件內變數**不是 token、不登記進分類表:只在主人自己的元素上設值(inline style 或主人自己的 class;不在 `:root` / 密度 / 主題 / `@theme` 段宣告)、只有主人自己讀的變數,名字照樣用主人開頭(例:Sidebar 的 `--sidebar-rail-icon-slot`;合約寫在 pattern 規格、由 row primitive 注入的用那個 pattern 的開頭,例 `--item-icon-size`,見 `../patterns/element-anatomy/item-anatomy.spec.md`)。判準與閘同一條:`scripts/token-creation-invariant.mjs` 檔頭 C1 第一段(整頁生效、或被宣告它的資料夾以外讀到的名字才要登記)與 C9 第一段(只有主人自己在讀、又不切換的值不開全系統的名字)。(2026-11-13 AI 工程判斷:把閘早就在執行的判準補成文字;元件內變數「名字用主人開頭」是同日一起寫下的命名慣例,閘不查元件內變數的名字)
- **級距字尾**統一 `xs / sm / md / lg`(陰影例外用 `100 / 200` 數字階,同 Polaris `shadow-100`,[來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/shadow.ts#L41-L45))。**禁**自創 `tiny` / `small` / `regular` / `large`。
- **Tailwind 轉接不改名**:提供 class 的 token 必經 `@theme inline` 或 `@utility`,class 名 = token 名去掉 `--` 加必要的 class 前綴(`bg-` / `text-` / `h-`);**禁**在轉接裡改名(`--font-body-size` 不可橋成 `text-paragraph`)或改值(`--spacing-field-md: 32px` = 漂移),必用 `var()` 指回本尊:

```css
@theme inline {
  --spacing-field-md: var(--field-height-md);   /* h-field-md */
  --color-primary:    var(--primary);            /* bg-primary */
}
```

- 語意色必須指向原料色,不直接寫色值(跳層 = 改值要動兩處)。新增語意色相走 `color/color.spec.md`「新增語意色相的標準流程」。
- 新名字過三重檢驗:對齊既有用語、≥ 2 家世界級慣用、跨元件不衝突(`packages/design-system/ds-canonical/references/naming-conventions.md`)。

---

## 新增 / 搬家 / 退場時要做的事

1. **分類表**:新名字加一列完整名字(`why` 必填;共用刻度寫 `scale` 或 `secondReader`);搬家改 `home`;退場刪那一列。**產品可讀**(`product` 不是 `no`)的名字與它的 Tailwind 轉接名退場,另要在分類表 `retired` 登記 user 原話(改名加 `renamedTo`;要不要留一版看相容政策 `../../ds-canonical/references/props-naming.md`「相容政策」—— 0.x 不留;閘 C10),並寫進變更帳本 `../../ds-changes.json`,流程住 `orphan-tokens.spec.md`「退場流程」。設計系統自己不讀、仍要保留的(例:產品層預留的 `--brand`),該列 `retain` 寫保留類別(類別只住 `orphan-tokens.spec.md`)。
2. **規格**:主人的規格寫這顆值是多少、為什麼(新名字必須完整出現在該列 `spec` 那份規格,閘 C4)。
3. **樣式檔**:預設與切換段同檔;新的元件樣式檔跑 `node scripts/gen-figma-make-artifacts.mjs` 進彙總檔。
4. **Tailwind 轉接**:要 class 就補 `@theme inline` / `@utility`。
5. **使用處**:改名或退場時全庫搜一次、一次改完(M10)。
6. **展示頁**:產品可讀的共用刻度要有展示頁(色票 / 字級 / 間距 / 尺寸對照)。
7. **跑閘**:`node scripts/token-creation-invariant.mjs`;有程式對照常數的再跑 `npm run test:token-twin`。

**禁**留「下個 session 補展示頁」「之後再搜使用處」。

---

## 機器擋得住什麼、擋不住什麼

閘 `scripts/token-creation-invariant.mjs`(檢查清單在檔頭,不在這裡重述)擋得住:放錯地方、沒登記、新名字靠開頭混過去、規格沒寫、密度覆寫漏回復、樣式檔沒進彙總檔、產品或元件讀了不該讀的、產品可讀的名字沒登記退場就消失(C10,2026-11-15)、顏色用詞混用(C11,2026-11-15;用詞住 `color/color.spec.md`「用詞」)、新的元件的值開頭不是主人的、或規格不在主人資料夾(C2)、新名字沒有住處(C2)、原料 / 共用刻度住在 `tokens/` 以外(C3)、元件的值住在主人資料夾以外又不是搬家中或執行期寫值(C3)、執行期寫值的元件的值有寫它的檔沒列進 `home`(C3)、同一顆的後備值寫在兩個以上的檔(C3,既有的副本逐檔列在 `known.fallbackCopies`,同一個名字多一個檔也紅)、產品寫任何登記的名字(C7)(以上 2026-11-16)。已知的舊缺漏(規格找不到的名字、元件直接讀原料的地方、漏回復)列在分類表 `known.*`,**只能變短**。
C5 只看「名字有沒有出現在回復段」;「區塊裡的值真的等於整頁該密度」由 `scripts/test-density-subtree-token-parity.mjs` 在瀏覽器裡實算(量測範圍:對外彙總檔展開 ∪ 分類表住處是 `.css` 的檔;用 `var()` 組出來的值 C5 看不到)。

擋不住、靠審查的人看分類表那一句 `why`:
- **這顆值的主人是誰、該歸哪一類** —— 設計判斷。機器只確認「有登記、登記不互相打架」。
- **該不該開這顆 token**(兩個值現在相等是巧合還是必須同步) —— 閘只抓得到幾種明顯的:只有主人自己在讀、主人以外沒有設計系統程式寫它、又不切換(C9;有沒有人寫這一項是審查後補的,對齊第 0 題 (c)【AI 推導 2026-11-16】;「元件的值」不分新舊全查,主人 = 分類表該列 `home` 與 `target` 的資料夾;其他類別只查新名字,既有的原料 / 共用刻度以一組為單位判);2026-11-15 起再加三種(稽核 P23):唯一的讀者在別的資料夾、只在程式裡量它的值(C9 甲);只被同檔公式當輸入、分類表沒寫明是中間值(C9 乙);沒有任何執行期讀者,而且不是一組級距 / 狀態裡有人讀的組員(C9 丙,既有的列在 `known.unread`、只能變短;分類表該列寫了保留類別 `retain` 的不算 —— 例:產品層預留的 `--brand`);另外每個讀者資料夾自己也有宣告的跨元件傳值,C1 同日也看得到了。兩個元件各讀一次、其實不必同步的值,閘仍看不出來。
- **跟別的主人同開頭** —— 閘只驗新名字的開頭是主人自己的,不驗有沒有跟別的主人撞(「命名」第一條不再新增那種)。
- **元件程式裡寫死一個本來該用共用刻度的數字**、字串拼出來的名字(`var(--color-${hue}-1)`;讀或寫都一樣,執行期寫值的 `home` 反向檢查也看不到這種寫法) —— 閘看不到。
- **設計系統以外的產品 repo** —— 同一條檢查要由產品 repo 自己跑。

世界級同樣這樣分工:Atlassian 把「要不要新增一個可重用的 token」交給人先判斷(「Designing whether a new reusable token should exist before implementation → use `add-frontend-offering` first.」,[來源](https://unpkg.com/@atlaskit/tokens@20.11.0/.agents/skills/add-design-tokens/SKILL.md) 第 29–30 行),工具只守公開名單(「the allow-list the Babel plugin validates `token('…')` calls against」,同檔第 56–57 行);Carbon 用測試比對公開介面快照(「compare the generated output with snapshots of the public API」,[來源](https://github.com/carbon-design-system/carbon/blob/f5bdc21a0933baca91875e618f07141ff708cbe7/packages/themes/tokens/README.md) 第 211 行)。

---

## 世界級對照

- **有沒有元件層**:有 —— Material、Ant、Primer、Spectrum(Spectrum 的原文見下方「元件的值只給主人用」那條);Carbon 有、但只有顏色(「Component tokens, one file per component」與 token 格式表 `$type`「Always "color"」,[來源](https://github.com/carbon-design-system/carbon/blob/f5bdc21a0933baca91875e618f07141ff708cbe7/packages/themes/tokens/README.md#L15) 第 15、53 行);Polaris 的元件層 `--pc-*` 是私有的,產品用到會被 lint 標出(「Flags declaration property values using private `--pc-*` tokens.」,[來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/tools/stylelint-polaris/rules/conventions-custom-property-allowed-list.mdx#L37)),公開的只有 `--p-*`。本 DS 選三類,理由:本 DS 已經有一批事實上屬於單一元件的值,兩層放不下(AI 推導)。(2026-11-16 更正:原句寫「兩層 Atlassian、Polaris、Fluent、Carbon(Carbon 的元件層只有顏色)」—— Atlassian、Fluent 沒有原文出處,Carbon 前後矛盾,拿掉)
  - Primer:「The design token naming convention will be based on three categories: base, component/pattern, functional.」([來源](https://github.com/primer/primitives/blob/47736486bf67b2a14ba1ada61fa0f57af29bb875/contributor-docs/adrs/adr-006-naming-design-tokens.md) 第 20 行)
  - Material:「Each component token maps to a system token, which has a concrete reference value.」([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/docs/theming/README.md) 第 33–34 行)
  - Ant:「In addition to Design Token, each component will also have its own Component Token …」([來源](https://github.com/ant-design/ant-design/blob/615d1baef4a4d3197bd611651e6415d15d8bb4ca/docs/react/customize-theme.en-US.md#L54))
- **元件的值跟著元件放**:Carbon「Component tokens start with the name of their component and live in the file named after it」([來源](https://github.com/carbon-design-system/carbon/blob/f5bdc21a0933baca91875e618f07141ff708cbe7/packages/themes/tokens/README.md) 第 44–45 行)。
- **元件的值只給主人用**:Spectrum「Component-specific tokens are intentionally limited. Use them only for their intended component or implementation and avoid reusing them as general-purpose design decisions.」([來源](https://github.com/adobe/spectrum-design-data/blob/dcc5be988f302a727233ec45c88c0bca16e899ed/docs/s2-docs/foundations/design-data/design-tokens.md) 第 163 行)。本 DS 允許設計系統內的元件互讀來對齊,也允許別的元件寫(第 0 題 (c)),比 Carbon(「should never be used for anything other than their own component」,[來源](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/elements/color/tokens.mdx#L52-L55))與 Spectrum 寬。Primer 原文是元件 / 模式 token「should only be used in component CSS」([來源](https://github.com/primer/primitives/blob/47736486bf67b2a14ba1ada61fa0f57af29bb875/contributor-docs/adrs/adr-006-naming-design-tokens.md#L60)),沒說別的元件能不能讀,不拿它當同一邊的依據。(2026-11-16 更正:原寫「跟 Primer『只用在元件樣式內』同一邊」)
- **產品能不能改 token —— 兩派**:
  - 開放(本 DS 不採):Material Web「design tokens are CSS custom properties and can be scoped with CSS selectors」+ `.square-buttons { --md-filled-button-container-shape: 0px; }`([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/docs/theming/README.md#L40-L48));Spectrum CSS「modifying styles is supported through the use of component-specific `--mod` prefixed properties」([來源](https://github.com/adobe/spectrum-css/blob/70d3660a992a98837d8177d8c25dc5a282e8f361/README.md#L51));Ant「each component will also have its own Component Token to achieve style customization capabilities for components」([來源](https://github.com/ant-design/ant-design/blob/615d1baef4a4d3197bd611651e6415d15d8bb4ca/docs/react/customize-theme.en-US.md#L54)),巢狀 `ConfigProvider` 可只換一部分([來源](https://github.com/ant-design/ant-design/blob/615d1baef4a4d3197bd611651e6415d15d8bb4ca/docs/react/customize-theme.en-US.md#L112));Carbon「Altering one, some, or all of the default token values will result in a new theme」([來源](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/elements/themes/overview.mdx#L63-L68))。
  - 不開放(本 DS 採):Polaris「Avoid overriding the styles of Polaris components in your SCSS. Consider contributing an extension or enhancement to the component's API instead.」([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/tools/stylelint-polaris/rules/conventions-selector-disallowed-list.mdx#L17)),lint 只准產品定義不以 `--p-`、`--pc-`、`--polaris-version-` 開頭的自訂屬性([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris.shopify.com/content/tools/stylelint-polaris/rules/conventions-custom-property-allowed-list.mdx#L17));React Spectrum「In general, customizing Spectrum design is discouraged」([來源](https://github.com/adobe/react-spectrum/blob/360e35170568dfc99a2baaa78e6b7bdd36458d91/packages/dev/docs/pages/react-spectrum/styling.mdx#L33-L34)),S2「Other styles such as colors and internal padding cannot be customized within Spectrum components.」([來源](https://github.com/adobe/react-spectrum/blob/360e35170568dfc99a2baaa78e6b7bdd36458d91/packages/dev/s2-docs/pages/s2/styling.mdx#L49))。
  - 本 DS 不開放是 user 的決定(主題甲,原話與選項原文見「誰可以讀」);不採開放派的理由只用甲原文那一句「現在只有一個品牌，真的有第二個時再開」,AI 不另加理由。SLDS 的 styling hooks 這次沒有取得可查的原文,不列。
- **共用刻度是主要入口**:Spectrum「Semantic tokens are the primary way consumers interact with Spectrum design tokens.」(跟「元件的值只給主人用」那條同一個檔,[來源](https://github.com/adobe/spectrum-design-data/blob/dcc5be988f302a727233ec45c88c0bca16e899ed/docs/s2-docs/foundations/design-data/design-tokens.md#L95) 第 95 行;2026-11-16 原寫「同上檔」,上面插入「兩派」那條後改成指名)。
- **原料不直接用**:Primer「Base color tokens don't respect color modes and should never be used directly in code or design.」([來源](https://primer.style/foundations/color/overview))。

---

## 反 pattern(禁)

| 禁 | 原因 |
|---|---|
| 新名字沒在分類表登記完整名字就開 | 靠開頭自動繼承分類 = 沒有人判斷過它是誰的(閘 C2) |
| 在第二份文件寫「哪顆是哪一類」的表 | 194 顆矛盾就是兩張表各寫各的(規則 3) |
| 為單一元件開全系統的名字 | 每多一個 token 就多一個要維護、要命名、會漂移的東西(第 0 題;閘 C9) |
| 共用刻度塞進元件樣式檔、元件的值放回共用檔 | 住處 = 主人(規則 1;閘 C3) |
| 拆陰影出 `primitives.css` 另做深色覆寫 | 兩處主題觸發點(見「擺放」) |
| 語意色直接寫色值不指向原料 | 跳層,改值要動兩處 |
| 新元件樣式檔沒進對外彙總檔 | 產品拿不到 → 跑版(閘 C6) |
| 產品寫任何 token(元件的值、共用刻度、語意色) | 要設定元件走元件參數(4甲);要換品牌色、互動色由設計系統新增一組值(主題甲;範圍的讀法見「誰可以讀」AI 推導 ①②) |
| 讀的地方各自寫後備值 `var(--x, 預設)`,同一顆寫在好幾個檔 | 同一個值好幾份,改預設要找遍全庫(規則 2;閘 C3) |

---

## 相關

- [`token-registry.json`](./token-registry.json) — 分類資料(唯一一份)
- `README.md`(tokens charter)— 資料夾地圖
- `color/color.spec.md` — 原料與語意色的具體規則(含標籤 / 頭像直接讀原料的分類色用途)
- `uiSize/uiSize.spec.md` — 共用尺寸刻度
- `typography/typography.spec.md`、`radius/radius.spec.md`、`opacity/opacity.spec.md`、`motion/motion.spec.md`、`layoutSpace/layoutSpace.spec.md`、`elevation/elevation.spec.md`
- 閘:`scripts/token-creation-invariant.mjs`、`scripts/token-twin-invariant.mjs`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
- `command.spec.md`
- `header-canonical.spec.md`
- `motion.spec.md`
- `orphan-tokens.spec.md`
