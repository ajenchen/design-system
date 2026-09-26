# Hit Area Canonical(滑過與可點範圍)

跨元件 SSOT:**滑鼠停在哪裡、畫面可以怎麼變、點下去打到誰。**
全 DS「滑過時要不要變、變了之後點擊範圍要怎麼對上」只住在本檔;各元件 `spec.md` 與 `color.spec.md` 只寫自己怎麼做,並指回這裡。
起點是三次 user 裁示:2026-09-04 AgentPanel 入口鈕、2026-09-24 inline action、2026-09-25〜26 滑過原則(原話全在「user 原話」節)。

## Authority boundary

本檔擁有**跨元件的一致性規則**:
- **滑過原則**(下一節):什麼東西滑過時可以變、可以變哪裡、變了之後點下去要打到誰。
- **控件的命中區**(「一-4 細則」節起):懸停回饋形狀與命中區的關係、唯一例外的形狀分類、外擴的硬限制。

它不擁有:變的時候用什麼顏色(owner = `packages/design-system/src/tokens/color/color.spec.md`「Hover 換色配對總則」,含巢狀滑過)、
滑過要不要過渡動畫(owner = `tokens/motion/motion.spec.md`「hover 回饋不做過渡」)、
焦點框怎麼畫(owner = `focus-canonical.md`)、鍵盤怎麼走(owner = `keyboard-model-canonical.md`)、
拖曳把手的行為契約(owner = `drag-canonical.md` + `patterns/resize-handle/resize-handle.spec.md`)、
各元件的實際尺寸值(owner = 各元件 `*.spec.md` 與 `patterns/element-anatomy/inline-action.spec.md`)。
本檔不重述那些值,只在它們之間定分工。與 `focus-canonical.md`、`drag-canonical.md` 同層級、同形狀(一個能力、一份跨元件契約)。

**焦點框與命中區是兩件事**:焦點框是鍵盤游標的指示器(畫在哪、往內往外 → `focus-canonical.md`),
命中區是滑鼠指標的目標(有多大 → 本檔)。同一顆鈕可以焦點框往內畫、命中區照樣只由它的懸停回饋決定(沒有懸停回饋的按鈕才退化成可視形狀,見「一-4 細則」),兩者互不決定。

## 滑過原則

> **滑過時畫面會變,只能是為了三件事之一:① 告訴你「這裡可以操作」 ② 叫出這裡能用的按鈕 ③ 給你看資訊。三件事都不是,滑過時什麼都不變。**

措辭是 AI 寫的。三種用途是 user 轉來的提議;一-1、一-2 是 user 已同意的核心;整份由 user 2026-09-26 條件式同意(條件是「足夠通用合理且可以合理解釋各種情境且符合我們一致的設計語言也不違背世界級的設計」)。
每條後面的〔〕是來源:〔user〕引得出 user 原話(全文在「user 原話」節);〔現行〕DS 既有正本;〔AI〕AI 推導;〔AI 判讀〕user 2026-09-26 沒點名這一項,AI 依 user 對「其餘都照建議做嗎」(AI 的問句)的回覆,理解為照建議做(回報時已明講)。

### 一、可以操作的東西

按鈕、連結、分頁、選單項、可點的列與卡片、可點的格、日期、評分星星、把手。

1. 滑鼠停在某個位置,只要這個元件因此出現任何樣式變化(底色、字色、外框、圖示、預覽,不論變的是哪一部分),在那個位置按下去就必須觸發這個元件;把手則是按下去拖得動。〔user N50;「預覽」兩字是 AI 補的,對應一-6〕
2. 點得到的地方不一定要有樣式變化。〔user N50〕
3. 點得到的地方要有明確的游標:按下去會執行、切換、前往的用手形;可以打字的用文字游標;停用的用禁止符號;把手用拖曳或調整大小的游標。〔現行 `inline-action.spec.md`「實作要求」、`field-controls.spec.md`「游標指引」、`src/styles/base.css`(所有 `button`、`[role=button]` 手形)〕
   - **「手形 = 能點」是本 DS 網頁的慣例,不是世界級共識。** 網頁端有同做法的一手例子:Polaris 表格能點的列 `cursor: pointer`、不能點的列 `cursor: auto`([`IndexTable.module.css#L140-L151`](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/IndexTable/IndexTable.module.css#L140-L151))。原生平台相反:微軟 "Always use the arrow cursor … for clickable elements. don't use the pointing hand cursor … for links or other interactive elements. Instead, use hover effects"([Windows mouse interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/mouse-interactions),範圍:Windows 應用程式「自訂游標」一節);蘋果 macOS 的手形只給連結:"Pointing hand — The content beneath the pointer is a URL link…"([Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices),範圍:macOS 游標清單)。本 DS 補回手形的理由寫在 `base.css`(Tailwind v4 拿掉了按鈕的手形)。
   - 試算表的格被點只是「把格游標移過去」,維持箭頭。〔AI,世界級未查〕
   - 點浮層外面、點遮罩把浮層關掉,是「離開」,不是操作一個目標:不算這一條,維持箭頭,也不給滑過樣式(DS 的對話框、側拉面板遮罩現況就是這樣)。〔AI〕
4. 有自己滑過形狀的小控件(按鈕、行內動作、單選圓、勾選框、日期圓、評分星星):**點擊範圍 = 它的滑過形狀**(細則見「一-4 細則」節)。唯一可以更大的,是**屬於它的標籤元素的整個盒子**(`<label for>`,或包住它的整張選項卡):指在這個盒子裡就等於指在控件上 —— 控件照自己的樣子變,點下去等於點控件(現行:`checkbox.spec.md` 狀態表「readonly × hover」段、`switch.tsx` 包 `<label htmlFor>`)。不在任何標籤元素裡的空白(例:沒有預覽亮著時的日期圓外方角)不得擴進點擊範圍;預覽亮著時縫與角裡的那一下點擊是整個元件「確認預覽」,不是外擴,見一-6;線與點的例外見「唯一例外」節。整列、整張卡、整個分頁這種「本身就是目標」的東西,點擊範圍就是它自己的盒子,滑過要不要變照一-2。〔AI;AI 面板選項卡「整張卡是標籤、只亮單選圓」即依此,該項 (E) 列入 09-26 寫入清單、user 選「同意，寫入」(待辦總帳「09-26 第三輪落地」:110 /「09-26 第四輪研究結果」:122)〕
5. 滑過會上底色的,只有這一類(例外見三-2);顏色照 `color.spec.md`「Hover 換色配對總則」。〔user #33〕
6. 會「預覽按下去的結果」的元件(評分、日期區間):元件裡不在任何目標上的地方(縫、角)維持上一個目標的預覽;指標離開整個元件,才收掉滑鼠造成的預覽;預覽亮著時在縫或角裡點下去 = 得到正在預覽的那個值(一-1 的「預覽」兩字因此成立)。這是整個元件「確認預覽」,不是把某一天、某一顆星的點擊範圍擴大:沒有預覽亮著時,縫與角點下去沒有反應,一-4 照樣成立。〔評分:AI 建議,09-26 列在「其餘建議」、user 未另提 → AI 判讀為照建議做;日期縫與角 (D):列入 09-26 寫入清單,user 選「同意，寫入」(待辦總帳「09-26 第三輪落地」:110 /「09-26 第四輪研究結果」:122)〕

### 二、叫出按鈕的那一塊(宿主)

1. 宿主本身能操作(側欄列、樹狀列、選單列、可點的卡片)→ 宿主照第一條,叫出來的按鈕也照第一條;疊在一起照第五條。〔AI;「宿主分本身能不能點兩種」是 AI 研究後改的四處之一,見「user 原話」節〕
2. 宿主本身不能操作(上傳列、輪播、捲動區、表頭空白處、不能點的清單列、對話訊息)→ **宿主自己不變**:不上底色、不換字色、游標不是手形;會變的只有叫出來的按鈕(或捲軸),它們照第一條。〔user #33、B12〕資料表格的列另見三-2。
3. 叫出來的按鈕,鍵盤走到這一塊時也要出現,不能只靠滑鼠。〔現行 `keyboard-model-canonical.md`「鍵盤走到的那顆按鈕必須看得見」,該句自標 AI 推導〕

### 三、給你看資訊的東西

文字提示、截斷的全文、「+N」名單、頭像名片、圖表的數值提示。

1. 觸發資訊的那一塊**可以**有滑過變化,用來告訴你「這裡有資訊可看」(例:欄位說明圖示 ⓘ 平常 `fg-muted`、滑過 `fg-secondary`,`components/Field/field.spec.md`「FieldLabel `info` icon」);但**不能讓人以為點下去會做事**:不上會讓整塊看起來可點的底色(底色的例外只有三-2 那兩項),游標用**一般箭頭**(`cursor-default`;按下去沒有作用)。觸發處若是 `<button>`(為了讓鍵盤走得到),`base.css` 會給它手形,要明寫 `cursor-default` 蓋掉。**已知分歧**:Ant Design 的欄位說明圖示用問號游標 `cursor: help`([`components/form/style/index.ts#L289`](https://github.com/ant-design/ant-design/blob/6.6.5/components/form/style/index.ts#L289));本 DS 不用,因為其他只給資訊的觸發處(「+N」、頭像名片)都已是箭頭,問號游標會變成只有一處的新樣子(M23)。〔「一般箭頭」:2026-09-26 user 對 ⓘ 條件式同意「I 可以從手形改掉，若改掉更合理的話」,AI 研究後提出、user 選「同意,照清單寫入」〕〔user 2026-09-26 轉來的補充句:「不可點擊的元件可以有 hover 回饋，但必須有明確的閱讀、資訊揭露或操作揭露用途；其視覺表現不應讓使用者誤認整個區域可以點擊。」;「游標不是手形」是 AI 依這句與一-3 推導。**更正**:本條 2026-09-26 初版寫「觸發它的那一塊自己不變」,比 user 這句嚴、也跟 `field.spec.md` 的 ⓘ 滑過色衝突,user 當天指出(「i 還是要照常變色吧？規則哪有說不能變色？有嗎？仔細查，為何要拿掉變色？」)後改寫〕
2. **例外清單,只有這兩項;清單外一律照三-1。**
   - ① **資料表格的列**:滑過時整列上淡底,幫你橫著讀同一筆資料(閱讀輔助)。〔user #3〕
   - ② **圖表的滑過指示**:長條圖在整個類別的位置上一條淡帶,折線 / 面積 / 散佈 / 雷達圖是一條線,告訴你「提示在講哪一個類別」。顏色與實測 → `components/Chart/chart.spec.md`「滑過指示」。〔user 09-26 圖表灰帶〕

   表格列與圖表的淡帶都用透明底的滑過色 `--neutral-hover`(圖表的線用線的顏色,見 `chart.spec.md`),跟能點的列同一色,所以**能不能按靠游標分**:列與圖上是箭頭,列裡真正能按的東西(勾選格、連結、列上按鈕)才是手形,也各有自己的滑過。例外不延伸到其他清單或格狀元件(換一類東西要重新查證,M8)。列裡已經有自己底色的格(試算表的區間格)維持自己的底色,兩個主題相同。〔區間格:AI 建議,試算表 (a)(b)(c) 列入 09-26 寫入清單、user 選「同意，寫入」〕

### 四、其他東西滑過不變

不能點的卡片、提示框、標籤本體、徽章、進度條、對話框與浮層本體、不能點的清單列、唯讀的評分(精簡版「★ 4.7」)、唯讀的月曆、步驟條目前那一步(`components/Steps/steps.spec.md`「目前那一步可不可以點」:你就在這裡,點了不會發生任何事;一般箭頭,不是手形也不是禁止符號)……
沒有上面三種用途,就不給任何滑過樣式,游標也不是手形。〔AI;user 轉來的提議寫「沒有上述用途的靜態容器,預設不提供 hover 樣式」,AI 拿掉「預設」兩字(沒寫條件的後門),見「user 原話」節〕

### 五、疊在一起時

- 每一層各自照自己那一條判。〔AI〕
- 能操作的宿主裡有自己的按鈕:指到按鈕時,宿主保留自己的滑過、按鈕往上一階;按下去打到最上面那個亮著、能操作的東西。顏色 → `color.spec.md`「巢狀滑過」;命中的讀法 → 下方「巢狀時要逐個控件讀」。〔user #4;資料表格列裡的按鈕同理是 AI 推導〕
- 提示卡開著時,指標移到卡上,卡所在的範圍不算原元件的位置。〔user N50 補充②;[WCAG 2.2 SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)〕
- 半透明的淡底蓋在別的內容上會透出來:`color.spec.md`「Drop target」段把元件自己的淡底(`-subtle`)限在「底下沒有別人的內容」的地方,而深色主題的 `-subtle` 是半透明的(同段 2026-09-25 更正)。會互相疊住的(頭像堆疊)用挖空讓它們不重疊。〔AI 建議,頭像挖空 (B) 列入 09-26 寫入清單、user 選「同意，寫入」〕

### 判斷順序

任何元件(含新元件)照這四題問,第一個答「是」的就停:

1. 這一塊按下去(或拖)有作用嗎?有 → 第一條。
2. 沒有;滑過會叫出按鈕嗎?會 → 第二條:宿主不變,叫出來的照第一條。
3. 沒有;滑過會給資訊嗎?會 → 第三條:浮出提示;觸發處可以變,但不能看起來像按鈕;只有例外清單那兩項可以上淡底。
4. 都沒有 → 第四條:不變。

一塊裡疊著好幾層 → 每層各問一次,再看第五條。

### 世界級對照(三種用途各有一手原文;範圍另註)

| 用途 | 一手原文 |
|---|---|
| ① 可以操作 | Material 3:"Hover states are initiated by the user pausing over an interactive element using a cursor."、"Hover states aren’t inherited by communication, containment, or navigation components"([Applying states](https://m3.material.io/foundations/interaction/states/applying-states);**search-only confidence**:頁面由 JS 渲染,2026-09-27 抓正文 0 命中,兩句引文只來自搜尋摘要,`focus-canonical.md` 對同站頁面也標「不列為依據」;後一句的清單接 App bars、Dialogs、Menus、Tabs 等,AI 讀作「元件整體不吃滑過,裡面可點的項目另計」) |
| 不能操作就不給回饋 | 微軟:"Don't display visual feedback if an element doesn't support interaction (such as static text)."([Windows mouse interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/mouse-interactions)) |
| ② 叫出按鈕 | 蘋果:"Let people use the pointer to reveal and hide controls that automatically minimize or fade out."([Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices),Best practices);微軟:"When a mouse is detected (through move or hover events), show mouse-specific UI to indicate functionality exposed by the element."(同上微軟頁) |
| ③ 給你看資訊 | 微軟:"Hover to learn — Hover over an element to display more detailed info or teaching visuals (such as a tooltip) without a commitment to an action."(同上微軟頁) |
| 例外①表格列 | Carbon:"The data table’s row hover state should always be enabled as it can help the user visually scan the columns of data in a row even if the row is not interactive."([data-table usage.mdx](https://github.com/carbon-design-system/carbon-website/blob/d8783ad2ae3b5e59c58f58311491f8a2c4e62631/src/pages/components/data-table/usage.mdx));NN/g:"Borders, zebra striping, and hover-triggered highlighting of a record can all help."([Data Tables](https://www.nngroup.com/articles/data-tables/),範圍:讓眼睛橫著讀不跑行) |
| 例外②圖表 | Recharts:"Cursor is the background, or a highlight, that shows when user mouses over or activates an area. It usually shows together with a tooltip to emphasise which part of the chart does the tooltip refer to."([`Cursor.tsx#L125-L130`](https://github.com/recharts/recharts/blob/v3.8.1/src/component/Cursor.tsx#L125-L130));MUI X Charts 長條圖同樣有滑過帶([`ChartsAxisHighlightPath.ts#L10-L22`](https://github.com/mui/mui-x/blob/6503fbca0b62a298eebe6cf1af619a014a0f16b7/packages/x-charts/src/ChartsAxisHighlight/ChartsAxisHighlightPath.ts#L10-L22)) |

已知的分歧:React Aria 的表格讓不能選、沒動作、不能拖的列滑過不亮(`isDisabled: !states.allowsSelection && !states.hasAction && !isDraggable`,[`Table.tsx#L1809-L1812`](https://github.com/adobe/react-spectrum/blob/16eead67e83cf42f3c0ee46ef6eb7a2032778378/packages/react-aria-components/src/Table.tsx#L1809-L1812)),用「不亮」而不是用游標來分;2026-09-26 查過的 7 個表格實作只有它這樣做(AI 盤點)。本 DS 照 user #3 保留例外①。

**全 DS 套用結果**:2026-09-26 逐一套過全部元件家族;已知不合的地方追蹤在待辦總帳(`governance/planning/2026-09-25-interaction-and-hover-remediation.md`),本檔不列清單(清單會隨修正變動)。

## 一-4 細則:控件的懸停回饋形狀 ≡ 命中區

**控件的懸停回饋形狀 ≡ 它的命中區。** 會亮起來告訴你「指標在目標上」的那一塊,必須**剛好**就是那個目標。

它跟滑過原則一-1 的關係:一-1 管「亮了的地方要點得到」(亮的是哪一小塊不拘);本節對**有自己滑過形狀的小控件**多要求一件 —— 亮的那一塊**剛好**就是點擊範圍,不多不少(唯一可以更大的是標籤盒子,見一-4)。

圖示與文字是裝在裡面的**內容**,內容可以比命中區小,**不得比它大**。

⚠️ **主詞是「控件」,不是「任何可點的東西」。** 這一句的出處是 user 對**行內動作按鈕**的裁示;2026-09-24 我把它外推到資料表格的 cell 上,四家一手原始碼 0/4 支持,當天撤回。邊界見下方「適用範圍」節。

**巢狀時要逐個控件讀**(2026-09-25 對齊 user 決定;待辦總帳 C12④):可點的宿主(卡片、列、分頁)裡有自己的按鈕時,指到按鈕上會**同時亮兩塊** ——
宿主保留自己的滑過色,按鈕自己的滑過色疊在上面、沿同一把灰階再往上一階(user 選「卡片保留、按鈕再亮一層 (Recommended)」;
規則全文與措辭只住在 `packages/design-system/src/tokens/color/color.spec.md`「Hover 換色配對總則」的巢狀滑過段,本檔不重述)。
本條照樣成立:**按鈕那一塊 ≡ 按鈕的命中區**(例:行內動作鈕 18×18),而且它畫在最上面;兩塊重疊的地方,這一下點到的就是最上面那一塊。
宿主那一塊回答的是「你還在這張卡片裡」,點下去一定打到最上面亮著的那個控件 —— 所以不構成本條要防的「看到亮起來卻點不到」。
(「重疊處以最上面那一塊為準」是 AI 推導的讀法;user 的決定只到「卡片保留、按鈕再亮一層」。)

唯一例外:**先天無法當目標的線與點**(1px 分隔線、6px 指示點這一類 —— 它們連懸停回饋都畫不出可用的形狀)。
例外必須逐案在該元件 `spec.md` 寫明外擴量與世界級對照,而且外擴不得越出宿主、不得蓋住別的可點目標。

### 為什麼不寫成「命中區 = 可視形狀」(2026-09-24 user 指出這句不夠精確)

因為多數小目標**平時沒有可視邊界**。inline action 在 rest 狀態你只看得到一個 16px 圖示,那塊 18px 底色要**懸停才出現**
(`patterns/element-anatomy/item-anatomy.tsx` 的 `group-hover/action:bg-neutral-hover`)。
「可視形狀」在 rest 與 hover 兩個狀態下是兩個不同的東西,拿它當判準**等於沒定義**。

改用「懸停回饋」就精確了:它只有一個形狀,而且它本來就是用來回答「我在不在目標上」的那個訊號 —— 讓訊號與事實相等,
正是這條規則要保證的性質。

而且它要防的失敗是**單向**的:**看到亮起來卻點不到**(使用者已經收到「你在目標上」的訊號,點下去卻沒反應)。
反過來「圖示比命中區小」不構成失敗 —— 你瞄著圖示按下去一定打得中。所以規則寫成「內容 ≤ 命中區 = 懸停回饋」,
不寫成三者全等。

**沒有懸停回饋的按鈕怎麼辦**:按鈕的可視形狀本身就是訊號(例如 AgentPanel 入口鈕、一般 `Button`),此時「懸停回饋」退化成「可視形狀」,結論不變 —— user 2026-09-04 的原話講的就是這種按鈕(「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」)。
這句**只管有可視邊界的按鈕**,不延伸成「所有沒有滑過變化的東西,點得到的範圍都要看得到」:整列、整張卡這類本身就是目標的東西照滑過原則一-2(點得到的地方不一定要有變化;例:步驟條整列點得到、滑過不變,右側空白也點得到)。2026-09-24 版本曾把這句寫成全 DS 通則,user 2026-09-26 同意改寫(N50)。

### 適用範圍:這條規則管**控件**,不管**表格的格**(2026-09-24 撤回一次過度外推)

本條的出處是 user 對**行內動作按鈕**的裁示(「都是 18*18」)。它在控件層成立:
一顆按鈕的懸停底色會亮起來告訴你「指標在目標上」,那塊就必須剛好是命中區。

**它不適用於資料表格的 cell,而我曾經把它外推過去,那是錯的。** 2026-09-24 我用這條規則
把 DataTable 選取格的 `onClick` 拿掉,理由寫「那一格自己沒有懸停回饋」。user 當場反問
「checkbox 所在的 cell 一整個就是可以被點擊的視覺範圍啊,為何要把可觸控範圍改到只剩 checkbox?」,
去查四家一手原始碼後,**我那條前提在四家裡 0/4 成立**:

| | cell 是點擊目標? | hover 回饋畫在哪? | 垂直格線 |
|---|---|---|---|
| **AG Grid** | 是(cell DOM 掛 click / mousedown,點了就 `focusCell`) | **列**(`.ag-row-hover`)+ 選配的欄;**零條 `.ag-cell:hover`** | `columnBorder` 預設 `color: 'transparent'` |
| **MUI X Data Grid** | 是(cell 掛 6 種事件,`:focus` 有 outline) | **列**(`.row:hover`);cell 只有 `:focus` | `showCellVerticalBorder` 預設 false,純 class → 純 border,零行為 |
| **react-data-grid** | 是(mousedown → active cell) | **列**;cell 唯一的 `:hover` 是拖曳把手 | **永遠四邊都有**,無開關 |
| **Glide Data Grid** | 是(canvas 命中測試) | **格**(per col/row) | canvas 自繪 |

**「hover 畫在列、點擊目標卻是格」是常態,不是 bug。** react-data-grid 是最乾淨的反例:
每個 cell 四邊都有格線、hover 在列、選取欄 checkbox 只有 20px —— 三者形狀全不一致,而那是它的正式設計。

而且**四家沒有任何一家讓選取格的空白處變成死區**:AG Grid 聚焦該 cell(原始碼註解逐字
"we need to make sure the cell wrapping that checkbox is focused")、MUI X 該 cell 出現 focus outline、
rdg 該 cell 變 active、Glide 直接選列。

**⛔ 一併撤回我讀錯的那句 cite。** 我先前引 MUI 的
「click on checkbox should not trigger row selection」當作「整格不可點」的依據 —— 讀反了。
那句住在 `handleRowClick` 裡,跟 detail panel、actions 欄的 early-return 並列,
擋的是「這一欄已經有自己的控制項,別讓列點擊再觸發一次」。同一個檔案仍照常發 cell 事件。

**⛔ 也撤回「有格線 → 整格可點」這條因果。** 查無一手依據。真正切的那一刀是 `cellSelection`
這個 feature flag,不是格線畫不畫 —— AG Grid 的 `columnBorder` 預設就是透明色,**同一份 DOM、
同一份 JS,只差上不上色**。所以本 DS 也不依「有沒有畫格線」分流。

### 所以這條規則的邊界寫死如下

| 適用 | 不適用 |
|---|---|
| **控件**(按鈕、行內動作、指示點、把手):可見回饋形狀 ≡ 命中區,禁止可見形狀之外**沒有任何回饋**的隱形帶 | **資料表格的 cell**:格本來就是互動單位(聚焦 / range / active / 選列),它的回饋畫在列上是世界級常態 |

**列的懸停底色是掃視輔助**(= 滑過原則三-2 例外①;Carbon 原文與網址見「世界級對照」),它既不宣告「這一列可點」,也不用來推導「格內留白不可點」。
我先前從它推出「列不可點時,格內留白不得掛 onClick」—— **那一步是我自己加的,四家全否證,已撤回。**

## 為什麼是「相等」,不是「命中比較大一點就好」

因為命中比可視大,等於在畫面上生出一條**看不見的帶子**。`agent-panel.spec.md`「遮擋與貼邊」段的「不外推」條(:463-464)記的是實際踩過的後果:

> 外推會生出隱形帶,搶走底下內容的點擊,並把 Radix 錨點推遠(tooltip 離可視形狀 20px 而不是 8px)。

兩個代價都不是理論:底下內容的點擊被吃掉(使用者點的是別的東西,卻觸發了這顆鈕),以及任何掛在這顆鈕上的浮層
(tooltip / popover / dropdown)錨點跟著外推的盒子跑,距離就不再是 canonical 的那個值。
所以「多給一點好點」在 web 上不是善意,是把兩個 bug 換成一個手感。

反過來,命中比**懸停回饋**小也同罪 —— 那是使用者已經看到「你在目標上」的訊號、點下去卻沒反應
(2026-09-24 的 inline action 就是這一邊:底色 18,盒子 16,實測側欄點在底色下緣觸發的是整列導覽)。
**兩邊都錯,只有相等是對的。**

注意這一節講的「相等」兩端是**命中區**與**懸停回饋**,不是命中區與圖示。圖示是內容,本來就可以小
(見上方「為什麼不寫成『命中區 = 可視形狀』」)。把圖示也拉到 18 會讓 16px 的 icon 家族整個變形,不在本規則要求之內。

## 本 DS 不採納觸控尺寸建議(user 2026-09-24 裁示)

> 「我們在做的是 web component,不要一直拿觸控裝置的設計原則來規範,滑鼠的指標是可以比手指頭精細很多的」

這是**我們的立場**,不是對外部準則的評價:本 DS 的目標裝置是滑鼠指標,指標的落點精度遠高於指腹,
所以**不以「手指要多大才點得到」當作命中區的依據**。

已知的外部準則有這些,列在這裡是為了讓後來的人知道我們看過而且**明確不採納它們當依據**,不是拿它們背書:
[WCAG 2.5.5 Target Size (Enhanced) 44 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)、
[WCAG 2.5.8 Target Size (Minimum) 24 CSS px](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、
[Apple HIG buttons(44pt)](https://developer.apple.com/design/human-interface-guidelines/buttons)。

**它們是尺寸建議,不是「命中要大於可視」的授權**。同樣的話 `agent-panel.spec.md`「遮擋與貼邊」段「機械閘」條的末句(:501-504)已經寫過一次:
要滿足這類尺寸建議,正確作法是**把可視形狀做大**,而不是在小圖示外面加一圈看不見的邊。
所以「WCAG 2.5.8 ≥24 所以命中撐到 24」這種寫法,在本 DS 一律不成立 —— 它把一條尺寸建議當成了破壞相等契約的理由。

## 唯一例外:可視形狀先天無法當目標的線與點

**判準只有一題:這個東西的可視形狀,本身有沒有可能被指標瞄準?**
1px 的線、6px 的點,不是「有點難點」,是**幾乎不可能點**——這種情況下堅持相等等於宣告它不可用。
只有這一類准許外擴。**「小」不等於「線或點」**:16px 的圖示鈕不在此列,它的可視形狀(懸停底色)完全可以當目標。

例外的四個條件,缺一不可:

1. 可視形狀是**線或點**(一個維度或兩個維度都退化到指標難以瞄準)。
2. 外擴量與**世界級對照**逐案寫在該元件自己的 `spec.md`(不是寫在本檔,也不是只寫在 tsx 註解)。
3. 外擴**不得越出宿主**。
4. 外擴**不得蓋住別的可點目標**。

### 外擴的硬限制(3 與 4 的具體檢查)

- **不得越出宿主**:外擴後的盒子仍必須落在它所屬的容器內。越界的那一截會蓋在別人的內容上,就是上面說的隱形帶。
- **不得蓋住別的可點目標**:同類目標並排時,外擴量以**相切零重疊**為上限。現成的算法在 `carousel.tsx:409`(指示點外擴那行的註解):
  點 6px + 間距 6px → 中心距 12px,所以水平只能各外擴 3px,「再寬必互搶點擊」。
- **不得蓋住別人的把手**:反過來也成立 —— 鄰居不得蓋住外擴出去的那一截。`resize-handle.spec.md:97` 已經寫明
  鄰格不得蓋住把手外側,`resize-handle.spec.md:67` 給了 `z-index: 1` 的機械作法與閘。
- **不得推遠浮層錨點**:掛 tooltip / popover 的目標,外擴會把浮層的錨點跟著推走(`agent-panel.spec.md`「不外推」條,:463-464)。
  這種目標基本上就不該外擴。

## 命中區現況盤點(2026-09-24 自行 grep;方法見末節)

「可視」= 使用者眼睛看得到的那塊(對圖示鈕而言就是懸停底色,不是圖示字面);「命中」= 真正收得到 pointer 事件的盒子。

| # | 目標 | 可視形狀 | 命中區 | 關係 | 判定 |
|---|---|---|---|---|---|
| 1 | `ItemInlineActionButton`(Tag dismiss / Field endAction / TreeItem / Menu / DropdownMenu / DataTable 巢狀 chevron / 各 panel 列 / **Sidebar 列鈕與群組鈕**全走它)| 懸停底色 18 / 18 / 22(`item-anatomy.tsx:128-132`)| 同一塊 —— 底色 span **刻意沒有** `pointer-events-none`,溢出的 1px 自己接住點擊再冒泡到 button(`item-anatomy.tsx:730`)| 相等 | ✅ **2026-09-24 依 user 裁示修正並實測**:側欄列鈕量到 按鈕盒 16×16 / 懸停底色 18×18 / 圖示 16×16;底色邊緣**內** 1px 四面探針全打到它自己,邊緣**外** 2px 四面分別打到列鈕與列文字(沒有隱形帶)。修前命中 16.75×16.75,右緣與下緣各短約 1.25px |
| 2 | `Button iconOnly`(Pagination 上下頁等)| 整個 button 盒(底色填滿)| 同一個盒 —— `aspect-square p-0`(`button.tsx:374` `ICON_ONLY_BASE`,`:536` 套用)| 相等 | ✅ |
| 3 | `AgentFabDock` 主鈕(家 40 / 貼邊 28)| button 的 border box(圓角也在 button 上)| 同一個盒,並有機械閘逐點驗(`agent-panel.spec.md`「遮擋與貼邊」段 :457-504,`scripts/agent-fab-hit-area-invariant.mjs` H1/H4/H5)| 相等 | ✅ 本規則的原點 |
| 4 | `Slider` thumb | `h-4 w-4 rounded-full`(`slider.tsx:166`)| 同一個盒,無外擴 | 相等 | ✅ |
| 5 | `FileItem` 整列主動作 | 整列 | 整列;透明覆蓋 button 是 `pointer-events-none`,只收鍵盤(`file-item.tsx:332-338` `keyboardPrimaryAction`,理由在 `file-item.spec.md`「Row primary action 鍵盤可達且不 nested-interactive」條 :423)| 相等 | ✅ |
| 6 | `ResizeHandle` 的 1px 線 | 1px 線(距外緣 3px)| 7px 命中區,外推 3px(`resize-handle.tsx:15`,`resize-handle.spec.md:65` `:67`)| 命中 > 可視 | ✅ **線的例外,理由與世界級對照(含 URL)已在該 spec** |
| 7 | `CarouselDots` 指示點 | 6×6 圓點(現張 24×6)| 12×24(現張 30×24);垂直 ±9、水平 ±3(`carousel.tsx:411`)| 命中 > 可視 | ✅ **點的例外,2026-09-24 逐案裁定並實測**:理由 / 外擴量 / 三家原始碼對照 / 實測數字都在 `carousel.spec.md`「指示點的命中區」。相鄰命中盒間隙 **0.00px**(相切零重疊);命中盒下緣在 carousel 根之內 3px(不越出宿主);帶底下是 carousel 視窗 div(非可點目標)。對照組:關掉 `::before` 命中收回 6×6 |
| 8 | `DateGrid` 日期格 | 28×28(md)的**圓**(`rounded-full`;懸停 1.5px 藍圈畫在它身上,`date-grid.tsx:491`)| 同一個圓(`date-grid.tsx:482` 起的 `day_button`,已無 `::before`)| 相等 | ✅ **2026-09-24 修正**:原 `before:-inset-[2px]` 名義 2px、**實測最遠外推 9.33px**(`::before` 是方的,把圓四角外面也吃進去),非線非點吃不到例外 → 移除,改用根因層作法「只在指標真的離開整張格陣時才清停留日」(MUI 同款,`date-grid.tsx:193` `data-day-grid` + `handleDayMouseLeave` :300 / `handleGridMouseOver` :319)。修後圓內 2188 點全命中 0 漏、圓外最遠 1.10px(抗鋸齒容差內);跨格不閃實測框最少 17 格,對照組拔錨點掉到 0。**2026-09-26**:可點日子方格裡、圓以外的四個角與格間縫,指標經過時停留日照舊(角不再閃,實測偏離中線 6–14 步 → 0);預覽亮著時在縫或角裡點下去 = 確認預覽的那一天(一-6,是整個元件確認預覽、不是圓外擴;沒有預覽時點了沒反應)。全文 → `date-grid.spec.md`「日期格的命中區 = 可視形狀」(那節寫明藍圈就畫在這顆圓上,所以可視形狀 = 懸停回饋形狀)「縫與角裡的點擊」 |
| 9 | `Calendar` 月檢視的日期數字鈕 | 今天:24 高的 `bg-info` pill;平日:只有數字字面,沒有任何形狀(`calendar.tsx:615` 起的日期鈕)| `min-w-6 h-6` = 24×24(同上)| 相等(真正的目標是**整格**)| ✅ **2026-09-24 逐案裁定 + 實測**:懸停回饋是整格 `hover:bg-neutral-hover`,而整格正是命中區(cell div 的 onClick)。右上角數字鈕不是第二個目標,是同一目標的鍵盤入口 —— 自己零 hover 樣式(掃全 stylesheet 命中它的 `:hover` 規則 = 0 條)、平日底色恆透明、完全落在格內。24px 圓盒是**今天 pill 的高度 + 焦點框幾何**,不是最小點擊尺寸;原註解「WCAG 2.5.8 ≥24」已撤回(`calendar.tsx:654`)。全文 → `calendar.spec.md`「命中區」條(:164) |
| 10 | `SidebarGroupAction` / `SidebarMenuAction` | 懸停底色 **18×18**(實測) | 同一塊 18×18 | 相等 | ✅ **2026-09-24 兩次修正**:(1) 拿掉 `after:-inset-2 after:md:hidden` 那圈只在 `<md` 生效、每邊 8px 的隱形帶 —— 實測上下各越出宿主 `<li>` 2px 並蓋掉緊貼的下一列列鈕(兩列間距實測 0.00px);(2) 發現它們本來就是 **shadcn 原樣帶進來的手刻品**(`b7b34721`),寫死 `w-5` = **16 圖示裝在 20 盒裡**,而 `inline-action.spec.md` 的尺寸表只有 16/18 與 20/22 兩種組合,**20 兩種都不是** —— 同一個檔案 `:826` 的收合箭頭早就在消費 `ItemInlineActionButton`。依 M23 / M30 改為委派 primitive,API 隨之從 children 改成 `icon` prop(breaking,刻意不留 children 後備:M23(f))。全文 → `sidebar.spec.md`「行內動作的命中區 = 懸停底色」
| 11 | `Steps` sm 指示點 | 8×8 圓點(`steps.tsx:20-24` `INDICATOR_SIZE.sm`)| **它不是命中目標** —— 24 的盒掛在 `aria-hidden` 的 `<span>` 上(`steps.tsx:775-778`),真正可點的是整列 header(`steps.tsx:526-527` `StepItemHeader`,`role="button"`);實測打在點正中心,收到事件的就是那一列 | 無外擴可言 | ✅ **2026-09-24 正名 + 逐案裁定**:`SM_HIT_AREA` → `SM_INDICATOR_BOX`(`steps.tsx:41`),它是排版欄寬(`INDICATOR_BOX_WIDTH`,`steps.tsx:43-47`)不是命中區。header 無懸停底色 → 依契約退化條款,判準回到可視形狀:命中 = header 自己的盒,一個 `-inset` 都沒有。全文 → `steps.spec.md`「指示點不是命中目標」 |
| 12 | `Rating`(可以點的評分;2026-09-26 起只有整星,唯讀改精簡版「★ 4.7」不在本表) | 每顆星自己的 24×24(md)盒;星形 glyph 是裝在裡面的**內容** | 同一個盒(`rating.tsx` `StarIcon`)| 相等,**零外擴** | ✅ **2026-09-24 逐案裁定**:實測命中盒 = icon 盒 24×24、逐點擁有者地圖無一點漏接。glyph 比盒小是契約明文允許的「內容」;若改成貼星形輪廓,星角凹口會變成點不到的死區 = 踩到契約的另一邊。**2026-09-26**:星與星之間的 4px `gap-1` 與上下留白,預覽亮著時點下去 = 確認預覽值(一-6,是容器確認預覽、不是某顆星外擴)。全文 → `rating.spec.md`「命中區」 |
| 13 | `DataTable` 選取欄(列身格 + 表頭全選格)| checkbox 本體 16×16;懸停回饋在**整列** | **整格**(約 40px),容器 div 掛 `onClick` + `cursor-pointer` | 命中 ≠ 懸停回饋形狀 | ✅ **不適用本規則**。2026-09-24 我曾拿本規則把這格的 `onClick` 拿掉,**當天改回來** —— 四家一手原始碼顯示「hover 畫在列、點擊目標卻是格」是常態(0/4 支持我的前提),且**沒有任何一家讓選取格的留白變成死區**。完整經過寫在 `data-table.tsx` 該段長註解與上方「適用範圍」節 |
| 14 | `DataTable` 排序表頭左區 | 整個左區,懸停回饋是 `hover:text-foreground` | 同一個左區(`role="button"` + `tabIndex` 就掛在它身上) | 相等 | ✅ 同上，表格不適用本規則;這一列本來就沒有隱形帶 |

**第 4 輪掃描的完整結果(16 處非互動元素上的 onClick,逐處判定)**:合規 13 處 —— `FileUpload:401`(`role="button"` 的投放區,整區就是可視邊框內)、`FileViewer:1109`(lightbox 暗底點擊關閉,暗底本身可見)、`MenuItem:286`(整列懸停底色 = 整列命中)、`AgentPanel` 選項卡 ×2(搜 `group/agent-option`;選項卡 `bg-secondary` 常駐可見,整張卡即命中;內含真 `Checkbox` + `label` 故鍵盤可達;2026-09-26 起滑到整張卡時卡內的圓 / 方框照自己被 label 滑過的樣子變,一-4)、`Rating` ×3 / `Calendar` ×3 / `Steps` / `FileItem` 皆已在上表逐案結案。待判 3 處即本列。

**盤點方法**(可複驗,**四輪**):`grep -rn "HIT_AREA\|hitArea\|hit-area\|hitSlop"`、
`grep -rn -- "-inset-\|before:absolute\|after:absolute"`、
`grep -rn "pointer-events-none"`、
**`grep -rn "onClick" | grep -v "<button\|<Button"`(掛在非 button 容器上的點擊委派)**,
四輪掃 `packages/design-system/src`(排除 `*.stories.tsx`),
再逐檔 Read 確認「誰是 button、誰是 `aria-hidden` 的裝飾層」。第 11 列就是只靠字串會誤判、要 Read 才看得出來的那種。

⚠️ **第 4 輪是 2026-09-24 補的,補之前這份盤點是不完整的**:原本三輪全在找「元素外面長出一圈」的字串簽名,
但「把 onClick 掛到父層容器」這種形狀一個簽名都不含 —— 於是第 13 列(DataTable 選取格)整個看不見,
而「12 列」被當成「全部」。這是 M37 第八種形狀:**「沒觀察到」被當成「沒發生」**。
任何時候說這張表掃完了,先問一句:**我的儀器看得到這種形狀嗎?**

## user 原話(逐字,標明哪句是哪次)

**2026-09-04(AgentPanel 入口鈕,拍板 = 首次立規)** —— 原文住在 `packages/design-system/src/components/AgentPanel/agent-panel.spec.md`「遮擋與貼邊」段「命中區 = 可視形狀本身」條(:457-458):

> 「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」
>
> 「當我點擊按鈕的任何地方包括左側靠近邊邊的地方,只要還在按鈕範圍內就應該觸發事件」

同段第 459 行的「看得到的每一點都點得到、點得到的每一點都看得到」**是本 DS 規格自己的措辭,不是 user 逐字**(M36(a):
引不出原話就不得標成 user 原話)。它是上面兩句的等價改寫,本檔沿用它當口訣,但出處記在這裡。

**2026-09-24(inline action,升成全 DS 預設)** —— 對話裁示,本檔為首次落地,逐字轉錄(原話為問句語氣,依 M36 不得刪語氣詞):

> 「重點是要讓 inline action 的可點擊範圍跟其 hover 底色一樣吧?都是 18*18」

也就是:inline action 的**懸停回饋就是那塊底色**,所以命中區 = 懸停底色 = sm/md 18、lg 22;
裡面那顆 16(lg 20)的圖示是**內容**,比命中區小是正常的,不需要對齊。

核准不是上面那句問句(M36(a):問句 ≠ 拍板),是待辦總帳 B1 的 user 原話:「「側欄按鈕從 20 改成 18」這按照我們的ds設計規則改的，可以通過」(`governance/planning/2026-09-25-interaction-and-hover-remediation.md` B 區 B1)。**「升成全 DS 預設(不只 AgentPanel)」與「線與點是唯一例外形狀」是 AI 從這兩次裁示推導的**,全 repo 查無「第 3 項裁示」這種原話 —— 本檔 2026-09-27 以前把它們標成 user 拍板,已更正(來源總帳)。

**2026-09-25(滑過底色要不要加、巢狀、表格列)** —— 原文逐字記在待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` B 區 B12 / B2 / B7 列:

- #33:「要點了會有反應的才加，並確保加上去之後不會有任何視覺奇怪的地方，且按鈕的互動樣式也是自然疊加上去吧？用再亮一層這樣的措辭是否不夠精準？」→ 滑過原則一-5、二-2
- #4:選「卡片保留、按鈕再亮一層 (Recommended)」(選項由 AI 提供)→ 五
- #3:「照你建議就是維持現狀，對嗎？」(問句,AI 答是;依 M36 不刪語氣詞)→ 三-2 例外①

**2026-09-25〜26(N50:滑過有變化的位置要點得到)** —— 同一份總帳 N50 列與〇節:

- 提問:「另外基於上述，「Hover會有變化的範圍與可點擊範圍一致」，往這樣的方向去寫原則是否比之前你定義的那條更精準通用？仔細全盤研究查查」
- 釐清原意:「我滑到某個區塊但不是滑到文字上但文字卻變色了，此時表示產生了樣式變化，儘管沒滑到文字上，此時點擊也應該要有反應，我的意思是這樣」→ 一-1
- 反方向:「應該也不用一定要規定可以點擊的地方就一定要有樣式變化吧？」→ 一-2
- 範圍:「本身不能點就不在這個原則規範的範疇裡吧？我們在討論的不都是可以被點擊的東西嗎？」→ 第一條只管能點的;不能點的另寫在二、三、四(補空白,不是改第一條的範圍)
- 同意(09-26,對 AI 寫的「可點的元件:滑過讓它有變化的位置點下去要觸發;不要求點得到的地方一定要有變化」與改寫 09-24 那句通則):「1. 我同意」

**2026-09-26(三種用途與整份原則)** —— 同一份總帳〇節「09-26 同意清單回覆」「09-26 第三輪回覆」:

- user 轉來的提議(原話稱「他所說」):三種用途(操作可點、操作揭露、資訊揭露)與「不可點擊的元件可以有 hover 回饋，但必須有明確的閱讀、資訊揭露或操作揭露用途；其視覺表現不應讓使用者誤認整個區域可以點擊。沒有上述用途的靜態容器，預設不提供 hover 樣式。」,並要求「仔細研究看看到底他所說是否正確並做研究，確保我們訂出一個完整符合我們一致的設計原則且不違背世界級的設計，且可以套用在任何情境都能合理解釋」。
  AI 研究後改了四處(滑過原則的措辭就是結果):拿掉「預設」(沒寫條件的後門);「不應讓使用者誤認可以點擊」照字面會撞 #3,改成例外清單 + 靠游標分(三-2);叫出按鈕的宿主分「本身能不能點」兩種(二-1、二-2);補上預覽(一-6)。
- 對整份原則:「滑過原則確保足夠通用合理且可以合理解釋各種情境且符合我們一致的設計語言也不違背世界級的設計就可以。」
- 圖表:「圖表灰帶確保符合我們一致的設計語言且視覺上合理就可以」→ 三-2 例外②
- 評分:「唯讀直接一律給精簡版就好吧？搞得這麼麻煩幹嘛？其他照你建議」→ 四(唯讀精簡版)。一-6 評分星星縫裡點下去 = 確認預覽值**不在這一題**,是「其餘建議」那題列的項目、user 未另提 → AI 判讀為照建議做
- AI 面板選項卡(提問;AI 選項卡 (E) 之後列入 09-26 寫入清單,user 選「同意，寫入」):「我覺得好像不用加上底色變化，若它是 radio 的話，那滑到整個 radio item 應該跟原本的radio item有一樣的設計語言？仔細研究查查原本hover radio item會長怎樣？全盤確認。」→ 一-4

2026-09-24 以前的兩段原話目前**沒有 repo 內的其他檔案出處**(本檔是首次落地),所以逐字轉錄在上面;
日後若有人要引用,引本檔這一節,不要再改寫。2026-09-25 之後的原話以待辦總帳為第一手紀錄,本節是逐字副本。

## 這條規則的來源總帳(M36:區分 user 拍板與 AI 推導)

| 內容 | 來源 | 性質 |
|---|---|---|
| 命中區 = 可視形狀(AgentPanel 入口鈕) | user 2026-09-04,原文 `agent-panel.spec.md`「遮擋與貼邊」段 :457-458 | **user 拍板** |
| 「看得到的每一點都點得到、點得到的每一點都看得到」這個措辭 | `agent-panel.spec.md:459` | **本 DS 規格的改寫**,不是 user 逐字 |
| 升成全 DS 預設(不只 AgentPanel) | AI 2026-09-24 從 inline action 的裁示推導;全 repo 查無「第 3 項裁示」原話(2026-09-27 更正,先前誤標 user 拍板) | **AI 推導**,隨整份原則由 user 條件式同意 |
| inline action 命中 = 懸停底色(18 / 18 / 22) | 提問 user 2026-09-24 逐字:「重點是要讓 inline action 的可點擊範圍跟其 hover 底色一樣吧?都是 18*18」(問句,不是拍板);核准 = 待辦總帳 B1 user 原話:「「側欄按鈕從 20 改成 18」這按照我們的ds設計規則改的，可以通過」 | **user 拍板**(B1 原話;2026-09-27 更正,先前把問句當拍板) |
| 不以觸控尺寸建議當依據 | user 2026-09-24 逐字:「我們在做的是 web component,不要一直拿觸控裝置的設計原則來規範,滑鼠的指標是可以比手指頭精細很多的」 | **user 拍板** |
| 「線與點」是唯一例外形狀 | AI 2026-09-24 推導(可視形狀先天當不了目標的才准外擴);全 repo 查無「第 3 項裁示」原話(2026-09-27 更正,先前誤標 user 拍板) | **AI 推導**,隨整份原則由 user 條件式同意 |
| 外擴不得越出宿主 / 不得蓋住別的可點目標 | user 2026-09-04,原文 `agent-panel.spec.md`「不外推」條 :463-464(「外推會生出隱形帶,搶走底下內容的點擊」) | **user 拍板的後果敘述**,條文化由本檔完成 |
| 相切零重疊的上限算法 | `carousel.tsx:409-411` 既有實作 | **既有 code 的既成作法**,本檔只是引用 |
| 上表的**初次盤點**(當時 12 列) | 2026-09-24 grep + Read(三輪字串簽名) | **AI 盤點,且不完整** —— 第 13 列證明三輪掃不到「父層掛 onClick」這種形狀,已補第 4 輪 |
| 第 7 / 8 / 10 / 11 / 12 列的**逐案裁定與修正** | 2026-09-24 逐列實測(真 `page.mouse.click` + `elementFromPoint` 逐點掃描,每一條都附「該紅會紅」的對照組),依上方三條 user 裁示機械落地 | **AI 依既有裁示執行**;判定理由與實測數字住在各元件自己的 `spec.md`,本檔只記結論 |
| 第 9 列(`Calendar`) | 2026-09-24 逐案裁定 + 實測,結論在 `calendar.spec.md`「命中區」條(:164) | **AI 依既有裁示執行**;已結案改判 ✅ |
| 第 13 / 14 列(`DataTable`) | 2026-09-24 先改錯、當天依四家一手原始碼改回 | **AI 錯誤外推後撤回** —— 原因是拿控件層的規則套到表格的格,沒做 M8/M26 benchmark |
| 「列不可點時,格內留白不得掛 onClick」 | AI 2026-09-24 從 Carbon 的 row hover 句子推導 | **已撤回** —— 四家一手原始碼全否證;那一步是我自己加的 |
| 「有格線 → 整格可點」這條因果 | 推導 | **查無一手依據,不採納** —— AG Grid 的 `columnBorder` 預設就是透明色,同一份 DOM、同一份 JS,只差上不上色 |
| 滑過原則的骨架(三種用途) | user 2026-09-26 轉來的提議(原話在「user 原話」節) | **user 轉述的提議**;AI 研究後改四處 |
| 一-1、一-2 | user N50 | **user 同意**(「1. 我同意」) |
| 一-1「預覽」兩字、一-6 | AI 補;日期縫與角 (D) 列入 09-26 寫入清單、user 選「同意，寫入」;評分星星縫是「其餘建議」那題 user 未另提 → AI 判讀 | 日期:user 同意寫入清單;評分:AI 判讀 |
| 一-3 游標 | 現行正本;「DS 網頁慣例、不是世界級共識」是 AI 依一手原文更正 | 現行 + AI 更正 |
| 一-4「屬於它的標籤元素的整個盒子」 | AI 推導(原稿寫「看得見的標籤」,照字面 DS 自己的單選就違規 —— 整行 label 右邊的空白點得到、圓會變 —— 已改) | **AI 推導**,隨整份原則由 user 條件式同意 |
| 一-5、二-2 | user #33 | **user 拍板** |
| 二-3 | 現行 `keyboard-model-canonical.md`(該句自標 AI 推導) | 現行 |
| 三-1「不能點不准手形」 | AI 從一-3 推出的反面 | **AI 推導**,隨整份原則由 user 條件式同意 |
| 三-1「一般箭頭」(不用問號游標) | 2026-09-26 user 對 ⓘ:「I 可以從手形改掉，若改掉更合理的話」;AI 研究後提出箭頭 | **user 選「同意,照清單寫入」**;選箭頭而非問號游標是 AI 依 M23 的建議 |
| 三-2 例外① 表格列 | user #3(問句確認) | **user 確認** |
| 三-2 例外② 圖表滑過指示 | user 2026-09-26「圖表灰帶…」 | **user 條件式同意**;顏色(`--neutral-hover` / `--border`)是 AI 依條件落地並實測(`chart.spec.md`) |
| 三-2 區間格維持原色、五 頭像挖空、選項卡整張卡是標籤 | AI 建議,列入 09-26 寫入清單(試算表 (a)(b)(c)、頭像挖空 + 「+N」secondary (B)、AI 選項卡 (E)),user 對整份清單選「同意，寫入」(待辦總帳「09-26 第三輪落地」:110 /「09-26 第四輪研究結果」:122) | **user 同意寫入清單**(逐項未點名,選項由 AI 提供;2026-09-27 更正,先前標「AI 判讀」) |
| 五 巢狀 | user #4 | **user 拍板** |
| 五 提示卡 | user N50 補充② + WCAG 2.2 SC 1.4.13 | **user 同意** |
| 滑過原則整份措辭與判斷順序 | AI | user 2026-09-26 條件式同意(條件原話在「user 原話」節) |
| 「沒有懸停回饋的按鈕」那句只管按鈕、不當全 DS 通則 | AI 改寫,user N50 同意 | **user 同意** |

## 交叉指向

- 焦點框(鍵盤游標長什麼樣、往內往外)→ `focus-canonical.md`。**與本檔互不決定**。
- inline action 的實際尺寸表(含「可點範圍」欄)→ `packages/design-system/src/patterns/element-anatomy/inline-action.spec.md`「尺寸對照」。
- AgentPanel 入口鈕的完整推導與機械閘 → `packages/design-system/src/components/AgentPanel/agent-panel.spec.md`。
- 拖曳把手(線的例外的既有範本)→ `packages/design-system/src/patterns/resize-handle/resize-handle.spec.md`。
- 滑過時用什麼顏色、巢狀怎麼疊 → `packages/design-system/src/tokens/color/color.spec.md`「Hover 換色配對總則」。**滑過要不要有變化以本檔為準**。
- 滑過回饋不做過渡 → `packages/design-system/src/tokens/motion/motion.spec.md`「hover 回饋不做過渡」。
- 滑過才出現的按鈕、鍵盤怎麼走到 → `keyboard-model-canonical.md`。
- 圖表的滑過指示(例外②)的顏色與實測 → `packages/design-system/src/components/Chart/chart.spec.md`「滑過指示」。
