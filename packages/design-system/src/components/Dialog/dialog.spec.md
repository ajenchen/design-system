---
component: Dialog
family: composite
variants: {}
sizes:
  sm: { when: "寬度檔位 400px —— 只有一件事:一兩句話(確認、刪除確認、告知、離開不儲存)或一個控制項(改名輸入框、一個選單)" }
  md: { when: "寬度檔位 480px ★ 預設 —— 幾件事疊成一欄:多欄位表單、說明加欄位、成員清單;不確定時用它" }
  lg: { when: "寬度檔位 640px —— 有一件東西本身就寬:表格、拖放上傳區、圖片預覽;只有文字時不用" }
  xl: { when: "寬度檔位 960px —— 兩欄並排(主內容 + 資訊欄)或 lg 放不下的表格;建議上限" }
traits:
  - isOverlay
benchmark:
  - Radix Dialog primitive: github.com/radix-ui/primitives/tree/main/packages/react/dialog
  - Ant Design Modal: github.com/ant-design/ant-design/tree/master/components/modal
  - MUI Dialog: github.com/mui/material-ui/tree/master/packages/mui-material/src/Dialog
  - Polaris Modal: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Modal
  - Adobe Spectrum 2 Dialog 寬度檔位: github.com/adobe/react-spectrum/blob/%40react-spectrum/s2%401.8.2/packages/%40react-spectrum/s2/src/Modal.tsx#L111-L114
  - GitHub Primer Dialog: github.com/primer/react/blob/@primer/react@38.46.0/packages/react/src/Dialog/Dialog.tsx#L130
  - IBM Carbon Modal 用途: github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/modal/usage.mdx#L164-L186
  - Atlassian Modal dialog 寬度: unpkg.com/@atlaskit/modal-dialog@17.2.5/dist/es2019/internal/width.js
---


# Dialog 設計原則

## 定位

Modal 對話框，基於 Radix Dialog。用於**需要使用者注意力、阻斷背景互動**的操作流程（建立、編輯、確認）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **需要專注的操作流程**：建立 / 編輯複雜表單、多步驟精靈、付款結帳
- **破壞性動作確認**：刪除、離開不儲存、登出多個裝置
- **短暫但重要的資訊**：首次引導、重要公告必須被看到才能繼續
- **需要阻斷背景互動的脈絡**：使用者必須完成或取消此流程才能回到頁面

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 短暫的操作回饋（成功 / 失敗訊息）| `Toast` | Dialog 會阻斷流程，Toast 非阻斷 |
| 持久的頁面內通知 | `Alert` | Alert 是 inline 嵌入，不浮起 |
| 側邊操作面板（不需完全阻斷）| `Sheet` | Sheet 從側邊滑入，視覺更輕、常搭配列表 detail |
| 浮動的精簡選單 | `DropdownMenu` / `Popover` | Dialog 是 modal,DropdownMenu/Popover 是輕量浮層 |
| Hover 才出現的輔助資訊 | `Tooltip` / `HoverCard` | Dialog 需要明確觸發,hover 不該是 modal 觸發 |

---

## 結構

```
DialogContent (fixed, centered)
├── DialogHeader(消費 SurfaceHeader)
│   ├── DialogTitle
│   └── Close button(永遠存在,規格見「關閉按鈕」)
├── DialogBody(scrollable——ScrollArea canonical,見下)
└── DialogFooter(消費 SurfaceFooter)
    └── Action buttons
```

**Padding SSOT**：Header / Body / Footer 的 padding + 分隔線由 `patterns/overlay-surface/overlay-surface.spec.md` own——Dialog 與 Popover 共用同一套 primitive，避免 token 漂移。Dialog 特有行為:Header 的 Close 按鈕;Body 用 `<ScrollArea>` wrap(viewport-fill 專用,SSOT 見 overlay-surface.spec.md 「Body overflow canonical」節 + `components/ScrollArea/scroll-area.spec.md`)。

## Density(2026-06-16 定論:全繼承 page,不鎖)

Dialog **不自設任何 density attribute**,layout-space + ui-size 全繼承 page。效果:md page → body `px-loose`=16 / header `py-tight`=12(header 48);lg page → 24 / 16(header 56),隨 page。

**為何不鎖(撤回本 session 一度加的 `data-layout-space="lg"`)**:本 `density.spec` 第 10 行親自定義 layout-space 管「dialog body padding」—— Dialog 若鎖死 layout-space,等於 override 我們自家 dial 對它點名要管的對象失效 = **自相矛盾**。有同類 padding-density dial 的 AWS Cloudscape,compact 模式明文「propagate the reduced spacing scale to all components, in all view types」,只對說明性元件(help panel / alert / flashbar / 表單驗證訊息)與小目標(select 下拉等)不完全套用,modal 不在例外內([content density](https://cloudscape.design/foundation/visual-foundation/content-density/),2026-11-05 讀回)—— 也就是讓 **modal 跟 page dial 走**,不把 modal 釘固定 tier。固定 24 只是我方 lg 那一檔。

**「modal 要寬鬆呼吸」怎麼滿足**:lg 產品自動拿 24;md 產品本就要緊湊(資訊密集),16 仍留得出內容與外框之間的呼吸空間,是本 DS modal 內距的下限。**「button 不撐高 header」**由 ui-size 繼承 page 解決(button = page sm),與 layout-space 鎖不鎖無關 → 故不需鎖。

**Header 高度**:padding-based = title line-box 24 + `py-tight`×2 → md 48 / lg 56,**隨 page tier**(= `--chrome-header-height` 同 tier 對齊)。

**對照本 DS 兩檔**:modal 內距 24 = lg、16 = md 下限,都由 layout-space 繼承 page dial 決定,不另釘固定 tier。

## Layout

- **水平 padding**：`px-[var(--layout-space-loose)]`（header / body / footer 統一）
- **Header / Footer 垂直 padding**：`py-[var(--layout-space-tight)]`
- **Body 垂直 padding**:由容器自己給,本規格不寫值 —— DialogBody 宣告 `data-layout-body="fill"`(對話框擋住頁面 = `../../tokens/layoutSpace/layoutSpace.spec.md` 規則 4 第 1 列那種容器):上 = `tight`;底依最後一個東西,值只住規則 4 表(本規格不重述;有沒有 footer 都是第 1 列 —— 沒有 footer 的對話框維持 48 = user 2026-11-27 T7 甲,出處在規則 4 表後;有完整外框的表格靠邊緣標記 `data-layout-region="bounded"`,DataTable 已帶;實作 `layoutSpace.css`)。2026-11-17 前這一行寫死 `pb-[var(--layout-space-bottom)]`,「大檔位:對話框裡放表格」的表格底下因此是 48、照規則應 16 / 24【AI 推導 2026-11-17:照規則 4 既有的表落地,不是新規則】

## Viewport Inset

Modal 與 viewport 四邊保持 `--layout-space-viewport-inset`(48px)最小間距。**這顆 token 是 2026-09-11 從
`--layout-space-bottom` 拆出來的**:後者的語意是「結論留白:一塊 body 的最後一個 element(含按鈕)→ body 底」(`layoutSpace.spec.md` Token 表),
跟「浮層外殼到視窗邊」是兩個概念,值剛好都是 48 而已。耦合著會讓任何人調結論留白時,意外改掉全站 Dialog 的高度**與最大寬度**。

寬與高都吃同一個 inset:`min(寬度檔位或 width 數字, 所在區塊寬 - inset*2)` / `min(min(100svh, 所在區塊高) - inset*2, maxHeight)`。
**所在區塊**平常是視窗;傳 `portalContainer`(帶 transform 的舞台)時就是那個舞台,四邊 48 以舞台量。2026-11-15 前公式寫死 `100vw` / `100svh`,
外框的 `w-full` 卻以所在區塊算 —— 放進比視窗窄或矮的並存舞台時四邊少於 48、超出部分被舞台裁掉(AI 推導,A18 第三輪評審由程式碼推出);
改成以所在區塊計算(工程修補,同族寬、高一起修),沒傳 `portalContainer` 時所在區塊就是視窗,畫面不變。
閘 `scripts/dialog-width-invariant.mjs` W3(600 寬、700 高的舞台裡 lg / xl 都是 504、四邊至少 48、`fill` 高 = 舞台高 − 96;對照組改回 `100vw` / `100svh` 必紅)。

**其他消費者**:AppShell 的浮層「另一側至少留」的距離(user 2026-10-14 規格 U:55「浮層也可以拖曳調寬，另一側至少保留 48px」)—— AI agent 浮層的左側(2026-09-16 起;2026-10-14 前是「蓋板寬 = 容器 − inset」撐滿,現在寬度照紀錄、inset 是下限)與 Menu 浮層的右側;規則住 `../AppShell/app-shell.spec.md`「版面規則」§9。本 token 的 owner 仍是本段;改值時三個消費者一起變。

## 高度

### 最大高度(上限)—— 兩種模式共用同一條公式

```
可用高 = min(100svh, 所在區塊高) - inset*2      // 所在區塊 = 視窗,或 portalContainer 舞台(見「Viewport Inset」)
上限   = maxHeight 有值 ? min(可用高, maxHeight) : 可用高
```

- **恆小於視窗高**,所以 header 與 footer 在絕大多數情況都露得出來(超長內容由 body 自己捲,外框不動)。
- **consumer 只能往更矮調**:`maxHeight` 傳比視窗大的值也會被 `min()` 夾住。型別 `string | number`
  (number 視為 px;string 才寫得出 `60svh` / `calc(100svh - 120px)`),照 DS 上下限參數的寫法(`../../../ds-canonical/references/props-naming.md`「尺寸參數」)。
  與 `Popover` / `HoverCard` / `DropdownMenu` 的 `maxHeight` 是同一個契約、同一支公式(「可選更低上限」)。**程式只有一份**:上面兩行的可用高與上限公式住 `../../tokens/elevation/overlay-geometry.ts`(`MODAL_AVAILABLE_HEIGHT` + `capHeight`,2026-11-24 從 `dialog.tsx` 搬過去),全部浮層的高度上限總覽在 `../../tokens/elevation/elevation.spec.md`「浮層高度上限」;本段仍是 Dialog 高度規則的 owner。
- **用 `svh` 不用 `vh`**:行動裝置網址列收合時 `100vh` 大於實際可視高度,底部主要動作鈕會被切掉。
  DS 其他填滿視窗的外框已是這個選擇(`app-shell.tsx` 的 `h-svh`、`sidebar.tsx` 的 `100svh`)。桌機兩者等值。

### 高度軸(怎麼長)—— 正交於上限

| `height` | 行為 | 什麼時候用 |
|---|---|---|
| **`'fill'`(預設)** | 高度 = 上限。內容多寡不改變外框幾何,body 擁有捲動 | 開啟到關閉期間**內容高度會變**:異步載入、可展開區塊、可增減的清單 |
| **`'hug'`** | 高度隨內容長高,碰到上限才由 body 捲動 | 開啟到關閉期間**內容高度不會變**:確認框、短表單、固定文案 |

**判準是時間維度,不是當下看起來有幾行**:從開啟到關閉,內容高度會不會因為使用者的操作與互動而改變?
會 → `fill`;不會 → `hug`。理由:隨內容長高的浮層一旦內容變高變矮,整個對話框會上下跳動,體驗很差 ——
先把可用高度穩定下來、讓 body 自己捲,外框就不動了。**現在預期不會變、但未來會加入異步 section 的,選 `fill`。**

舊名 `autoHeight?: boolean`(等同 `height="hug"`)2026-09 停用、2026-11-15 移除,不留舊名(user 2026-11-15 原話「我認為還是 beta 的狀況下都不要再顧及所有向後相容的部分」;0.x 相容政策 = `ds-canonical/references/props-naming.md`「相容政策」)。升版對照:`autoHeight` → `height="hug"`、`autoHeight={cond}` → `height={cond ? 'hug' : 'fill'}`。DS 內部 2026-10-20 已遷完 30 處用法(27 處在 DS 原始碼、3 處在閘的夾具);閘 `scripts/overlay-story-contract-invariant.mjs` S3 擋文件與範例把它寫回來(型別已不收)。

**世界級對照**:Material Web(`max-height: min(560px, calc(100% - 48px)); height: fit-content`,[_dialog.scss#L39-L44](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/dialog/internal/_dialog.scss#L39-L44))、
Atlassian(`if (!input) return 'auto'`,[dialog-height.js#L1-L3](https://unpkg.com/@atlaskit/modal-dialog@17.2.5/dist/es2019/internal/components/dialog-height.js))、Polaris(只宣告 `max-height: calc(100vh - …)`,[Dialog.module.css#L37](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/Modal/components/Dialog/Dialog.module.css#L37))、Carbon(size 綁 48/72/84/96% 上限,[_modal.scss#L104](https://github.com/carbon-design-system/carbon/blob/593de4deda2d96f47f71cdfc9b30d07bd1302304/packages/styles/scss/components/modal/_modal.scss#L104) 與 #L208 / #L236 / #L259)、
Ant Design(不宣告高度,超出時由外層 `-wrap` 的 `overflow: 'auto'` 捲動,[style/index.ts#L174-L177](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/modal/style/index.ts#L174-L177))—— 五家第一方原始碼**預設都是「隨內容」**,Material / Polaris / Carbon 另以視窗為上限(2026-11-16 逐家重讀原始碼後更正:原句寫五家都以視窗為上限,Atlassian 那一行只回 `auto`、Ant 是捲外層)。
本 DS 預設選 `fill` 是刻意偏離:DS 的主場景是內容會變的產品 dialog,穩定外框優先;
需要世界級預設行為的場景顯式傳 `height="hug"`。

**閘**:`scripts/dialog-height-invariant.mjs` —— H1 兩種模式回報同一個上限、H2 上限 = 視窗 − inset×2 且小於視窗且不溢出、
H5(2026-09-12 新增)在 240px 視窗下掃**每一支** dialog / sheet story,驗「沒有後代畫到容器外」+「捲到底後
最後一個互動元素完整可見」。H5 有**自己的**對照組 `--selftest-h5`(既有 `--selftest` 會拿掉高度上限、
把 dialog 變成 99904px 高,那樣誰都不會溢出,H5 的條件永遠觸發不了);`--selftest-h5` 還原
容器 overflow 與 Tabs 的 flex,實測精準抓到 `展示--with-tabs-in-header`。
H1-H4 當時全綠卻沒攔下這個 bug,因為它們只測 dialog **自己**的高度,沒測「dialog 與 body 之間夾了別的 wrapper」。
H3 `hug` 真的隨內容長高而 `fill` 不隨內容變、H4 `maxHeight` 只能更矮。
對照組把上限拿掉必須紅(實測 fill 變 99904px、溢出視窗)。

## 寬度檔位

**依據(user 原話,逐字)**:
- 2026-11-11 回覆決策頁 r9 的「對話框寬:訂檔位」(整句見 `../../../ds-canonical/references/props-naming.md`「尺寸參數」)。
- A18 討論:「我覺得還是有些那種超大內容的對話框是在那種小視窗會近乎滿版，但是當螢幕太大時仍想要確保其寬度不會大到內容變得難以閱讀…我是覺得不要限制上限但可能有一個建議的上限吧? 換言之可能真的要做也只是有這樣子的一個檔位而已？」
- 2026-11-15 對 A18 成品頁 v5:「其他的部分照你建議我沒有意見」。所以下面的四檔數值、用途句、選檔規則與自訂寬政策是 **AI 建議、user 採納**,不是 user 自己擬的;同一則撤掉的「大對話框連續文字限寬」見本節「不加文字行寬上限」。

**寫法**:`<DialogContent width="sm" | "md" | "lg" | "xl" | 數字>`,預設 `"md"`。名字照 user「尺寸:甲」(寬度一律叫 `width`);檔名也放在 `width`、不另開 `size`,是 A18 成品頁 v5 第二題的甲案(AI 擬、user 採納,見 props-naming.md「尺寸參數」第 4 條)。不收 `"fill"` / `"hug"`(props-naming.md「每個元件只列自己支援的值」)。檔位表只住 `dialog.tsx` 的 `DIALOG_WIDTH_TIERS` 與下面這張表。

| 檔 | 寬(也是上限) | 內容寬 md / lg 密度【AI 推導】 | 放什麼 |
|---|---|---|---|
| `sm` | 400 | 368 / 352 | **只有一件事**:一兩句話(確認、刪除確認、告知、離開不儲存),或一個控制項(改名輸入框、一個選單)。一份勾選清單也算一個控制項【AI 推導 2026-11-15,依「一個選單」判讀;成品頁核准的表上沒有這一項】 |
| `md` ★ 預設 | 480 | 448 / 432 | **幾件事疊成一欄**:多欄位表單、說明加欄位、成員清單。不確定時用它 |
| `lg` | 640 | 608 / 592 | **有一件東西本身就寬**:表格、拖放上傳區、圖片預覽。只有文字時不用 |
| `xl` | 960 | 928 / 912 | **兩欄並排**(主內容 + 資訊欄,或左分類導覽 + 右內容的設定類;組合都照 `../../patterns/overlay-surface/overlay-surface.spec.md`「兩欄 dialog 組合」),或 lg 放不下的表格。這是**建議上限** |

寬度不隨密度變;內距隨密度變(本檔「Density」:md 16 / lg 24),所以內容寬列兩組。

**選檔規則**:一件 → `sm`;多件疊成一欄 → `md`;有一件很寬 → `lg`;兩欄 → `xl`。**內容不得橫向捲動,放不下往上一檔**。
- 確認框沒有獨立元件,走 `width="sm"`;確認文字超過兩句或帶欄位時升 `md`。疊在別的對話框上的確認框(「禁止事項」第一條收窄後允許的那種)也用 `sm`。
- `xl` 不放長流程:超過 3 步或接近全螢幕的流程照「禁止事項」改頁面或 Sheet。
- 範例:展示頁「大檔位:對話框裡放表格」「超大檔位:兩欄記錄詳情」「超大檔位:兩欄個人設定」;確認框、一欄表單散在展示與設計原則頁。設定對話框(左分類導覽 + 右內容,標題列與 × 跨全寬)的版面規則不在本檔:見 `../../patterns/overlay-surface/overlay-surface.spec.md`「兩欄 dialog 組合 canonical」的「左導覽 + 右內容」。

**最大寬、四邊 48、沒有下限**:檔位與數字都是**最大寬** —— 實際寬 = min(檔位或數字, 所在區塊寬 − 2 × `--layout-space-viewport-inset`(48))。窄了往內縮、四邊至少 48;**沒有下限**(過小值不擋,內容溢出走 body 捲動,由 consumer 自負)。所在區塊是誰、高度怎麼吃同一條留白,見「Viewport Inset」。各檔開始內縮的視窗寬:sm < 496、md < 576、lg < 736、xl < 1056;1024 寬的筆電上 xl = 928(近乎滿版),視窗 ≥ 1056 時停在 960;375 寬時每一檔都是 279【AI 推導 2026-11-15,公式換算】。窄螢幕照 DS 既有的四邊 48,不另搬 90vw、也不依斷點換形態(`../AppShell/app-shell.spec.md` 不依固定視窗寬切換形態)。

**自訂寬(數字)**:`width={數字}`(px)給檔位不適用的產品特例 —— **不設上限、不擋、不警告**,只受上面那條留白夾住。`xl` 960 是建議上限:選了 `xl` 才有這個上限,不拿它去夾自訂寬。**先用檔位;比超大還大的內容,先考慮改成頁面或側板**。依據:
- Primer xlarge:「Before using an extra large Dialog, consider whether or not the content would be more appropriate for a new page.」([primer.style/product/components/dialog](https://primer.style/product/components/dialog/),2026-11-15 讀)
- Carbon:「If the large modal height is still not enough space then a full page might be needed instead.」([carbon-website usage.mdx#L180-L186](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/modal/usage.mdx#L180-L186);「a full page might be needed instead」即此句)

DS 自己的元件、範例、規格只寫檔位名,不寫數字(閘 `scripts/sizing-props-invariant.mjs` R5);閘腳本裡量行為的測試對話框例外(寫數字,寬度不跟著檔位表變,免得動到點擊座標)。

**不提供 `"fill"`(撐滿)與 `"hug"`(跟內容)**【AI 推導 2026-11-15】:撐滿與上面 user 那句「螢幕太大時仍想要確保其寬度不會大到內容變得難以閱讀」相反,邊到邊看檔案已有 FileViewer(`../FileViewer/file-viewer.spec.md`);跟內容的外框會隨內容左右跳,與 `height` 預設 `fill` 是同一個理由(「高度軸」)。

**舊名 `maxWidth`(已移除)**:2026-11-15 前寬度參數叫 `maxWidth`(預設 512px,沒有寫過理由),但它的行為就是「寬」(外框 `w-full` + 這個上限),名字與行為不符(props-naming.md「尺寸參數」第 3 條)。改名後不留舊名(同條第 5 條,0.x 相容政策)。升版對照:`maxWidth={N}`(number)→ `width={N}`,或照下方選檔規則換成檔名;`maxWidth="…"`(CSS 字串)沒有對應,改成數字或檔名。閘 `sizing-props-invariant.mjs` R1 / R2 擋舊名寫回 DS。**預設 512 → 480**:吃預設的對話框(DS 內含 `CommandDialog`)窄 32px;明寫寬度的產品畫面不變。

**不加文字行寬上限**:user 2026-11-15 撤回「大對話框連續文字限寬」(逐字):「我覺得這句很怪，在沒有完整配套之下，你確定這個不是在畫蛇添足？？我認為這麼大的modal其中的內容要如何排版就是消費者基於layout space的原則去進行調整吧？…那為何還要多這條規則？確定真的沒有雞婆？？？」—— Dialog 不管框內文字的行寬;大檔、超大檔與自訂寬裡怎麼排,由消費者依 `../../tokens/layoutSpace/layoutSpace.spec.md` 的規則處理。

**世界級對照**(只列 A18 第三輪評審查核過的原文;各家數字換成本 DS 的內距 / 字級都是【AI 推導】):

| 來源 | 檔位(px) | 用途原文 |
|---|---|---|
| Adobe Spectrum 2([Modal.tsx#L111-L114](https://github.com/adobe/react-spectrum/blob/%40react-spectrum/s2%401.8.2/packages/%40react-spectrum/s2/src/Modal.tsx#L111-L114)) | S 400 / M 480 預設 / L 640 / XL 960 | 「Small: Best for a single component or a few lines of text.」「Medium: Ideal for several components or a short paragraph. This is the default size.」「Large: Designed for larger content such as drop zones, images, tables, or hero image layouts.」([standard-dialog.md#L23](https://github.com/adobe/spectrum-design-data/blob/%40adobe/spectrum-tokens%4015.7.0/docs/s2-docs/web/rsp/components/standard-dialog.md#L23));本 DS 不搬它的 90vw、改收數字寬 |
| IBM Carbon([usage.mdx#L168-L170](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/modal/usage.mdx#L168-L170)) | 視窗百分比 + 欄格線 | 「Modals with brief text should be extra small or small to avoid long single lines」「for complex components, like a data table, the default or large modal is more suitable」;「Modal content should never scroll horizontally; instead, use a larger size modal」([#L286-L287](https://github.com/carbon-design-system/carbon-website/blob/5e9cd1da43c32d3d3b991dc947b427f674da61a8/src/pages/components/modal/usage.mdx#L286-L287)) |
| Atlassian modal dialog([width.js](https://unpkg.com/@atlaskit/modal-dialog@17.2.5/dist/es2019/internal/width.js) L4-L7) | small 400 / medium 600 / large 800 / x-large 968 | 「We recommend using named size options to specify modal width… If you provide a number instead, the width is set to that number in pixels.」([examples](https://atlassian.design/components/modal-dialog/examples),2026-11-15 讀)—— 檔位推薦 + 收數字,與本節自訂寬同形 |
| GitHub Primer([Dialog.tsx#L130](https://github.com/primer/react/blob/@primer/react@38.46.0/packages/react/src/Dialog/Dialog.tsx#L130)) | 檔位 + 數字 | 「Also accepts any valid CSS width value」 |
| Shopify Polaris([Dialog.module.css#L67-L81](https://github.com/Shopify/polaris/blob/%40shopify/polaris%4013.9.5/polaris-react/src/components/Modal/components/Dialog/Dialog.module.css#L67-L81)) | small 380 / 預設 620 / large 980 | —(不收自訂寬) |
| Ant Design([ConfirmDialog.tsx#L235](https://github.com/ant-design/ant-design/blob/6.7.0/components/modal/ConfirmDialog.tsx#L235)) | 確認框 416(預設 520) | 確認框比預設窄,與本 DS「確認框 sm」同向 |

各家最小檔集中在 380–416、有封頂的最大檔集中在 960–980;本 DS 四檔都是 80 的倍數,md : lg : xl = 3 : 4 : 6,xl 扣掉兩側內距正好是兩個 md 的內容寬加一組內距(兩欄各自是一個 md)【AI 推導 2026-11-15】—— 數字對得上而已,不拿來當理由。

**閘**:`scripts/dialog-width-invariant.mjs`(夾具 `scripts/test-fixtures/dialog-width/fixture.tsx`):W1 1440×900 量到 400 / 480 / 640 / 960、不傳 = 480、數字與舊名照給的寬、兩個都傳時 `width` 勝;W2 視窗 700 寬時 lg、xl 都是 604;W3 600×700 的 `portalContainer` 舞台裡 lg、xl 都是 504、四邊至少 48、`fill` 高 = 舞台高 − 96;`--selftest` 把檔位表改壞、把寬改回 `100vw`、把高改回 `100svh`,三種各自必紅。

## 父層契約

**父層契約(2026-09-12 補,原本漏了)**:DialogContent 必須是 `flex flex-col` + `max-h` + **`overflow-hidden min-h-0`**。
這不是新規定 —— `patterns/overlay-surface/overlay-surface.tsx:173-175` 逐字寫著「parent(PopoverContent /
HoverCardContent / Dialog / Sheet)是 flex flex-col + max-h + overflow-hidden」,Popover 與 HoverCard 一直有,
**Dialog 與 Sheet 漏了**(user 2026-09-12 截圖:視窗變矮時 dialog body 內容直接畫到圓角容器外面)。

**中間 wrapper 也要能收縮**:上面那條只保證「不畫到外面」;要讓「內容溢出走 body 捲動」成立,
DialogContent 到 DialogBody 之間的**每一層**都必須是可收縮的 flex column。實際踩到的是 `<Tabs>` ——
Radix Tabs Root 是裸 `display: block` + `min-height: auto`,夾在中間時整包內容原樣頂出容器
(實測 204px 的 dialog 裡 Tabs Root 撐到 271px)。修法是讓 **Tabs Root 自己**成為
`flex min-h-0 data-[orientation=horizontal]:flex-col`(`tabs.tsx`),consumer 不需要背咒語;
已逐 story 比對 23 支含 Tabs 的畫面幾何 Δ=0。

(2026-11-15 前本節與寬度同在「maxWidth」節之下;寬度的邊界 —— 受 inset 夾住、無下限 —— 搬到「寬度檔位」。)

## 關閉按鈕

> **跨家族 SSOT pointer**:DialogHeader 屬 **Padding-based overlay header 家族**;border / padding / dismiss size / tabsSlot(tabs 經 tabsSlot 進 header 時 border auto-suppress)的跨家族視覺契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。本節僅 codify Dialog 特有 close X size + chrome-unbounded rationale。

永遠存在於 DialogHeader 右側。使用 `<Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />`(讀屏名稱可經 `I18nProvider` 的 `dialog.close` 換字,`../../lib/i18n/README.md`「Fallback chain」),不可移除——使用者永遠需要明確的關閉手段。整個對話框只有這一顆:兩欄對話框右欄的欄內標頭沒有 ×(本檔「欄內標頭(DialogPaneHeader)」)。

**Size canonical(v5 chrome-unbounded)**:Button native size **sm**(隨 page density:28 md / 32 lg),命中區亦同(命中 ≡ 可視,owner = `ds-canonical/references/hit-area-canonical.md`;2026-09-24 把原文的「touch target」正名為命中區 —— 本 DS 以滑鼠指標的精度為前提,尺寸不以觸控門檻推導)。SurfaceHeader 的 `[data-unbounded]` CSS rule 自動對 text variant / dismiss 套負 my → **layout 佔位 = title line-box**(slot 衍生自 `--font-body-lg-size`×1.5=24,見 `overlay-surface.spec.md` slot 段)。效果:
- Header 只有 title + close X → max layout = 24 → header = 24 + 2×`py-tight`(隨 page:md 12 / lg 16)= **48 md / 56 lg**(= `--chrome-header-height` 同 tier 對齊)✓
- Header 塞 bounded primary(無 `data-unbounded`)→ header 自然長高

**Canonical 來源**:Dialog 是 overlay chrome，corner close X 屬 action group region，必用 Button(非 Inline Action / 非自刻 button)。詳見 `patterns/element-anatomy/inline-action.spec.md`「Dismiss canonical — X close only」+ `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」。

### Header actions slot(2026-07-08)

Header 級操作(記錄 prev / next 導覽、header 級溢出選單 ⋮ 等「作用於整個 dialog 內容」的操作)走 `<DialogHeader actions={…}>`。

- **何時用**:操作對象是 dialog 承載的記錄本身(切換上下筆、複製連結、更多選單)。欄位級操作仍歸 body;confirm / cancel 歸 footer。
- **排法、分隔線、按鈕形態與禁令**:Dialog / Sheet / Popover 共用 SurfaceHeader 的右側按鈕位,規則住 `../../patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」右側按鈕位,本處不重述(2026-11-10 自本節搬過去;原 2026-07-08 WM 詳情 header 錨例:consumer 自刻 cluster = 漏分隔線 / 幾何漂移)。

## Title

`text-body-lg font-medium truncate`——單行截斷，不換行；截斷時 hover 顯 tooltip 補完整標題（僅實際截斷才顯——rule owner `components/Tooltip/tooltip.spec.md`「截斷文字 → 用 tooltip 顯示完整內容」；實作消費 `patterns/element-anatomy/truncated-text.spec.md` `<TruncatedText>`）。

**Header 可成長**:標題下方可放 `<DialogDescription>`(說明);小標 / 說明的字樣、間距、何時用與 × 的位置住 `patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」標題區,本處不重述。Consumer 傳 title + description 時 header 自然長高(這也是為何 Dialog / Sheet / Popover 的 SurfaceHeader 刻意 **padding-based 而非 fixed-h** — 宣告 chrome 可成長)。詳見 `patterns/overlay-surface/overlay-surface.spec.md`「為什麼 SurfaceHeader 是 padding-based」+ `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」節(含「2 種 pattern 對照」)。

## Footer 按鈕

預設 size `md`，與 Field 系統表單元件尺寸一致。按鈕靠右對齊（`justify-end`），間距 `gap-2`。

## 視覺

- **Overlay**：`bg-overlay`
- **Shadow**：`elevation-200`（浮層級）
- **圓角**：`rounded-lg`
- **背景**：`bg-surface-raised`
- **邊框**：`border-border`
- **分隔線**（header / footer）：`border-divider`

## 動畫

**Canonical = 從中心淡入 + 輕微縮放,不位移**(2026-09-09 定;anchor:user 抓到 dialog 從左上角飛到中間)。

| 階段 | 幾何 | 時長 / 曲線(全部消費 `tokens/motion/motion.spec.md`「進出場動畫 token」,經 `overlay-motion.ts` 的 `surfaceMotion`) |
|---|---|---|
| 進場 | `fade-in-0` + `zoom-in-95`(opacity 0→1、scale 0.95→1,transform-origin 中心) | `--motion-duration-surface` 250ms / `--motion-easing-enter` |
| 離場 | `fade-out-0` + `zoom-out-95` | `--motion-duration-surface` 250ms / `--motion-easing-exit` |
| Overlay | 只 fade | 同上 |
| 收尾 | 依 `../../tokens/motion/motion.spec.md:135`「怎麼收尾 —— 關閉後的樣子由 CSS 保持」;實作:surfaceMotion 內建 `holdClosedEndState`,關閉後保持最後一格(透明 / 縮小)直到卸載 | — |
| `prefers-reduced-motion` | 依 `../../tokens/motion/motion.spec.md:133`「何時播 —— 只在 `motion-safe:` 底下宣告動畫」;實作:surfaceMotion 同一份(2026-10-07 前寫的 `motion-reduce:animate-none` 權重輸給 `data-[state=…]:animate-*`,從沒生效,待辦總帳 T7) | — |

**為何不用 slide(置中位移)**:置中靠 `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`。shadcn v3 時代 DialogContent 另掛 `slide-in-from-left-1/2 slide-in-from-top-[48%]`,那是因為 Tailwind v3 的 `-translate-x-1/2` 走 `transform`,會被 keyframe 的 `transform` 整個蓋掉,所以要在 keyframe 裡把置中位移再寫一次(v3 dialog 原始碼:<https://ui.shadcn.com/r/styles/new-york/dialog.json>)。Tailwind v4 的 `-translate-x-1/2` 改寫進獨立的 `translate` 屬性(<https://tailwindcss.com/docs/translate>,`translate: calc(1/2 * -100%) var(--tw-translate-y)`),不再被 keyframe 蓋掉;而 tw-animate-css 的 `@keyframes enter` 仍是 `transform: translate3d(var(--tw-enter-translate-x), var(--tw-enter-translate-y), 0) scale3d(…)`(`node_modules/tw-animate-css/dist/tw-animate.css`)。兩個位移相加 → 第一幀中心落在視窗中心**左 w/2、上 0.48h**(480×189 的確認框實測 −240px / −90.72px),看起來就是從左上角飛進來。shadcn v4 版本已把這兩組 class 拿掉(<https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx>:`translate-x-[-50%] translate-y-[-50%] … data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95`,無 slide)。

**世界級對照(2026-09-09 逐一開原始碼)**:

| 來源 | 進場幾何 | 位移 |
|---|---|---|
| shadcn v4 `dialog.tsx`(<https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx>) | `fade-in-0` + `zoom-in-95`,`duration-200` | 無 |
| Radix Themes `base-dialog.css`(<https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/_internal/base-dialog.css>) | `rt-dialog-content-show 200ms`:`opacity 0→1; transform: translateY(5px) scale(0.97) → scale(1)` | 5px(視覺上等同不位移) |
| Angular Material `dialog.scss`(<https://github.com/angular/components/blob/main/src/material/dialog/dialog.scss>) | `opacity 0→1; transform: scale(0.8) → none`,easing `cubic-bezier(0,0,0.2,1)` | 無 |
| MUI `Dialog.js`(<https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Dialog/Dialog.js>) | 預設 transition = `Fade`(只 opacity) | 無 |
| Material Web(M3)`animations.ts`(<https://github.com/material-components/material-web/blob/main/dialog/internal/animations.ts>) | scrim opacity 0→0.32、container height 35%→100% + 內容 fade | `translateY(-50px→0)`(M3 expressive 的例外,不採) |
| Apple HIG Modality / Alerts(<https://developer.apple.com/design/human-interface-guidelines/modality>) | alert 居中、疊在所有內容之上;無「從角落滑入」 | 無 |

主流四家(shadcn <https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx> / Radix Themes <https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/_internal/base-dialog.css> / Angular Material <https://github.com/angular/components/blob/main/src/material/dialog/dialog.scss> / MUI <https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Dialog/Dialog.js>)一致 = 中心淡入 + 縮放;唯 Material Web <https://github.com/material-components/material-web/blob/main/dialog/internal/animations.ts> 帶 50px 下落,屬 expressive 風格,與本 DS 企業級中性沉穩(`--motion-easing-enter` = Material standard-decelerate,見 `tokens/motion/motion.spec.md`)不合,不採。

**閘**:`scripts/dialog-coexistence-invariant.mjs`「進場第一幀」段 —— (S) 靜態禁 DS-wide 任何檔案同時出現 `slide-in-from-left-1/2` 類置中位移 class 與 `-translate-x-1/2` 置中;(M) 瀏覽器把進場動畫凍在 t=0(WAAPI seek)量 `[role=dialog]` 中心相對視窗中心偏移必 ≤ 1px;對照組把兩組 slide class 加回去必須紅。

## 狀態處理的職責邊界

Dialog 是容器，無整體 disabled / loading / empty 狀態——這些屬於內容層的責任：

| 狀態 | 處理方式 |
|------|---------|
| **Loading**(內容載入中) | Consumer 在 `DialogContent` 內渲染 Skeleton / CircularProgress,不是讓 Dialog 本身等待開啟 |
| **Empty**（如步驟 dialog 還沒資料）| Consumer 在 content 區用 `Empty` primitive |
| **Error**（操作失敗）| Consumer 在 content 區用 `Alert` |
| **Disabled**（整個 dialog）| N/A——dialog 要麼開著（可互動）要麼關著（不存在）。要鎖操作請 disable 內部個別 Button / Field |

**Dark mode**：由 semantic token（`bg-surface-raised` / `border-border`）自動切換，無自訂 palette。

**Density**:Dialog **全繼承 page**(layout-space + ui-size 皆不自鎖),見上「Density」段。

---

## 並存(`persistentElements`)

由來:代理原則 v14 條 A / B(`governance/planning/2026-09-06-agent-principles-v14.md`)—— 有自己 URL 的內容開著時,指定的常駐區域(代理面板、評論側欄)要**仍然可用**;它對宿主其餘部分仍然是 modal。

- **怎麼開**:`<Dialog persistentElements={() => [panelEl]}>`;Root 自動走 Radix `modal={false}`(否則 Radix 的 `hideOthers(content)` 會把常駐區域一起關掉),DS 再用 `inertOutside([content, ...persistent])` 把其餘一切設成 `inert`(`lib/overlay-coexistence.ts`;自己記帳、不與 Radix 的 `aria-hidden` 鎖共用計數,頁面上不屬於任何控件的播報區 `[aria-live]`(Toast 區、DS 播報)保留、照常念,與一般 modal 的 `hideOthers` 同一個目的;控件裡的播報區跟著被擋住的控件一起 inert —— 2026-10-07 根因見該檔說明)。
- **遮罩**:Radix 在非模態不畫 Overlay,DS 自己畫 `CoexistenceMask` —— `fixed inset-0` 的遮罩,用 `clip-path: path(evenodd)` 在每個常駐節點的位置挖洞;洞裡沒有遮罩像素也沒有命中區,常駐區域照常可見可點;洞外點下去是「外部點擊」→ 關閉(modal 語意)。洞的座標以遮罩自己的盒子為原點(遮罩可能被傳送進帶 transform 的畫布)。
- **層級**(2026-09-08 定):遮罩 `z-30` < 並存 modal 內容 `z-40` < AI agent 浮層 `z-[45]` < 一般 modal `z-50`(全 DS 層級表的一段;整張表 —— 含之上的 Toast `z-[60]`、Tooltip `z-[70]` —— 唯一住所 `../../tokens/elevation/elevation.spec.md`「疊放順序」)。沒有 URL 的確認框(不傳 persistentElements)維持一般 modal,蓋在常駐區域之上。AI agent 浮層自己的遮罩(同一支 `CoexistenceMask`,接住指標;點它關閉代理面板、並存 modal 留著,2026-09-17 裁示)也在 `z-30`,所以並存 modal 仍在它之上、面板之下;本遮罩算洞時把任何 `[data-coexistence-mask]` 當「遮罩不是洞」跳過,並存 modal 的外部點擊守衛把常駐殼子樹(含那張遮罩)視為不關;浮層左側留白處因此疊了兩張遮罩、暗兩次(刻意:那一帶既在 modal 外、也在面板外)。2026-10-14 起 AI agent 浮層的寬度照寬度紀錄(不再撐滿到只留 48),並存 modal 可能有一部分露在浮層左側:它在代理遮罩之上(`z-40` > `z-30`)但被抑制(`inert`),指標點在它上面會落到底下的代理遮罩 → 關閉 AI agent、modal 完整露出可操作,與點遮罩同一個結果(AI 推導:層級表與點遮罩關閉都是既有規則,這一格是兩者的交集)。反過來,一般 modal(`z-50`)開著時視窗變窄、AI agent 變成浮層:modal 畫在浮層上面、不是被蓋住的宿主,照樣可操作(AI 推導,2026-10-14 審查抓到原本被一起設成 `inert`;規則住 `../AgentPanel/agent-panel.spec.md`「疊在浮層上面的不是宿主」)。
- **框外事件的守衛**(2026-09-09 / 2026-09-10 定;`lib/overlay-coexistence.ts` `createPersistentGuard`,Dialog 與 FileViewer 共用同一份):非模態分支把「指標按在框外 / 焦點跑到框外」當關閉訊號,並存時三種目標**不算框外**:(1) 保留節點子樹;(2) 保留區**自己開出來的浮層**(入口鈕右鍵選單、面板裡的 Select / Popover;portal 到 body,用觸發器的 `aria-controls` / `aria-owns` 認回來)—— **含它關閉中的階段**(Radix 只在開著時寫 `aria-controls`,滑鼠點選單項後選單關閉中仍會收到一次焦點;認過的浮層 id 要記住,否則對話框會在選項執行的同時被關掉,2026-09-10 user 抓到);(3) 疊在上面的另一個 dialog —— 裝著它的外層 dialog 不算(`portalContainer` 指進另一個 dialog 裡的容器時,外層是宿主、不是疊在上面的確認框;2026-11-03 前「自己以外的任何一個 dialog」連宿主也算,點宿主空白不關)。閘:`scripts/agent-url-registry-demo-invariant.mjs` S11(右鍵選單留著)、S12(滑鼠點選單項:選項執行、對話框不關、遮罩仍在;鍵盤路徑為對照);外層 dialog 不算疊在上面 → `scripts/overlay-nested-dismiss-invariant.mjs` C 列。
- **Esc 與外部互動**:焦點在常駐區域內時的 Esc / pointer / focus 不算「框外」(`onPointerDownOutside` / `onFocusOutside` / `onInteractOutside` 對常駐節點 preventDefault),否則把焦點移進代理面板就會把對話框關掉。
- **捲動**(2026-09-29 定,待辦總帳 OE13;user 原話「第二題照你建議」—— 建議由 AI 提出、user 採納):並存時**舞台鎖捲動**(它對宿主其餘部分仍然是 modal),**常駐區自己的捲動照常**。機制 = Radix 同款 `RemoveScroll shards`:Content 是鎖的根(`as={Slot}`,不多一層 DOM)、常駐節點是 shards(鎖外但准捲,只擋它捲到底之後的溢出),其餘一切的 wheel / touchmove 被擋;疊上一般 modal 時由它的鎖(lockStack 最上層)接手。`react-remove-scroll` 因此列為 DS 直接相依(exact `2.7.2`,與 Radix 相依同版)。為什麼先前可捲:Radix 只在 modal 分支掛它 —— `radix-ui/primitives` `packages/react/dialog/src/dialog.tsx` `DialogOverlayImpl` 逐字 `<RemoveScroll as={Slot} allowPinchZoom shards={…contentRef…}>`,而 `DialogOverlay` 在 `context.modal` 為 false 時回 `null`(https://github.com/radix-ui/primitives/blob/main/packages/react/dialog/src/dialog.tsx);並存走 `modal={false}`,非模態分支沒有任何捲動處理。一手預設(四家都鎖):Radix Dialog.Root `modal` — Type `boolean`、Default `true`(https://www.radix-ui.com/primitives/docs/components/dialog);MUI Modal `disableScrollLock` — Type `bool`、Default `false`、「Disable the scroll lock behavior.」(https://mui.com/material-ui/api/modal/);Ant Design Modal `scrollLock` — 「Whether to lock body scroll when modal opens」、`boolean`、Default `true`、6.5.0(https://ant.design/components/modal);Chakra UI v2 Modal `blockScrollOnMount` — 「If `true`, scrolling will be disabled on the `body` when the modal opens.」、`boolean`、Default `true`(https://v2.chakra-ui.com/docs/components/modal/props)。`removeScrollBar` 保留預設 true,與一般 modal 同款(body 有捲軸才拿掉並補寬防跳版;並排佈局 body 沒捲軸 → 開關對話框常駐側欄 0px 位移,閘量)。**限制**:常駐區自己 portal 到 body 的非模態浮層不在 shards 裡,滾輪會被擋 —— 與已裝版本 Radix 在一般 modal 裡開 Popover 同款限制。閘:`scripts/dialog-coexist-scroll-lock-invariant.mjs`(舞台空白處合成滾輪 scrollTop 不變、常駐區清單會動、一般 modal 照舊鎖、開關無跳版;`--selftest` 在頁面上把鎖拆掉必紅)。
- **`portalContainer`**:Content 預設傳送到 body;story 的「模擬瀏覽器畫布」或產品的嵌入式畫布可傳一個帶 transform 的容器,`fixed` 定位以它為準,modal 與遮罩不會跑出畫布。寬高上限也以這個容器計算(四邊各 48,見「Viewport Inset」;2026-11-15 前以整個視窗算):舞台寬小於「檔位 + 96」時縮到「舞台寬 − 96」—— 例:主內容最小寬 600(`../AppShell/app-shell.spec.md` 範例值)的舞台裡,`md` 照原寬,`lg` / `xl` 都是 504【AI 推導,閘 W3 實量】。
- **遮罩的洞只挖給「點得到或畫得出來」的盒子**(2026-09-09 根因修正):常駐節點底下 `display:contents` 的殼與 `pointer-events:none` 的定位圖層都沒有資格自己當洞,往下找子節點;`<svg>` / `<img>` / `<canvas>` / `<video>` 即使 pointer-events:none 也算。錨:user 2026-09-09 問為何關閉 agent 之後,原本 dialog 該有的遮罩就消失了—— 代理關閉後常駐殼裡換成入口鈕 Dock,它外層是與舞台等大的 `pointer-events-none absolute inset-0` 裁切圖層,舊判準「有盒子就是洞」把整層當成洞,evenodd 之下洞 = 外框、遮罩整張被挖空。
- **背景位置模式(Background location)**(user 2026-09-09 說:有來源頁面就保留該頁面當 Modal 的背景;沒有來源頁面就把 Modal 顯示在預先定義的預設背景頁面上):有 URL 的 modal 由宿主路由承載 —— 從某一頁點開時,該頁留在 modal 底下作背景(路由記 `backgroundLocation`);直接以 modal 網址進入(重新整理、上一頁回到該網址、分享連結)沒有來源頁,宿主把 modal 疊在**預先定義的預設背景頁**上。上一頁 / 下一頁 / 重新整理都維持這個模型。這是宿主路由層的責任,Dialog 只提供 `persistentElements` + `portalContainer`,不讀 URL;示範 → `AgentPanel/展示/UrlRegistryDemo`(v14 推導表「有來源頁」「直接進入 modal 網址」兩列)。
- **閘**:`scripts/dialog-coexistence-invariant.mjs`(常駐區可聚焦可打字、其餘背景被抑制、預設路徑照舊隔離)、`scripts/dialog-coexist-scroll-lock-invariant.mjs`(並存捲動鎖:舞台不捲、常駐區可捲、一般 modal 照舊、開關無跳版)、`scripts/agent-url-registry-demo-invariant.mjs`(S1–S9:幾何、header / footer 變體、存檔、新增、刪除確認、背景位置、session、關 agent 遮罩仍在、AI agent 浮層態工具列可點 + Esc 分區;2026-09-09 併入原 `agent-modal-coexistence-invariant.mjs`)。

---

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「側邊 / 長停留面板也用 Dialog」 | 視覺重量不同——Dialog 是中央阻斷 modal,Sheet 側滑較輕(見「何時不用」+ 禁止事項「長 form wizard」條) |
| 「hug 是預設」 | 預設採 viewport-bounded 固定高度(`height="fill"`)以維持穩定外框;`height="hug"` 只給內容量已知且穩定的短 dialog(見「高度行為」) |
| 「`width` 填數字會被擋在 xl 以內」 | 不設上限、不擋、不警告,只受所在區塊四邊 48 夾住;但先用檔位,比 xl 還大的內容先考慮頁面或側板(見「寬度檔位」) |
| 「確認框吃預設寬就好」 | 確認框只有一件事 → `width="sm"`;確認文字超過兩句或帶欄位才升 `md`(見「寬度檔位」選檔規則) |
| 「視覺不顯示標題就可拿掉 DialogTitle」 | 必須保留,用 VisuallyHidden 包裹給 screen reader(見「A11y 預設」) |

---

## 禁止事項

- ❌ **不用 nested Dialog 承載多步驟流程**：一層一步的精靈式堆疊會讓使用者失去所在位置感，複雜多步驟流程改用單一 Dialog + 內部步驟切換。
  **⚠️ 本條 2026-08-09 收窄**（原文是「不在 Dialog 內 nested Dialog」，理由寫「使用者無法預測 Esc 關哪一層」）。兩個問題：
  （a）**該理由在本專案的技術棧不成立**——`@radix-ui/react-focus-scope` 的 `createFocusScopesStack()` 在新 scope 進入時 `pause()` 前一層、移除時 `resume()`；`@radix-ui/react-dismissable-layer` 以 layers 陣列索引判定，Esc 與 outside-click 只作用於最上層。堆疊順序是確定的，不是不可預測。
  （b）**原文與本檔「何時用」段自相矛盾**——`:37` 明列「破壞性動作確認：刪除、**離開不儲存**」是 Dialog 用途，而「離開不儲存」的確認必然出現在正在編輯的 Dialog 之上。原文的全稱禁令讓這個既有用途無法表達。
  **收窄後允許**：確認 / 警告 / 破壞性動作二次確認可疊在既有 Dialog 之上（Esc 只關最上層）。**仍禁止**：把流程步驟拆成一層層 Dialog。
- ❌ **不用 Dialog 顯示非阻斷訊息**：成功 / 失敗的短暫回饋用 Toast；持續性系統狀態用 Alert。Dialog 的阻斷成本過高
- ❌ **不把長 form wizard 塞 Dialog**：超過 3 步驟或表單高度接近全螢幕的流程改用獨立頁面或 Sheet，Dialog 不適合長時間停留
- ❌ **不在 Dialog footer 把 primary action 放左側**：CTA 靠右（`justify-end`）是跨平台使用者期待（macOS / Windows / Web 主流皆如此），反向放置會降低可用性

---

## A11y 預設

Radix Dialog 自動處理：

- **Modal 語意**：`role="dialog"`(Radix 刻意**不**設 `aria-modal="true"`,改用 aria-hidden 的 `hideOthers()` 把背景兄弟節點設 `aria-hidden` + FocusScope trap 達成隔離,避免 `aria-modal` 在部分 screen reader 隱藏整頁的已知 bug）
- **標題綁定**：`<DialogTitle>` 自動成為 `aria-labelledby` 指向對象，screen reader 開啟時讀出標題
- **說明綁定(DS 補的)**:有 `<DialogDescription>` 時 `aria-describedby` 指向它;**沒有說明(只有標題的對話框,DS 允許)時不寫 `aria-describedby`**。Radix 不論有沒有說明都寫一個指向說明 id 的 `aria-describedby`,沒寫說明時就指向不存在的元素(壞掉的 IDREF),開發模式還印「Missing `Description`」警告 —— 2026-10-20 前 Dialog / Sheet / FileViewer 都是(獨立驗證 OV-15)。機制:`DialogDescription` 掛上時向 `DialogContent` 登記,沒有登記、consumer 也沒自己指定 `aria-describedby` 時拿掉(`../../lib/overlay-description.ts`,Sheet 同一支、FileViewer 沒有說明元件直接不寫);consumer 不必再傳 `aria-describedby={undefined}`。閘 `scripts/overlay-story-contract-invariant.mjs` R7。
- **Focus trap**：焦點鎖在 Dialog 內，Tab 循環不逃出
- **開啟落點**(2026-11-27 寫進規格,產品 canary 回報 H18):打開時焦點依序落在 (1) body(`DialogBody`,或自己組兩欄時帶 `data-dialog-body` 的那一區)裡第一個可用的輸入框 / 文字框 / 下拉 / 按鈕;(2) body 沒有 → 頁尾(`DialogFooter`)第一顆可用的按鈕;(3) 兩處都沒有 → 對話框外框本身(不畫框,見下一條)。標題列的 ×(`data-dismiss`)與停用的控件(`disabled` / `aria-disabled="true"`)不算(`dialog.tsx` `handleOpenAutoFocus`)。一般確認框頁尾第一顆是「取消」,焦點因此落在最不具破壞性的動作 —— W3C APG 對話框鍵盤說明 Note 1:「If a dialog contains the final step in a process that is not easily reversible, such as deleting data … it may be advisable to set focus on the least destructive action, especially if undoing the action is difficult or impossible.」(<https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>,2026-11-27 讀)。**兩邊都不可逆的決策框**(例:核准 / 拒絕)哪一顆比較安全只有產品知道 → 由產品在 `DialogContent` 的 `onOpenAutoFocus` 裡 `e.preventDefault()` 再自己 focus 要的那一顆(consumer 的先跑、擋了預設 DS 就不接)。依據:user 2026-11-27 回 H 批決策卡 H18,逐字「照你建議」;建議 = 選項 A「維持落在頁尾第一顆,並寫進規格;像核准 / 拒絕這種兩邊都不可逆的框,由產品自己指定焦點(DS 已經能指定)。」(選項文字由 AI 擬、user 選定)
- **確認框的後果句要綁成說明**(2026-11-27,產品 canary 回報 H21):確認 / 危險操作框的後果句(例「刪除後無法復原」)寫在 body、不是標題下方的 `DialogDescription` 副標時,給那一句一個 `id`,`DialogContent` 傳 `aria-describedby` 指向它 —— 讀屏開啟時連同標題一起念出後果;畫面不變(consumer 傳了 `aria-describedby` 就以它為準,上面「說明綁定」不拿掉;Radix 這時仍會去找它自己的說明 id、找不到就在 console 誤報「Missing `Description`」—— `DialogContent` / `SheetContent` 會放一個 hidden 的空說明佔住那個 id,consumer 不必處理,`dialog.tsx` 註解有出處)。只綁那一句短的後果說明;body 是清單、表格或好幾段時不綁(W3C APG 對話框「Optionally, the aria-describedby property is set on the element with the dialog role」,同一條接著說內容有清單、表格、多段時省略,<https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>,2026-11-27 讀)。DS 範例:展示「危險操作」、test-only「開啟狀態」;DS 元件:AgentPanel 刪除對話框(`../AgentPanel/agent-panel.tsx`)。閘 `scripts/overlay-story-contract-invariant.mjs` R7(確認框那幾則的 `aria-describedby` 指到後果句)
- **開啟落點退回殼時不畫框**(2026-11-26 修正,產品 canary 回報 C11;既有規則的落實):body 與 footer 都沒有可聚焦控件(只有標題列的 ×,它被排除在開啟落點之外)時,開啟落點退回對話框外框本身(`dialog.tsx` `handleOpenAutoFocus`);外框本身不可操作,照 `ds-canonical/references/focus-canonical.md`「E. 浮層程式落點」**不畫焦點框**(`outline-none` + `@focus-suppress E`;同族 Popover / HoverCard / Sheet)。修前畫 2px 框。閘 `scripts/escape-and-focus-contract-invariant.mjs` F-shell-ring
- **Esc 關閉**：按 Esc 自動關閉 —— **一次只少一層,而焦點所在的控件自己那一層也算一層**(2026-10-01;規則與出處 `ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」):對話框裡改過的欄位(接 `useFormValidation`)/ 就地編輯中 / 表格的格游標 / 拖曳中 → 第一下 Esc 由控件撤銷(回復欄位 / 取消編輯 / 清游標 / 取消拖曳),對話框不關,第二下才關;乾淨的控件按 Esc 直接關〔UD-U1021-28〕。**輸入法組字中的 Esc 不關**(那一下是在取消選字,例:改名對話框用注音打字時按 Esc 取消選字,不該把對話框連同打到一半的名字一起關掉)。機制:`DialogContent` 的 `onEscapeKeyDown` 經 `../../lib/overlay-escape.ts` `withOverlayEscape`(2026-10-01 取代 ime-composition.ts 的 `withImeSafeEscape`)—— 焦點所在控件在這一層裡宣告了 `data-escape-layer` 就把那一下留給它,consumer 的 `onEscapeKeyDown` 在那一下不會被呼叫;沒有表單引擎的 `<Input>` 沒有「原值」可回復,Esc 直接關
- **Focus return**：關閉的那一刻(不等 250ms 收起動畫;時機規則住 `ds-canonical/references/keyboard-model-canonical.md`「關了之後焦點去哪」)焦點返回開啟它的元素,同時撤掉這次開啟加在頁面上的 `aria-hidden`、淡出中的對話框 `inert`(`../../lib/overlay-focus-return.ts` `useExitStartFocusReturn` modal 路徑;並存 `persistentElements` 的宿主 inert 綁在內容卸載,仍在卸載時還)。Radix 只還給 `DialogTrigger`;**受控 `open`、沒有 `DialogTrigger`(普通按鈕 / 列上動作 / 快捷鍵開的)→ `DialogContent` 預設就記下開啟者、關閉時還給它**(2026-10-01,待辦總帳 OE29;`../../lib/overlay-focus-return.ts` `useTriggerlessFocusReturn`:內容掛上時記開啟者、沒有 Radix 觸發點就經 `returnFocusToOpener` 還,modal 按遮罩收起也還)。開啟者住在一個會跟著關掉的選單 / 浮層裡(列上的 ⋯ 選單項開了對話框)→ 還給那個選單的觸發鈕(`persistentOpenerOf`;W3C dialog 關閉後焦點「回到打開它的那個元素,或在它消失時合理的替代」,<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L96-L101>)。consumer 要送去別處就在 `onCloseAutoFocus` 先 `preventDefault()` 再自己 focus(`CommandDialog` 2026-10-01 已改用預設;AgentPanel 改名 / 刪除對話框自己接線的照舊勝出)。FileViewer 不經 `DialogContent`(直接用 Radix Dialog),2026-10-20 起同樣消費 `useTriggerlessFocusReturn`(此前自己記開啟者、少了 `persistentOpenerOf` → 從選單項開的檢視器關閉後焦點掉到 body;閘 `scripts/escape-and-focus-contract-invariant.mjs` F-menu-fileviewer)。2026-10-01 前這種開法焦點掉到 body(實測 Dialog 並存夾具、AgentPanel 刪除確認框)
- **Overlay click**：點擊 overlay 關閉（可透過 `onPointerDownOutside` 阻止）

Consumer 必須保留 `<DialogTitle>`——即使視覺不顯示，也要用 `VisuallyHidden` 包裹提供給 screen reader。

---

## 欄內標頭(DialogPaneHeader)

兩欄對話框「左導覽 + 右內容」(`../../patterns/overlay-surface/overlay-surface.spec.md`「左導覽 + 右內容」)右欄頂端的標頭(2026-11-27,產品 canary 回報 H46)。

- **何時用**:右欄要一條標頭時 —— 標題 = 選中分類的字,右側有作用於這一欄的操作(例:「通知」分類的「全部重設」),或標題列下面要分頁(例:「電子郵件 / 推播」)。只要文字標題時不必用(overlay-surface 那一段的寫法 (b))。依據:user 2026-11-27 回 H 批決策卡 H24a,逐字「確保左邊是 sidebar 右邊有按照 layout space 設計原則即可，若右邊有用到 header也是確保有維持header設計原則即可」【判讀:協調者 2026-11-27 依 H24a 字面:右欄用了標頭就照標頭原則 → 右欄可以用標頭】。
- **長相 = DialogHeader 少了 ×**:`DialogPaneHeader` 就是 `DialogHeader` 用的那個 `SurfaceHeader`(`../../patterns/overlay-surface/overlay-surface.tsx`)—— 高度、左右 / 上下內距、底線、右側操作位(`actions`)、標題列下的分頁(`tabsSlot`)同一份,不另寫值;標題用 `DialogPaneTitle`(字樣與 `DialogTitle` 共用同一個常數,單行截斷、截斷時滑過出全文)。跨家族規則(header 內控件一律 `sm`、tabsSlot 連動)→ `../../patterns/header-canonical/header-canonical.spec.md`。
- **沒有 ×**:× 關的是它所在的那個容器 —— 每個能被單獨關掉的容器各有一顆,放在那個容器自己的標頭(對話框 / Sheet / Popover 最上面那條;可獨立收起的 pane,如 FileViewer InfoPanel);欄內標頭放在內容區裡,它所在的右欄不能單獨關掉,所以沒有 ×【理由:user 2026-11-27 問句,逐字「主要是因為這個 header 不是像 overlay 那種放在最上面可以關閉容器的header，而是放在內容區塊裡面才不放 close 吧？應該要先確認理由，你才能在未來的判斷正確吧？」;AI 對照本檔「關閉按鈕」、`../../patterns/overlay-surface/overlay-surface.spec.md`「不屬本 primitive 的職責」的「Close 按鈕綁哪個 Radix Close」、`../../patterns/header-canonical/header-canonical.spec.md`「何時不用」確認成立】。關閉只在跨全寬的那條 `DialogHeader`(本檔「關閉按鈕」),整個對話框一顆。要沒有 × 的標頭就用本元件,`DialogHeader` 的 × 不做成可省略(`ds-canonical/rules/meta-patterns.md` M23(f):可省略 callback ≠ 可省略 chrome)【AI 推導:做法由 AI 選;user 對右欄標頭的原話只有上一條「何時用」引的 H24a,沒有談到做法】。只有操作、沒有 × → 不畫分隔線(分隔線只隔在操作與 × 之間,`../../patterns/action-bar/action-bar.spec.md`「五、分隔線規則」第 3 條)。
- **放法**:右欄 `flex flex-col`,`DialogPaneHeader` 在最上面、下面接該欄自己的 `<ScrollArea>` —— 標頭不隨內容捲,內容上方從標頭底下算 `tight`(`../../tokens/layoutSpace/layoutSpace.spec.md` 規則 2)。有分頁時 `<Tabs>` 包住標頭與捲動區(TabsList ↔ TabsContent 同一個 root),`TabsContent` 放捲動區裡並 `mt-0`(同本檔範例「標頭內含分頁」)。底線貫穿右欄寬:沒有分頁時標頭自己畫、有分頁時 TabsList 畫(header-canonical W1)。
- **標題層級**:`DialogPaneTitle` 是 `<h3>` —— 對話框的名稱只有 `DialogTitle`(h2,對話框的 `aria-labelledby` 指向它),欄標題是它底下的一節【AI 推導】。
- **命名**:「pane」沿用本 DS 既有說法(header-canonical「何時不用」的「side pane」);Apple HIG Split views:「A split view manages the presentation of multiple adjacent panes of content, each of which can contain a variety of components, including tables, collections, images, and custom views.」(<https://developer.apple.com/design/human-interface-guidelines/split-views>);GitHub Primer `PageLayout.Pane`:「Which side of the page the pane should be on.」(<https://github.com/primer/react/blob/main/packages/react/src/PageLayout/PageLayout.docs.json>)。不叫「panel」:本 DS 的 Panel 已是浮層 / 面板(`AgentPanel`、`DataTableFilterPanel`)。
- **產品端**:用本元件不是手刻,手刻浮層標頭的閘(header-canonical「機械防呆」:`check_story_invariants.sh` R9 / `check_consumer_code_quality.sh` 浮層段)不擋;自己寫 `px-loose + border-b border-divider` 的標頭照擋。

---

## anatomy story 結構

Dialog 是 modal 浮層元件,關鍵決策維度是 `width`(寬度檔位 sm 400 / md 480 / lg 640 / xl 960,見「寬度檔位」)× `height`(fill / hug)× `destructive` × open/close 行為。設計規格頁只放表格(登記簿 A32「dialog 的設計規格的範例給我拿掉」;Inspector N/A,理由寫在 anatomy 檔頭),開起來的樣子在展示頁(含「大檔位:對話框裡放表格」「超大檔位:兩欄記錄詳情」)。

對應 anatomy story:`Overview`(Props 速查)+ `SizeMatrix`(四檔寬度表)+ `StateBehavior` + `ColorMatrix` + `Accessibility`。

---

## 相關

- `../Sheet/sheet.spec.md` — 側邊滑入的輕量替代（共用 Radix Dialog base）
- `../Toast/toast.spec.md` — 非阻斷的短暫回饋
- `../Alert/alert.spec.md` — 頁面內持久通知
- `../Popover/popover.spec.md` — 輕量浮層（non-modal）
- `../DropdownMenu/dropdown-menu.spec.md` — 浮動選單
- `../Tooltip/tooltip.spec.md` — hover 輔助資訊
- `../../patterns/overlay-surface/overlay-surface.spec.md` — Header / Body / Footer padding SSOT（Dialog + Popover 共用）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `agent-panel.spec.md`
- `alert.spec.md`
- `coachmark.spec.md`
- `command.spec.md`
- `dropdown-menu.spec.md`
- `elevation.spec.md`
- `file-viewer.spec.md`
- `header-canonical.spec.md`
- `motion.spec.md`
- `overlay-chrome-sizing.spec.md`
- `overlay-surface.spec.md`
- `popover.spec.md`
- `scroll-area.spec.md`
- `sheet.spec.md`
- `toast.spec.md`
