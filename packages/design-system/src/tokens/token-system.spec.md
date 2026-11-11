<!-- @benchmark-cited: token 分類(原料 / 共用刻度 / 元件的值)— Primer ADR-006、Carbon、Spectrum、Atlassian(版本固定網址見正文) -->([來源](https://github.com/primer/primitives/blob/47736486bf67b2a14ba1ada61fa0f57af29bb875/contributor-docs/adrs/adr-006-naming-design-tokens.md))

# Token System 設計原則(SSOT,跨所有 token family)

> **上游 canonical**:所有 token family 共同遵循的分類原則、判斷流程、擺放與命名規則住這裡;個別 family spec(color / typography / uiSize 等)與元件 spec 只講**自己那幾顆值是多少、為什麼**,不重述分類。
> **分類資料不住這裡**:每個名字屬於哪一類、主人是誰、住哪個檔、哪份規格說明它、產品與設計系統誰可以讀 —— 唯一一份是給機器讀的 [`token-registry.json`](./token-registry.json),由 `scripts/token-creation-invariant.mjs`(CI 必跑)拿它驗每一次改動。本檔與其他文件**不再列任何「哪顆是哪一類」的表**。
> 2026-11-11 改寫:舊版「5 層 + 兩張誰可以讀的表」對 342 顆裡的 194 顆說法跟 `README.md` 相反(GitHub issue #171);user 2026-11-10 拍板 token 第 1 題「1甲」改成本檔的三類 / 三題 / 三條規則。

## 一句話原則

**每個值只問一件事:「要改它,該問誰?」**

- 拿掉某一個元件,這個值就沒有意義 → 它是**那個元件的值**,該問那個元件。
- 拿掉任何一個元件,它都還有意義 → 它是**共用刻度**,該問整個系統。
- 問到誰,就住在誰那裡、名字開頭帶誰的名、由誰的規格說明。

顏色多一層**原料**:色票本身不直接用,只給有用途名字的顏色引用。

---

## 三類

| 類別 | 怎麼認 | 住哪 | 要改它問誰 |
|---|---|---|---|
| **原料**(`raw`) | 它上面有一層「有用途的名字」包著它,元件通常透過那一層取值。目前只有顏色有這一層:色票 `--color-blue-7` 被語意色 `--primary` 之類包著 | `color/primitives.css` | 顏色規格 |
| **共用刻度**(`shared`) | 拿掉任何一個元件它都還有意義。例:`--primary`、`--layout-space-loose`、`--field-height-md`、`--radius-md`、`--chrome-header-height` | `tokens/<類別>/` | 那一組刻度的規格 |
| **元件的值**(`component`) | 拿掉某一個元件它就沒有意義。例:`--sidebar-width`、`--tab-height-md`、`--tag-height-sm` | 那個元件資料夾裡的樣式檔 | 那個元件的規格 |

每個名字只落在一類;顆數與逐顆歸屬以分類表為準。分類表另有 `ignore` 一類,收第三方或 Tailwind 自己的變數(`--radix-*`、`--tw-*`),它們不是設計數值。

**搬家與收回的紀錄**(住處以分類表 `home` 為準):user 2026-11-10 拍板 token 第 2 題「2甲」—— 原本寄住 `uiSize/uiSize.css` 的 14 顆元件的值,第二階段分批搬到主人資料夾,每批畫面零差異;搬一顆改分類表一列。甲案原文是「分五批,先試搬分頁高;側欄排最後、驗最嚴」(批次:分頁高 → 標籤高 → 頭像重疊量 → 表格列高 → 側欄)。2026-11-11 五批全部搬完:分頁高 → `components/Tabs/tabs.css`、表格列高 → `components/DataTable/data-table.css`、側欄 4 顆 → `components/Sidebar/sidebar.css`、標籤高 → `components/Tag/tag.css`、頭像重疊量 → `components/Avatar/avatar.css`;`uiSize/uiSize.css` 現在只剩共用刻度。實際順序與甲案不同:側欄(甲案排最後)比標籤高、頭像重疊量先搬,這兩批第一輪沒做,審查後(commit a787e743 先把「還沒搬、順序偏離」照實寫進本段)才補上,搬法與驗法同前三批。第 3 題「3全收」的 6 顆只有一處在用的值已收回成元件自己的值(2026-11-11,名字退場、分類表刪列,畫面零差異):表格排序 / 篩選面板寬 3 顆 → `components/DataTable/data-table-sort-manager.tsx`、`data-table-filter-group.tsx`;按鈕群組分隔線 2 顆 → `components/Button/button-group.tsx`;選單最大高度 → `components/Command/command.tsx`。

---

## 判斷流程(新增或檢查一個值時,照順序問三題)

**第 0 題:它需不需要一個全系統看得到的名字?**(每一個新值都要問,不分類別)

只有三種情況需要:
- (a) 兩個以上的**元件**必須用同一個值、而且要一起變;
- (b) 它會跟著密度或明暗主題切換;
- (c) 主人元件自己的程式以外,有人要讀它或覆寫它。

三個都不是 → **不開 token**,寫成元件自己檔案裡的值,不是常識值就加一行註解寫為什麼:

```tsx
// hardcode 24px:Tooltip arrow geometry,只此一處 consumer + 跟 Radix arrow lib 物理綁定
<TooltipArrow width={24} />
```

答 (a) 的人要寫得出「第二個讀者是誰」,或「它屬於哪一組既有刻度」;寫不出來就還不是共用(分類表該列的 `secondReader` / `scale`,閘 C2 強制)。
同一個元件裡多處要同步,用元件自己的常數就夠;跨兩個以上元件才開 token(舊版寫「≥ 2 處」,2026-11-11 收緊成「元件」)。只有展示頁用到的值放 `stories-helpers/`,不開 token(錨:工具列搜尋框下限 160px → `stories-helpers/scene/data-toolbar.tsx`)。
**禁止以「省工」「之後再開」「先寫死試試」為由拒絕開 token**;同理也禁止「之後可能有人用」就先開 —— 現行已出過「同值兩個住所必然漂移」而把 token 退回程式的事(`uiSize/uiSize.css` AgentPanel 面板寬那段註解)。

**第 1 題:它上面有沒有一層有用途的名字包著它、元件通常透過那層取值?** → 有:**原料**。

**第 2 題:要改它,該問誰?** → 拿掉某一個元件它就沒意義:**元件的值**(主人 = 那個元件);否則:**共用刻度**。

讓答案唯一的兩個補充規定:
- **以「一組」為單位判,不逐顆判。** 同一個名字開頭的各個級距算一組(字級一組、圓角一組、語意色一組、動畫時長一組……)。一組裡某一顆目前只有一個元件在用(例:`--radius-xs` 只有圖表在用),它仍然是那組刻度的一員。
- **「現在有幾個元件在讀」不決定它是誰的。** 讀者數只用在第 0 題(要不要開名字),不用在第 2 題 —— 讀者數會隨程式改動而變,「要改它該問誰」不會因為多一個讀者而變。例:`--chrome-header-height` 執行期只有標頭元件在讀,但 `uiSize/uiSize.spec.md`「Chrome Header Height」段寫明它是側欄頂部、全域頂部列、產品頁首共用的高度 → 共用刻度。

---

## 三條規則

1. **主人決定三件事:住處、名字開頭、說明它的規格。**
   住處的意思是:預設值和每一段切換(大密度的覆寫、鎖回一般密度的回復、深色主題)都在同一個檔,不分家(閘 C3、C5)。
2. **同一個值只有一個住處。**
   程式需要數字版本時可以多一份對照常數,但必須由自動檢查鎖住兩邊相等(`scripts/token-twin-invariant.mjs`:`--stack-gap`、`--avatar-stack-overlap`、`--tree-indent-*`、`--tag-height-*`)。
3. **分類表只有一份,給機器讀;其他文件只指過去。**
   「誰可以讀」是分類表的一欄,不是另一套規則。新名字先登記才放行(閘 C1、C2)。

---

## 誰可以讀(分類表 `product` / `dsReaders` 兩欄的預設值)

| 類別 | 設計系統自己的元件 | 產品 |
|---|---|---|
| 原料 | 只有語意色引用;個別元件要直接讀,必須在該列 `dsReaders` 點名(現有:標籤、頭像、月曆的分類色,`color/color.spec.md`「Primitive 色票與 Tag / Avatar 的消費」段) | 不讀 |
| 共用刻度 | 都可以讀 | 預設可以讀來對齊、不可覆寫;分類表可以逐列收緊(現有:動畫不開放) |
| 元件的值 | 可以讀來跟主人對齊 | 預設不讀不覆寫;**主人的規格點名**才可以讀 |

- **產品要「設定」元件的值,走元件參數,不覆寫 token**(user 2026-11-10 拍板 token 第 4 題「4甲」)。理由(AI 寫在選項文件裡的建議理由,user 選了甲案;不是 user 原話):參數有型別、寫錯會報錯、可以每頁不同;覆寫變數寫錯沒有任何提示。例:側欄寬用 AppShell 的 `widthRange` / `defaultWidth`,token 只是產品沒設時的預設。
- **產品要「對齊」**(自己排的東西要跟 DS 一樣高、一樣內距):讀共用刻度(user 2026-11-10 拍板 token 第 5 題「5甲」:共用尺寸 12 顆 —— 輸入框高度 4、上下內距 3、左右內距 1、堆疊間距 1、樹狀縮排 3 —— 開放讀、不開放覆寫;標頭高照 `uiSize/uiSize.spec.md`「Chrome Header Height」已寫明可讀),或讀主人規格點名可讀的元件的值(目前只有表格列高 3 顆與儲存格左右內距,`components/DataTable/data-table.spec.md`「Inline create row」)。要輸入框還是用元件,不拿 token 自己刻。展示頁:Storybook `Design System/Tokens/UiSize`「產品對齊用的共用尺寸」(權限條件面板讀這些值跟選單對齊,大密度一起示範)。
- **主人規格怎麼點名**:主人規格寫一句以「主人規格點名・產品可讀」開頭、到句號為止,句中寫完整名字(例:`components/DataTable/data-table.spec.md`「Inline create row」)。分類表該列 `product` 不是 `no` 的元件的值必須被點名;被點名的名字分類表那一列也必須是可讀 —— 閘 C7 兩個方向都比,資料仍只有分類表一份,規格那句是給人看的承諾。
- 每一顆的實際值看分類表;產品端違規由閘 C7 擋(本 repo `apps/`),設計系統以外的產品 repo 看不到,登記在分類表 `known.productExternal`。

---

## 擺放

- **原料、共用刻度**:`tokens/<類別>/`。陰影(`--elevation-*`)住 `color/primitives.css`:它跟顏色共用同一段 `[data-theme="dark"]` 切換,放同一個區塊改主題設定一處全聯動;拆出去就有兩處主題觸發點,容易「改 a 壞 b」。拆分條件是「陰影需要獨立的明暗切換」(例:高對比模式不變色但加重陰影),目前不成立。對齊:Atlassian 的 shadow 與 color 同在一份主題檔(atlassian-light.js `--ds-shadow-raised` 與 `--ds-text-subtlest` 同檔,[來源](https://unpkg.com/@atlaskit/tokens@20.9.0/dist/es2019/artifacts/themes/atlassian-light.js));Polaris `shadow` 與 `color` 同住 `themes/base/`([來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/shadow.ts#L41))。
- **元件的值**:主人元件資料夾的樣式檔。預設、覆寫、回復三段一起搬(規則 1)。
- **用 `var()` 由別的 token 組出來、輸入會隨密度變的值**:公式只寫一份,宣告在 `:root` 與每個換密度的元素上(`uiSize/uiSize.css`「衍生值」段),不只寫在 `:root` —— 否則區塊換密度時它沿用整頁的值(`density/density.spec.md`「局部覆蓋」的保證;閘 `scripts/test-density-subtree-token-parity.mjs`)。主人在自己根元素上重算的也算數(`--table-cell-py` 在 DataTable 根元素的 `data-table-size` 上重算)。
- **給 Tailwind class 用的轉接名**(例:`h-tab-md` 背後的 `--spacing-tab-md: var(--tab-height-md)`)跟著本尊走;轉接名本身不登記,只檢查它指向的本尊有登記(閘 C1)。
- 新的元件樣式檔一定要進對外彙總檔 `styles/tokens.css`(`node scripts/gen-figma-make-artifacts.mjs` 自動掃;被元件程式匯入的不收)或被元件程式匯入,否則安裝套件的產品拿不到值(2026-05-26 側欄寬事故;閘 C6)。彙總檔不手改:CI 跑產生器的 `--check`,提交的檔不等於產生器輸出就紅(2026-11-11 接上)。

---

## 命名

- **名字開頭對到哪個主人,以分類表為準,不靠字面猜**(例:`--field-` 是共用刻度;`--table-row-` 的主人是表格;`--tab-` 的主人是分頁)。同開頭、不同主人的(`--chrome-header-height` 共用刻度、`--chrome-header-avatar-size` 標頭樣式自己的值)各寫完整名字一列,不再新增這種情況。
- 原料(都是現有寫法):`--color-<色名>-<階>[-opaque]`、`--color-black`、`--color-white`、`--black-a<透明度>`、`--white-a<透明度>`、`--_<私有中介值>`。
- 共用刻度:`--<用途或刻度名>-<屬性>[-<級距>]`。語意色沿用 Atlassian 流派不帶 `--color-` 前綴(`--primary-hover`,[來源](https://unpkg.com/@atlaskit/tokens@20.9.0/dist/es2019/artifacts/themes/atlassian-light.js));底色深度一組(`--canvas` / `--surface*` / `--overlay` / `--tooltip`)與互動狀態成對一組(`--bg-<state>` 配 `--fg-<state>`)是兩個家族,即使值相同也不合併(Polaris `color-bg` vs `color-bg-surface-disabled`,[來源](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-tokens/src/themes/base/color.ts#L258-L286))。
- 元件的值:`--<主人>-<屬性>[-<級距>]`。
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

1. **分類表**:新名字加一列完整名字(`why` 必填;共用刻度寫 `scale` 或 `secondReader`);搬家改 `home`;退場刪那一列。
2. **規格**:主人的規格寫這顆值是多少、為什麼(新名字必須完整出現在該列 `spec` 那份規格,閘 C4)。
3. **樣式檔**:預設與切換段同檔;新的元件樣式檔跑 `node scripts/gen-figma-make-artifacts.mjs` 進彙總檔。
4. **Tailwind 轉接**:要 class 就補 `@theme inline` / `@utility`。
5. **使用處**:改名或退場時全庫搜一次、一次改完(M10)。
6. **展示頁**:產品可讀的共用刻度要有展示頁(色票 / 字級 / 間距 / 尺寸對照)。
7. **跑閘**:`node scripts/token-creation-invariant.mjs`;有程式對照常數的再跑 `npm run test:token-twin`。

**禁**留「下個 session 補展示頁」「之後再搜使用處」。

---

## 機器擋得住什麼、擋不住什麼

閘 `scripts/token-creation-invariant.mjs`(檢查清單在檔頭,不在這裡重述)擋得住:放錯地方、沒登記、新名字靠開頭混過去、規格沒寫、密度覆寫漏回復、樣式檔沒進彙總檔、產品或元件讀了不該讀的。已知的舊缺漏(規格找不到的名字、元件直接讀原料的地方、漏回復)列在分類表 `known.*`,**只能變短**。
C5 只看「名字有沒有出現在回復段」;「區塊裡的值真的等於整頁該密度」由 `scripts/test-density-subtree-token-parity.mjs` 在瀏覽器裡實算(用 `var()` 組出來的值 C5 看不到)。

擋不住、靠審查的人看分類表那一句 `why`:
- **這顆值的主人是誰、該歸哪一類** —— 設計判斷。機器只確認「有登記、登記不互相打架」。
- **該不該開這顆 token**(兩個值現在相等是巧合還是必須同步) —— 閘只抓得到最明顯的一種:只有主人自己在讀、又不切換(C9;「元件的值」不分新舊全查,主人 = 分類表該列 `home` 與 `target` 的資料夾;其他類別只查新名字,既有的原料 / 共用刻度以一組為單位判)。兩個元件各讀一次、其實不必同步的值,閘看不出來。
- **元件程式裡寫死一個本來該用共用刻度的數字**、字串拼出來的名字(`var(--color-${hue}-1)`) —— 閘看不到。
- **設計系統以外的產品 repo** —— 同一條檢查要由產品 repo 自己跑。

世界級同樣這樣分工:Atlassian 把「要不要新增一個可重用的 token」交給人先判斷(「Designing whether a new reusable token should exist before implementation → use `add-frontend-offering` first.」,[來源](https://unpkg.com/@atlaskit/tokens@20.11.0/.agents/skills/add-design-tokens/SKILL.md) 第 29–30 行),工具只守公開名單(「the allow-list the Babel plugin validates `token('…')` calls against」,同檔第 56–57 行);Carbon 用測試比對公開介面快照(「compare the generated output with snapshots of the public API」,[來源](https://github.com/carbon-design-system/carbon/blob/f5bdc21a0933baca91875e618f07141ff708cbe7/packages/themes/tokens/README.md) 第 211 行)。

---

## 世界級對照

- **三類或兩類,各家約各半**:三層(有元件層)Material、Ant、Spectrum、Primer;兩層 Atlassian、Polaris、Fluent、Carbon(Carbon 的元件層只有顏色)。選三類的理由:本 DS 已經有一批事實上屬於單一元件的值,兩層放不下(AI 推導)。
  - Primer:「The design token naming convention will be based on three categories: base, component/pattern, functional.」([來源](https://github.com/primer/primitives/blob/47736486bf67b2a14ba1ada61fa0f57af29bb875/contributor-docs/adrs/adr-006-naming-design-tokens.md) 第 20 行)
  - Material:「Each component token maps to a system token, which has a concrete reference value.」([來源](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/docs/theming/README.md) 第 33–34 行)
- **元件的值跟著元件放**:Carbon「Component tokens start with the name of their component and live in the file named after it」([來源](https://github.com/carbon-design-system/carbon/blob/f5bdc21a0933baca91875e618f07141ff708cbe7/packages/themes/tokens/README.md) 第 44–45 行)。
- **元件的值只給主人用**:Spectrum「Component-specific tokens are intentionally limited. Use them only for their intended component or implementation and avoid reusing them as general-purpose design decisions.」([來源](https://github.com/adobe/spectrum-design-data/blob/dcc5be988f302a727233ec45c88c0bca16e899ed/docs/s2-docs/foundations/design-data/design-tokens.md) 第 163 行)。本 DS 允許設計系統內的元件互讀來對齊(跟 Primer「只用在元件樣式內」同一邊),比 Carbon 寬。
- **共用刻度是主要入口**:Spectrum「Semantic tokens are the primary way consumers interact with Spectrum design tokens.」(同上檔第 95 行)。
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
| 產品覆寫元件的值來「設定」元件 | 走元件參數(user 拍板 token 第 4 題「4甲」) |

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

- `command.spec.md`
