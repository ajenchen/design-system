<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline(M22(d) 顯式撤回;本檔 frontmatter 無 benchmark list,來源 URL 未補)。 -->

# LayoutSpace 設計原則

Layout Space 定義頁面與容器的巨觀間距 token,隨 density 自動縮放(透過 `data-density` 或 `data-layout-space`)。另 **co-locate 一組 item 級 micro token** `--item-gap-label-desc-*`(label ↔ description 2px gap,概念 owner = `patterns/element-anatomy`,見下「Co-located:item-gap tokens」)。

## Token 表

| Token | md | lg | 語意 |
|-------|----|----|------|
| `--layout-space-loose` | 16px | 24px | 主間距:容器水平 padding、parallel 元素 gap、bounded region 呼吸空間 |
| `--layout-space-tight` | 12px | 16px | 緊湊間距:Header → element、functional 交互的元素之間 |
| `--layout-space-bottom` | 48px | 48px | 結論留白:一塊 body 的最後一個 element(含按鈕)→ body 底(容器會擋住頁面或高度撐滿時;規則 4 第 1 列)|
| `--layout-space-viewport-inset` | 48px | 48px | 浮層外殼到視窗邊的安全距離(Dialog 的高度上限與最大寬度都吃它;AppShell 的 AI agent 浮層左側、Menu 浮層右側「至少留」也吃它 —— user 2026-10-14 規格「另一側至少保留 48px」,`../../components/AppShell/app-shell.spec.md`「版面規則」§9)|

**Co-located:item-gap tokens** — `layoutSpace.css` 另定義 `--item-gap-label-desc-{reading,reading-lg,scanning,scanning-lg}`(皆 2px):**非**巨觀 layout token,是 item 內 label ↔ description 的 typography-mode-aware micro gap;設計 SSOT 在 `item-anatomy.spec.md`「Label ↔ Desc 間距」段,本檔只是 CSS 住所。修改值 / 加 mode → 走 item-anatomy spec。同一處另住 `--item-gap-eyebrow-title`(2px,浮層標題區小標 ↔ 標題):設計 SSOT 在 `patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」標題區,本檔同樣只是 CSS 住所。

**為什麼 viewport-inset 要跟 bottom 分開**(2026-09-11):兩者值都是 48px,但語意不同 ——
`bottom` 是「body 收尾的結論留白」,`viewport-inset` 是「浮層外殼 → 視窗邊」。
Dialog 原本借用 `bottom` 當 inset,後果可驗證:任何人依本表語意去調結論留白,會同時改掉全站 Dialog 的
**高度上限與最大寬度**(M17「同值不同義」)。它同樣不隨 density 變(理由同下)。
owner spec = `components/Dialog/dialog.spec.md`「高度」段。

**為什麼 bottom 不隨 density 變**:48px 是「結論留白」— body 收尾的視覺暫停。跟 density 無關(不論 compact 或 comfortable,使用者都需要這一拍)。

---

## 元件角色:`region` / `element`(scope-relative)

**沒有元件級固定分類** — 角色是元件在「該層 layout」裡扮演的,不是元件本質。CSS `display` 跟此分類**無關**(避免撞名,2026-04 從 v1 `block` / `inline` 改為 `region` / `element`)。

| 角色 | 定義 |
|------|------|
| **region** | 寬高占主要空間(寬度撐滿、高度通常 flex-1 撐剩餘)/ 視覺畫布 / 該層展示主角 |
| **element** | 局部塊 / 控件感 / 寬高自然 |

### region 子分類

| 子類 | 條件 | 視覺邏輯 |
|-----|------|---------|
| **bounded** | 有視覺邊界:底色 / 邊框 / 明確上下分隔線(Card / Table with borders / Panel with chrome)| 邊界清楚,容器靠 outer padding 給 spacing |
| **unbounded** | 無視覺邊界:純 vertical collection,**靠 list 自帶 py + item 自帶高度**撐起視覺平衡(Cmd+K menu / Sidebar nav / unstyled list)| 邊界由 list 自帶 py 完成,outer padding = 0 才視覺對稱 |

### 判斷 3 題(scope-relative)

每進一層 layout container 重新判斷該層的子元件:

1. 該層占主要空間嗎?(寬+高占主導 → region;局部 → element)
2. 視覺重量是「畫布」還是「控件」?
3. 是該層展示主角,還是一塊區段?

任何元件(list / table / code block / image / form section / chart / sidebar)都套同邏輯。例:
- Page body 直接放 Table → Table = bounded region(該層展示主角 + 有 borders)
- Cmd+K menu list → list = unbounded region(主角 + 無 chrome,自帶 py)
- InfoPanel 內 DescriptionList → element(只是一塊,不主導)。**chrome 標頭底下第一個東西有完整的形狀邊界(底色 / 邊框)→ 照 bounded region 算,標頭 → 它 = `loose`,上與左右對稱**(規則 2 表第 1 列;表上明列 element 的欄位 / 按鈕 / Alert 有框也照 element;例:AgentPanel 對話區第一則是我方氣泡 —— 有底色、寬最多 85%,`../../components/AgentPanel/agent-panel.spec.md`「3. AgentConversation」;DataTable 巢狀篩選面板第一個灰底群組框,`../../components/DataTable/data-table.spec.md`「巢狀群組的間距」)。出處:user 2026-11-14 在 A5 成品頁的留言 ①(貼在「標題列到第一則訊息,改之前」那張圖,逐字)「我覺得原本才是比較美觀的，且當初也是有特意把第一則訊息頂改成 16,主因為第一個元素是有完整的形狀邊界的，改成16之後其上左右才會在視覺上對稱，就像表格為第一個元素時上方也是 loose ，因為通常其左右也是 loose,其他密度也是依此類推吧？關於煮內容區的第一個元素與上方的距離，你看我說的是否有理」—— 「我覺得原本才是比較美觀的」是陳述;理由與「其他密度也是依此類推吧？」「你看我說的是否有理」是問句,AI 評估同意:跟本檔「region 子分類」表 bounded =「有視覺邊界:底色 / 邊框」、規則 2 表 bounded → `loose` 一致,兩種密度都是 `loose`(md 16 / lg 24)。這一段看的是第一個東西是不是**一塊有完整外框的內容**(卡片、表格、面板、訊息氣泡、群組框),是就照 bounded,不先用上面判斷 3 題把它判成 element 再查表(下方「心智模型」Step 1 先判 region 再問邊界的順序,管的是一般的角色判斷);**控件與提示**(欄位 / 按鈕 / Alert,含一組輸入控件)雖然也有框,規則 2 表已明列為 element → `tight`,不算這一類 —— 留言 ① 照字面也會涵蓋有框的控件,這裡照表上既有的列把它們排除【AI 推導 2026-11-14】;決策卡的選項卡有框,但它們是一組輸入控件(RadioGroup / CheckboxGroup)= 上面括號裡「表上明列 element 的欄位 …… 有框也照 element」那一類 → `tight`(規則 2「適用範圍與量法三點」(2) 段末)。【更正 2026-11-14】2026-11-13(A5)這裡寫過「對話訊息流(AgentPanel 的 AgentConversation)裡的每一則訊息同理 → element …… 不能拿底色反推它是 bounded region」,把有底色的我方氣泡判成 element、對話區頂距改成 `tight`;留言 ① 說原本比較美觀(陳述)、並問這個理由是否成立(問句),AI 評估同意、改回 16 / 24,那一句拿掉
- Field 內 Textarea → 不獨立分類(Field 整體才是該層的 element)

### Region 數量 invariant(2026-04-30 codified)

**Container body(vertical stack)通常最多 1 個 region — 罕見會多**。理由:
- region 多為 `flex-1` 撐剩餘 → 兩個並存競爭 flex space
- Multi-functional-group 慣用 **list group 切分**(`item-anatomy.spec.md` group separator)或多個 element,不另增 region
- **Unbounded + bounded 並存違 scroll affordance**:unbounded 無邊界 vs 內部 scroll 必須 bounded chrome 讓 user 知道可捲

**多 region 慣用 horizontal layout**(left-right panes / grid columns,Sidebar + Main + InfoPanel)。Vertical 多 region 罕見場景 → 走規則 3 親疏判 + consumer compose。

---

## 親疏 3 級(替代 v1 簡單 block-adjacent)

判斷兩元素的 spacing 規則前,先確定它們屬哪一級:

| 級別 | 條件 | layout rule? |
|------|------|------------|
| **同範疇 / bundled component family** | 元件 spec 寫成 bundle 並定 inter-component spacing(FileUpload+FileList、Pagination 內部、Toolbar+ButtonGroup) | 元件 spec own,layout rule **跳過** |
| **跨範疇 + 直接 functional 交互 / 依賴** | search → filter list / toolbar → table / 標題(+ 說明)→ 它底下**只有一塊**的內容(一張表 / 一張圖 / 一份清單 / 一個元件)| 規則 3 = **tight** |
| **跨範疇 + parallel / independent** | form fields stack(parallel inputs)/ unrelated sections / 兩個獨立 functional groups / 標題(+ 說明)→ 它底下**兩塊以上**的內容 | 規則 3 = **loose** |

「**Bundled component family**」客觀判斷:**有沒有 spec 文件把這些 components 寫成 bundle 並定義它們之間 spacing**(不是「同種類 component instance 多個」)。

「**Functional 交互 / 依賴**」具體:操作後在畫面上有交互(value 驅動 display)/ labeling(替緊鄰的那一個東西命名:範例 ↔ 它的 ExampleCaption、圖例 ↔ 它的圖、標題(+ 說明)↔ 它底下唯一的那一塊 —— 2026-11-11 起,見規則 3「標題區 → 內容」)/ context dependency。

---

## 6 條 Layout 規則

### 規則 1:水平 padding(3 patterns 並存)

| Pattern | padding 寫哪 | 適用場景 |
|---------|------------|---------|
| **A. 元件自帶**(`px-loose` on root) | 元件 root | 有視覺邊界(border / bg / shadow / chrome):Sidebar / SurfaceHeader / Toolbar / Card / Panel |
| **B. 父層管**(consumer 或 wrapper) | 父層 div | 純 layout primitive 無邊界:Table / DescriptionList / DataTable(naked structure)|
| **C. Item 自帶**(each item `px-loose`,list naked)| 每個 item | List with hover row,hover bg 需 flush 容器邊界:Cmd+K menu / DropdownMenu items / Sidebar nav |

任何內容左右 padding 最終 = `loose`(對齊 inline 元件邊緣);**寫哪看元件本質**,不是 either-or。

Pattern C 的視覺邏輯見 `overlay-surface.spec.md`「List-as-region in overlay body」的「3 條 invariant」(hover bg 0 gutter 貼邊 + content 由 item-px 推進)。

本規則(與規則 6)在 chrome 標頭底下由 `scripts/header-content-sides-invariant.mjs` 機械檢查:同一份盤點(規則 2 那支閘的 CASES),md / lg 量「容器內緣 → 內容外框」左右都 = loose;誰給內距從 DOM 判 —— 每一列自帶(pattern C,可互動列的清單)時另要求列本身貼齊容器(0)。

### 規則 2:頂部(Header → 第一個元素)

**這裡的 Header 指 chrome header**(ChromeHeader / SurfaceHeader / page header / app top bar,`header-canonical.spec.md`);內容區裡用 typography 打的小標題(`text-heading` 之類)不是 chrome header,它與下方被它標示的內容走規則 3「標題區 → 內容」。

| 第一個元素 | Header → 該元素 |
|-----------|--------------|
| **bounded region**(table / card / panel)| `loose` |
| **unbounded region**(自帶 py 的 list / nav stack)| **0**(讓 list 自帶 py 撐 spacing) |
| **element**(input / button / alert) | `tight` |

本規則由 `scripts/header-first-gap-invariant.mjs` 機械檢查:全 DS 盤點出「chrome 標頭底下由範例自己給頂部內距」的每一處,從 DOM 判第一個東西的角色,md / lg 量「標頭底 → 第一個內容頂」比對上表。 **適用範圍與量法三點**((1)(2) 的結論是 AI 依本檔與下面點名的規格的既有句子推的,user 沒有逐字講過 ——(2) 段末引的 user 2026-11-11 原話只當旁證;(3) 依 user 2026-11-14 在 A5 成品頁的留言 ②):(1)【AI 推導 2026-11-13】上表管的是**標頭 → 標頭底下第一個內容**這一段:通常是 body 裡的第一個內容,由 body 的頂部內距給;consumer 放在 body 外、自帶左右內距的一列也算(例:`../../patterns/overlay-surface/overlay-surface.spec.md`「When list 上方有 search / banner」的 search 列,自帶 `pt-tight` = 上表 element 那一列的值)—— 這一段照上表,元件規格不另訂(規則 4 Note 對 Dialog / Sheet body 底部 48 的說法是「第 1 列的實作,不是元件特例」,頂部同理)。容器只有一個上內距、標頭底下第一個東西隨內容換的(例:AgentPanel 對話區,第一則可能是有底色的我方氣泡,也可能是沒有框的代理文字 —— `../../components/AgentPanel/agent-panel.spec.md`「3. AgentConversation」)→ 照有框的那一種給 `loose`,第一個是沒有框的東西時也是同一個值(容器不知道第一個是誰,只能給一個值)【AI 推導 2026-11-14】;閘以 `topException` 登記這一格。跟 body 並列、貼齊外殼的**結構分區**不是標頭底下的內容,不套上表:分區與分區直接相接(0),誰接誰看元件規格的 Anatomy。結構分區 = 元件規格的 Anatomy 明列為跟 Header / Body 同層的一格(例:Coachmark 的 Media 區;FileViewer 的 Viewport —— `../../components/FileViewer/file-viewer.spec.md`「Anatomy」分區決策的叫法,工具列底下那一格);consumer 自己把一塊內容貼齊外殼放在標頭下(例:滿版的有框表格)不會因此變成結構分區,仍照上表。(2)【AI 推導 2026-11-13】**標頭的分隔線被元件規格明文拿掉時**(例:AgentDecisionCard),標頭與內容之間沒有看得見的邊界,眼睛只看到一段距離 → 這一段只由一層給(同規則 4「同一段距離只由一層給」;但這裡給的那一層是標頭,不是那一句後半寫的「容器給內距」—— 標頭的下內距本來就在,body 再給一次就重複),現行做法是標頭自己的下內距給、body 頂部歸零;量法改成從「標頭內容的底」量到「第一個內容頂」= 上表的值 ——「標頭內容的底」= 標頭裡最低的那個內容的外框底(正常情況下 = 標頭外框底扣掉它自己的下內距);「內容」只算畫面上看得見的東西【AI 推導 2026-11-13】—— 有自己的字的元素、圖示 / 圖片、有看得見的框線 / 跟外層不同的底色 / 陰影的塊;外框看不見的包層(含框線與底色都透明的圖示按鈕)不算它自己的外框,往裡找看得見的東西;只有字、沒有框的元素取內容框的底(它自己的下內距是空白,不是內容);絕對定位的裝飾不算;量的時候指標移開(滑過時按鈕有底色,外框就看得見了);逐項判法住 `scripts/header-first-gap-invariant.mjs` 的頁面量具(決策卡那支閘用的是同一份);例:沒有小標的 AgentDecisionCard,× 鈕的外框是透明的、比題目那一行低 3.5 / 5.5px(一般 / 大密度),看不到、不算 —— 最低的內容是題目那一行,量到 12 / 16;把 × 的外框算進去會量成 8.5 / 10.5(這幾個數字是量到的現況)。帶分頁的標頭不算這一點:標頭自己不畫線、改由分頁列畫(`../../patterns/header-canonical/header-canonical.spec.md`「withTabs 連動」Rule W1),線還看得見,照一般情況量。這一點只講標頭這一側;footer 那一側照規則 3 段末「不適用」那句。決策卡的題目 → 第一張選項卡維持 `tight`,不套本檔「元件角色」那段 user 2026-11-14 留言 ① 的原則(第一個東西有完整外框 → `loose`)【AI 推導 2026-11-14】:選項卡雖然有框,整組是一組輸入控件(RadioGroup / CheckboxGroup)= 上表 element 那一列(input),也就是「元件角色」那段寫明「表上明列 element 的欄位 / 按鈕 / Alert 有框也照 element」的那一類 → `tight`。旁證(不是依據):標題列沒有分隔線,題目描述的就是它正下方那一組選項,跟 user 2026-11-11「完完全全在描述下方的東西？若是的話，那就是親近吧？」同一個方向;但那一條住規則 3「標題區 → 內容」,管的是內容區裡的小標題、不是 chrome 標頭(本規則開頭;規則 3 那一條的範圍說明),決策卡的標題列是 SurfaceHeader,所以只當旁證。(3)**內容在高度撐滿的容器裡垂直置中時**(例:空狀態 / 結果頁 —— `../../components/Empty/empty.spec.md`「垂直定位」有框 → 垂直置中),不套上表、也不套規則 4 的底:內容放在可用範圍正中(標頭底 → 內容頂 = 內容底 → 下一塊頂),容器上下不給「結論留白」—— 要給上下內距就兩邊給一樣的(例:DataTable 空狀態包層上下各 48,`../../components/Empty/empty.spec.md`「現有消費者」;AgentPanel 新對話空白頁包層上下都不給),左右照規則 1 = `loose`。出處:user 2026-11-14 在 A5 成品頁的留言 ②(貼在「新對話空白頁,改之前」那張圖,逐字)「這種 result 或是 empty 就不是撐滿高度的元素，且當初定位就是把它放在正中間，且一個這種容器空間內呈現狀態時，通常不會有其他元素，這種情況到底為何下面還要改成 bottom ，bottom 是創造一個空間用來表示內容已經結束了吧？但當內容區的元素很明顯的就表示該區只有這些元素，像是’撐滿容器’的 table ，或是此類’垂直置中’的狀態，到底為何還要下方有bottom?」—— 前半(結果 / 空狀態不是撐滿高度的元素、當初就定位在正中間、這種狀態通常不會有其他元素)是陳述,後半是問句,AI 評估同意:規則 4 的 `bottom` 是「結論留白」(內容從上往下排到底、表示結束了),垂直置中的狀態不是從上往下排的內容。機械:`scripts/header-first-gap-invariant.mjs` 的置中格(量上下兩段相等)、`scripts/header-content-sides-invariant.mjs` 的置中格不比底、左右照舊。【更正 2026-11-14】2026-11-13(A5)這一點寫成「上表的值寫成容器的上內距,內容在內距框裡置中」,空狀態的包層因此補了上 `tight` / 下 `bottom`、往上偏 18 / 16px;留言 ② 問垂直置中的狀態為何還要 bottom(問句),AI 評估同意,拿掉、改寫成上面這樣。

### 規則 3:元素間 gap(**只看親疏,role 無關**)

| 親疏 | gap |
|------|-----|
| **同範疇 / bundled** | 元件 spec own(跳此 rule)|
| **跨範疇 + functional 交互** | `tight` |
| **跨範疇 + parallel** | `loose` |

**標題區 → 內容**(2026-11-11;標題區 = 內容區裡的小標題 + 它的說明,不是 chrome header):**標題底下只有一塊 → `tight`;兩塊以上 → `loose`**(那幾塊彼此隔 tight 還是 loose 都一樣 —— 2026-11-12);底下是一段文字 / 清單(段落)→ `tight`(不變)。

- 出處:user 2026-11-11 逐字「我覺得主要取決於那個標題和說明是否是完完全全在描述下方的東西？若是的話，那就是親近吧？如果是描述下方的多個東西，那確實是用loose沒錯？應該是我上述說的這樣？？」;同日決策頁「說明頁:甲」= 文件頁(設計原則頁、展示頁、設計規格頁)也照這條。兩塊以上 = loose 即 user 2026-10-21 A4 甲逐字「我認為標題+說明 -> 內容之間的距離應該 loose，畢竟他是所有內容的標題而非內容第一個的小標，所以內容之間是 loose的話，那內容到‘標題＋說明’也是loose吧」—— 2026-10-27 那版把本表 labeling 寫成只有「說明級的字」,只描述一塊的標題因此落到 loose,本段補上。
- 2026-11-12 兩個決定,user 逐字「第四批成品的問題都照你建議，但清除全部的按鈕用TERTIARY」(第四批成品頁上標「建議」的選項):
  - 「原則頁」題 = 「甲：維持，三種頁面同一條規則」—— 設計原則頁、展示頁、設計規格頁同一條,原則頁不是例外。
  - 「多塊緊排」題 = 「乙：有兩塊以上就維持遠的距離」—— 標題底下有好幾個示範塊時,即使那幾塊彼此只隔 tight,標題 → 內容仍是 loose(頁上寫的結果:「照你原話的字面：描述多個東西 → 遠。標題跟整組內容明顯分開；兩種密度結果一致。」)。
- **幾塊怎麼數**【AI 推導,機械可判;實作只有一份 = `stories-helpers/examples/tutorial-page.tsx` `headingContentOf`】:
  1. 只有一個節點:有視覺邊界(邊框 / 底色 / 陰影,同上方「元件角色」bounded),或它是一個元件 / 有自己語意的標籤(一個 Field、一組 Tabs、`<p>`、`<table>`、`<dl>`、`<label>` …)= 一塊 —— 元件裡面怎麼排是元件自己的事;只負責排版的容器(沒有自己語意的標籤,而且只帶 class / style / 主題與密度的範圍宣告 / FieldGroup 標記)→ 往裡看它的子節點,回到這一步。看到底沒有子節點(一張圖、一個空容器)= 一塊。
  2. 有兩個以上節點,先扣掉說明文字(沒有邊界的 `<p>`:它在說明旁邊那一塊,自己不算一塊),看剩幾塊:
     - 剩兩塊以上,彼此至少隔一格版面間距(刻度最小的一格 = md 的 `tight`)→ 兩塊以上;隔得更近 = 元件的微距(一列按鈕、一排 chip)→ 合起來算一塊。
     - 只剩一塊(一則示範 + 說明它的文字)→ 一塊。
     - 全是說明文字:段落之間隔 ≥ `loose` → 並列的好幾段 = 兩塊以上;比 `loose` 近 → 同一段話 = 一塊。
  - 「一格版面間距」的門檻是固定值、不跟密度走:門檻跟密度走的話,用固定 `gap-3` / `gap-4` 排的示範在 md 與 lg 會數出不同塊數(2026-11-12 全庫實量:2026-11-11 那版數法下,1346 個標題裡有 39 個用 lg 的距離會數成跟 md 不同;固定門檻下 0 個);值只寫在 `tutorial-page.tsx`,跟 `layoutSpace.css` 對不上由 R14 抓。
- **邊角怎麼判**(同一套數法的結果,不另訂例外):
  | 小標底下 | 判 | 為什麼 |
  |---|---|---|
  | 一張表(含外面只包一層捲動容器)/ 一張示意圖 / 一份 DescriptionList / 一個元件(一個 Field、一組 Tabs)| 一塊 → tight | 第 1 步 |
  | 說明文字 + 一張圖 | 一塊 → tight | 說明屬於標題區(標題 ↔ 說明 = `--item-gap-label-desc-*`),後面只剩一張圖 |
  | 一則範例 + 說明它的文字(ExampleCaption / 一段 `<p>`)| 一塊 → tight | 第 2 步:說明文字不算一塊,只剩一塊 |
  | 一列按鈕 / 一排 chip / 一串清單列(彼此是元件的微距)| 一塊 → tight | 第 2 步:隔得比一格版面間距近 |
  | 兩則以上範例(範例組之間 loose)/ 一個容器裡用 ≥ loose 隔開的好幾段(例:「狀態行為」底下的 Loading / Disabled / Checked 三段)| 兩塊以上 → loose | 第 2 步 |
  | 好幾則示範塊但彼此只隔 tight(規則內容寫 `paragraph={false}` 的那種)| 兩塊以上 → loose | 第 2 步;user 2026-11-12「多塊緊排」= 乙(2026-11-11 那版判成一塊 → tight,本列改掉)|
  | 用固定 `gap-3` / `gap-4`(12 / 16px)排開的好幾塊 | 兩塊以上 → loose(md、lg 相同)| 第 2 步:門檻是固定值(2026-11-11 那版 md 兩塊以上 / lg 一塊,兩種密度不一致)|
  | FieldGroup 裡的好幾個欄位 | 兩塊以上 → loose | 第 1 步:FieldGroup 是排版群組不是一個元件,往裡看;欄位 ↔ 欄位 = parallel |
- 產品畫面:主區只有一塊內容時不在主區重複放標題與說明(SSOT 在 `../../components/AppShell/app-shell.spec.md`「主區只有一塊內容時」那段,含 user 原話);有區段標題的地方同樣照本段。Steps 的步驟標題區 → 內容寫在 `steps.tsx`(範例都是一張多欄表單 = 兩塊以上 → loose,不變)。DescriptionList 的區段標題(`../../components/DescriptionList/description-list.spec.md`「Section heading 模式」)= 只描述一份清單 → tight,同一個答案。
- 機械:`scripts/section-gap-invariant.mjs` 的「標題區 → 內容」各列(一塊 / 兩塊以上各量 md / lg 像素);`scripts/tutorial-page-invariant.mjs` R14(共用元件仍由 `headingContentOf` 判、值只寫在共用元件)。

**核心**:gap 只看親疏不看 role(原 v1「block-adjacent 一律 tight」過機械,違 Gestalt proximity)。 **「組 ↔ 組」(區塊 ↔ 區塊)另有一級(2026-10-14 先定在教學頁,2026-11-06 擴到產品畫面;後來加的範圍見本段後文)**:一塊內容本身已經用 loose / tight 排好 —— 教學頁的每則規則、每個段落;產品畫面裡分屬不同主題的一塊(例:FileViewer 資訊面板的「說明」欄位、「檔案資訊」標題 + 清單)—— 塊與塊之間要比塊內更開,才分得出標題屬於哪一塊。**區塊之間 = 一條分隔線的位置,上下各 loose**(合計 **loose × 2**:md 32 / lg 48);區塊感夠時不畫線,不夠時畫 `Separator`,間距不變。出處:教學頁的規則 ↔ 規則 = 段落 ↔ 段落 = user 2026-10-07「第一題照你建議」= 建議 ②;產品畫面 = user 2026-11-06 #18 原話「#18 可以照你建議，其實感覺就像是輸入框跟下方標題之間還有一條隱形的分隔線，然後線的上下間距依然都是loose的概念，然後可能有時候若區塊感不夠的話，這個分隔線就不會是隱形的，但間距都一如往常？」(「照你建議」= 決策頁乙:產品畫面的「區塊 ↔ 區塊」也用 loose 的兩倍;分隔線那段是 user 用自己的話確認理解,句尾問號是向 AI 確認,AI 回覆一致)。並列的元素(欄位 ↔ 欄位、卡片 ↔ 卡片)仍是本表 parallel = loose。這一級**不是公開 token**(值由 loose 推出),也**不借 `bottom`**(本表 `bottom` 列的結論留白)。閘 `scripts/section-gap-invariant.mjs`。教學頁的值與元件唯一住所 `stories-helpers/examples/tutorial-page.tsx`,規範 `ds-canonical/skills/story-writing/references/category-templates.md`「教學框的間距與標題」,閘 `scripts/tutorial-page-invariant.mjs`。**Tokens / Patterns 文件頁的段落同屬這一級**(2026-10-20 user「你提的問題可以都照你建議」核准 T7 甲:各 token 頁原本段落之間只剩 loose,與段落內同一個量級,段落分不開;改由同一個 `TutorialPage` / `TutorialSection` 給 loose × 2,閘 R12)。**展示頁 / 設計規格頁「一則一個標題」的範例堆疊,範例 ↔ 範例也屬這一級**(2026-10-27 user 回「Q2照你建議」—— 採 AI 建議 ①:原本範例之間只有 loose,與標題 → 自己的內容同一個量級,看不出標題屬於哪一則)([來源](https://www.nngroup.com/articles/gestalt-proximity/))。**表單欄位 → 跟在後面的表單按鈕列(送出 / 儲存 / 取消 / 下一步)也屬這一級**(2026-11-10;修前寫成「內容 → 跟在後面的按鈕 = loose」):欄位與欄位之間是並列 = loose,按鈕列是整張表單的動作、不是再多一個欄位,所以離最後一個欄位要比欄位之間更開。出處:user 2026-11-10 PR #172 決策頁留言,指 Field 展示「表單驗證」的送出鈕,逐字「我現在覺得這個按鈕距離上方雖然按照之前訂的規則是loose token，但我總覺得看起來好像有點太近，感覺應該也是要跟 file viewer 那個說明跟檔案資訊區塊之間假裝之間有一條隱形的分隔線，所以實際是距離兩倍loose」;世界級同樣讓按鈕列比欄位間距大 —— Atlassian `@atlaskit/form@18.3.2` 表單按鈕列 `margin-block-start:var(--ds-space-300,24px)`([來源](https://cdn.jsdelivr.net/npm/@atlaskit/form@18.3.2/dist/es2019/form-footer.compiled.css))對欄位 `margin-block-start:var(--ds-space-100,8px)`([來源](https://cdn.jsdelivr.net/npm/@atlaskit/form@18.3.2/dist/es2019/field.compiled.css));Carbon 表單 Form items margin-bottom 32 / Buttons margin-top 48([來源](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/form/style.mdx))。**不適用**:浮層 chrome 的 footer(SurfaceFooter / DialogFooter / SheetFooter —— 按鈕在 footer 帶裡,上方是 body 的規則 4 收尾 + footer 自己的 chrome 內距)、單一欄位旁的行內按鈕、toolbar。閘:`scripts/section-gap-invariant.mjs` 的表單各列、`scripts/steps-content-follows-current-invariant.mjs` (5)。

世界級對齊:Material 3 / Polaris / Apple HIG / Atlassian 都按「relationship not type」決定 spacing。 <!-- @benchmark-unverified -->

### 規則 4:底部 — 拆兩個 distinct 概念

**核心**:**「內容 → 按鈕」(規則 3;表單欄位 → 跟在後面的表單按鈕列 = 規則 3「組 ↔ 組」loose × 2)跟「最後一個東西 → 容器底邊」(本表)是兩個不同 spacing 概念**,不可混為一談;容器底邊這一段跟規則 2 的頂部一樣,同一段距離只由一層給:容器給內距,元件不再加外距去推容器。

| 情境(後面有沒有 footer 都一樣)| gap | 概念 |
|------|-----|------|
| **element(欄位 / 文字 / 按鈕)→ 容器底,容器會擋住頁面或高度撐滿可用空間** | `bottom`(48)| **結論留白** |
| **bounded region → 容器底** | `loose` | **Spatial 邊界** |
| **unbounded region → 容器底** | **0**(list 自帶 py 撐)| **Spatial 邊界** |
| **element → 容器底,容器不擋頁面、高度貼著內容** | 與頂部同值(值由元件自己的內距給)| **Spatial 邊界(上下對稱)** |

**Note**:Dialog / Sheet body `pb-bottom 48` 是第 1 列的實作,**不是元件特例**。表格 → 「**底部 chrome band**」(Alert / BulkActionBar / Status bar)= 第 2 列的 `loose`,band 裡有沒有 action 都一樣。**第 1 / 4 列怎麼分**:看容器自己,不列名單 —— 會不會擋住頁面(modal)、高度由視窗 / 版面欄決定(撐滿)還是由內容決定。這兩個條件是 DS 給 / 不給 48 時原本就寫下的理由:`../../patterns/overlay-surface/overlay-surface.spec.md`『`pb-bottom` 保留 Dialog / Sheet「大容器底部多一拍」的 canonical』,Popover 不給是因為『Popover 無 viewport-fill、內容預期短』。出處:user 2026-10-28 看過 AppShell 右欄 IssueDetail、右欄訂單詳情、整頁 Main、Insights 頁、FileViewer 資訊面板依此改成 48 的前後圖,回「這個沒問題」;同日對頁面卡片(不擋頁面、貼內容 → 四邊 16)回「頁面上的卡片照你建議」。第 2 列(bounded region → 容器底 = `loose`,例:撐滿容器的有框表格)不給 48:user 2026-11-14 在 A5 成品頁的留言 ②(全文見規則 2「適用範圍與量法三點」(3))問「bottom 是創造一個空間用來表示內容已經結束了吧？但當內容區的元素很明顯的就表示該區只有這些元素，像是’撐滿容器’的 table ，或是此類’垂直置中’的狀態，到底為何還要下方有bottom?」(問句,AI 評估同意)—— 這一列的值本來就是 `loose`(上表概念欄寫的是「Spatial 邊界」,不是第 1 列的「結論留白」),不改。

**沒寫到的三種容器**(高度寫死、被 min-height 撐住、被 max-height 卡住而在捲動;上表與 Note 沒逐字寫)【AI 推導,2026-11-11 列在第三批審查頁「直接做」】:照 Note 自己寫下的理由判,不另立一列 —— Note 原句「**第 1 / 4 列怎麼分**:看容器自己,不列名單 —— 會不會擋住頁面(modal)、高度由視窗 / 版面欄決定(撐滿)還是由內容決定。」,以及「Popover 不給是因為『Popover 無 viewport-fill、內容預期短』」。48 的結論留白只給「會擋住頁面」或「高度由視窗 / 版面欄給」的容器;這三種的高度是元件自己寫的固定值或上下限,不是視窗 / 版面欄給的 → **不擋頁面時 = 第 4 列,底部與頂部同值**(與 Popover 同一邊,被上限卡住在捲的 Popover 同樣不給 48)。**擋住頁面(modal)時照第 1 列**(Dialog / Sheet body 本來就是撐滿或在捲,仍 48);高度寫死成視窗高 = 視窗給的高,仍算撐滿。2026-11-11 盤點:chrome 標頭底下登記的處所都沒有這三種(閘量到的容器種類全是撐滿或貼內容)。

本規則在 chrome 標頭底下由 `scripts/header-content-sides-invariant.mjs` 機械檢查:最後一個東西的角色與容器種類(擋住頁面 / 撐滿 / 貼著內容 / 被上限卡住 / 高度寫死或被撐住)都從 DOM 判,md / lg 量「最後一個內容 → 容器底(捲動終點)」比對上表與上一段。【AI 推導,閘的量法、不是本表的另一種定義】第 4 列「與頂部同值」量成同一處量到的頂(上下對稱;頂本身對不對由 `scripts/header-first-gap-invariant.mjs` 依規則 2 判)。2026-11-11 前三種沒寫到的容器閘一律判「待規格」不套任一列。

### 規則 5:橫排 Input Gap(固定不隨 density)

橫排並列的 input fields **固定 gap,不走 layout-space token**:

| 關聯性 | Gap | 範例 |
|---|---|---|
| 緊密相關(同一組值的起迄)| `gap-2`(8) | Sleep start ↔ Sleep end |
| 非緊密(不同組值並列)| `gap-4`(16) | Sleep 時段 ↔ Work 時段 |

**為什麼固定**:這是 field 級 micro-spacing,跟容器級 macro-spacing 是不同維度。Field gap 由**內容語意**決定(緊密 vs 獨立),不由 density 決定。

### 規則 6:Chrome 水平左右 padding(規則 1 specialization)

**所有 chrome 表面**(SurfaceHeader / SurfaceFooter / SurfaceBody / Sidebar header / FileViewer toolbar+filmstrip+InfoPanel header / app top bar / page header)**水平左右** padding 統一 `px-[var(--layout-space-loose)]`(md=16 / lg=24,density-aware)。

**為何 loose 而非 tight**:Chrome 是 surface 視覺邊界 + 內容呼吸區;`tight` 足夠 inline list item,chrome 需更穩定 anchor 讓 title / dismiss / actions 不貼邊。

**M8 8 家世界級對照**(default density 共識 16px):Material 3 Top App Bar 16dp / Carbon UI Shell 16px / Polaris Page Header 16px / Atlassian Page Header 16px / Apple HIG macOS Toolbar 16-20pt / Linear / Notion / GitHub Primer / Figma 全 16px。 <!-- @benchmark-unverified -->

**禁止**:硬寫 `px-4` / 自創值(`px-5`)/ 用 tight 當 chrome inline / 同 surface header/body/footer inline padding 不一致(三層左邊界必對齊)。

**RTL**:本系統水平 padding 一律 `px-*`(左右對稱、無方向性),RTL 下行為不變;方向性 spacing(`ps-*`/`pe-*`)未使用。

---

## 該用 token(縮放)vs 刻意固定(magic number 合法)的邊界(2026-07-01 codify)

**核心**:layout-space token(density-scaling)只管 **macro 結構間距**;**不是所有 px 都該 token 化**。硬把刻意固定值 token 化 = over-tokenize(反 pattern,跟「硬寫該縮放的 gap」同樣是 bug 的反面)。

| 該用 layout-space token(density-scaling) | 刻意固定值 OK(magic number 合法) |
|---|---|
| 並列獨立 **卡片 / 表單欄位** 之間(規則 3 parallel = loose)、**區塊 ↔ 區塊**與**表單欄位 → 表單按鈕列**(規則 3「組 ↔ 組」= loose × 2)| **同質 list 的列間距**(一串同類 rows,**且有規格定了列距**,規則 3「同範疇 spec-own」;判準見上方「親疏 3 級」的 Bundled component family 客觀判斷)|
| **Header → 內容**(規則 2 = tight)| **micro / icon / 控件內部** 間距(gap-1/2、icon padding)|
| **Chrome 水平內距**(規則 6 = loose)| **為視覺平衡 / 對稱 刻意調的值**(設計裁量)|
| **body 收尾**(規則 4 = bottom 48)| **元件自身刻意固定**(元件內部不對外的微幾何)|

> **2026-09-12 更正**:右欄原本舉的例子是「FieldGroup 三級固定 gap,不隨 density」——**那個例子跟左欄第一列自相矛盾**:
> 左欄逐字說「並列獨立 區塊 / 卡片 / **表單欄位** 之間 → 規則 3 parallel = loose」,而 FieldGroup 管的正是表單欄位之間的間距。
> 同一個概念同時出現在兩欄,是真矛盾不是細節。該例子來自 `31383ac4`(2026-07-02)的防漂移補強,
> 當時 user 問的是怎麼確保以後都遵循 layout-space、不偏移、有 SSOT(問防漂移機制,不是定表單間距;轉述 —— 那段對話紀錄已不存在、登記簿查無原話)。
> 2026-09-12 user 拍板移除 FieldGroup 的三檔 gap、改消費 `--layout-space-loose`,此豁免例子同步撤除。

**判準一句話**:是「並列/區塊/chrome/header→content/content→action 的 macro 結構間距、規則說該縮放」→ 用 token;是「list 列間距 / micro / 刻意固定 / 元件內部決定」→ magic number 合法,**不要 token 化**。

**機械強制**:`check_layout_space_magic_numbers.sh` 只自動放行 `utility-registry.json#/spacing/canonical_micro_geometry` 能用同行或有界 nearby 證據證明的子集:inline item/control、semantic homogeneous list/list row、`role="toolbar"` control cluster、以及「group 語意 + 至少兩個 nearby Field/input」的規則 5 橫排 fields。只看到一般 `flex/grid/section gap-1/2`、或同行還混有 `p-/m-/space-*` magic 都仍 BLOCK；不新增 CSS/UI token。`check_escape_marker_abuse.sh` 共用同一 classifier,已被結構證明且不再繞 gate 的舊 micro marker 不消耗 ceiling。`check_tabs_content_chrome_body_double_gap.sh` Check 2 另抓「浮層 body 自身固定 macro gap」。其餘判斷題(這是並列還是 list?macro 還是 micro?)仍靠 **週期 LLM sweep**(`/design-system-audit` dim「layout-space macro 合規」)—— 不將無語意證據的 regex 擴張成全放行(否則會 over-flag 或漏掉真 macro)。

---

## 心智模型(三步推理 + 具體 self-questions)

### Step 1 — 判角色(對單一元素)

跑上方「元件角色」節的**判斷 3 題**(占主導? / 畫布 vs 控件? / 展示主角?)— 多數 yes → **region**;反之 → **element**。

若 region 再問 1 題:有視覺邊界(底色 / 邊框 / 上下分隔線)嗎?
- 有 → **bounded**(Card / Table with borders / Panel)
- 無 → **unbounded**(menu list / nav stack,自帶 py 撐)

### Step 2 — 判範疇(對兩元素之間)

問 2 題:
1. 兩元素在 spec.md 裡寫成 bundle 並定 spacing 嗎?(eg FileUpload+FileList / Pagination 內部 / button-group + SurfaceFooter)
   - **是 → 同範疇 / bundled** → 跳 layout rule,套元件 spec own
   - 否 → 跨範疇,進下一題
2. 兩元素有直接 functional 交互 / 依賴(操作驅動 / labeling / context dependency)嗎?
   - **是 → 相關**(search→list / toolbar→table / 標題 → 它唯一描述的那一張表)→ tight
   - **否 → 不相關**(parallel / independent)→ loose

### Step 3 — 套規則(下節決策表 + walkthrough 範例)

---

## 套規則決策表(具體查詢)

「我要決定什麼?」找對應規則:

| 想決定的 | 走哪條規則 | 看哪些變數 | 答案分支 |
|---------|----------|----------|---------|
| 容器水平左右 padding | **規則 1** | 元件有無視覺邊界? | 有 → A 元件自帶 `px-loose` / 無 → B 父層管 / list-with-hover-row → C item 自帶 |
| Header → 第一個元素 gap | **規則 2** | 第一個元素 role | bounded region → `loose` / unbounded region → **0**(list 自帶 py 撐)/ element → `tight` |
| 兩元素之間 gap | **規則 3** | 親疏 | 同範疇 → 元件 spec own(跳)/ 跨範疇相關 → `tight` / 跨範疇 parallel → `loose` |
| 內容區小標題(+ 說明)→ 內容 | **規則 3「標題區 → 內容」** | 底下幾塊 | 一塊 → `tight` / 兩塊以上 → `loose` / 段落 → `tight` |
| 最後內容 → 容器底 | **規則 4** | 元件 role(element 再看哪種容器)| element → 容器擋頁面或撐滿 = `bottom`(48)、不擋頁面又貼內容 = 與頂部同值(元件自己的內距)/ bounded → `loose` / unbounded → **0** |
| 橫排並列 input 之間 gap | **規則 5** | 內容語意緊密度 | 同組值起迄 → `gap-2`(8) / 不同組並列 → `gap-4`(16) |
| Chrome 表面水平 padding | **規則 6** | (永遠) | `loose` |

---

## 具體推導 walkthrough(6 範例)

### 範例 1:Dialog 內 form fields stack(Field A ↔ Field B)

- **走規則**:規則 3(兩元素之間 gap)
- **判親疏**:
  - bundled?(在元件 spec 裡寫成 bundle 嗎?) → **否**(consumer-composed)→ 跨範疇
  - functional 交互?A 不驅動 B,parallel siblings → **不相關**
- **答**:`loose`(16/24)— 對齊 Material / Polaris / Apple HIG / Atlassian 共識 <!-- @benchmark-unverified -->

### 範例 2:Cmd+K menu 中 search input ↔ result list

- **走規則**:規則 3
- **判親疏**:
  - bundled?Input + list 不在同 spec bundle → 跨範疇
  - functional 交互?search value 驅動 list filter → **相關**
- **答**:`tight`(12/16)

### 範例 3:Header chrome → InfoPanel 內第一個 Field(說明)

- **走規則**:規則 2(Header → 第一個元素)
- **判 role**:Field = element(局部塊 / 控件感)
- **答**:`tight`(12/16)

### 範例 4:Cmd+K menu list 最後 row → menu 容器底

- **走規則**:規則 4
- **判**:看 role:menu list = unbounded region(主導 + 自帶 py 撐)
- **答**:**0**(spatial 邊界,list 自帶 py 撐)

### 範例 5:Dialog body 最後 field → body 底

- **走規則**:規則 4
- **判**:最後一個是 element(欄位)→ 套 `bottom 48`
- **答**:48(結論留白)。`dialog.tsx` DialogBody 預設 `pb-bottom` 是此規則的實作,非 Dialog 例外

### 範例 6:SurfaceFooter 內 [Cancel] ↔ [Save] gap

- **走範疇判**(在規則 3 之前):
  - bundled?**是**(`button-group.spec` + `overlay-surface.spec` 都自帶 button arrangement canonical = `gap-2`/8px)
  - → 同範疇 / bundled 第一級,**layoutSpace 一般規則跳過**
- **答**:`gap-2`(8)— 由 `button-group.tsx:51` / `overlay-surface.tsx` SurfaceFooter 自帶 canonical own

**注意**:規則 5「橫排並列」**只**適用 input fields,不套 button group(button spacing 屬 bundled-family canonical own,不走 layoutSpace 一般 rule)。

---

## 典型容器範例

### Form 情境(Field stack 在 Dialog 內)

```
┌────────────────────────────────────┐
│  Title                        [X]  │  ← SurfaceHeader (chrome, py-tight)
├────────────────────────────────────┤
│← tight ─────────────────────────→ │  ← Header → element (規則 2)
│  ← loose → [Name input]   ← loose →│
│← loose gap ─────────────────────→ │  ← 跨範疇 parallel form fields (規則 3 不相關)
│  ← loose → [Description]  ← loose →│
│← loose ─────────────────────────→ │
│  ← loose → [Other field]  ← loose →│
│← bottom 48 ────────────────────→  │  ← 最後 element → body 底 (規則 4 第 1 列)
├────────────────────────────────────┤  ← SurfaceFooter border-t
│  ← loose → [Cancel] [Save] ← loose →│  ← Footer (chrome, py-tight)
└────────────────────────────────────┘
```

### Page 情境(全頁 list / dashboard)

```
┌────────────────────────────────────┐
│ ← loose → [Toolbar items] ← loose →│  ← Toolbar(自帶 py-tight,跨範疇 functional → table 規則 3 tight)
│╔══════════════════════════════════╗│
│║← loose → DataTable       ← loose →║│  ← bounded region(規則 1 內 px = loose)
│╚══════════════════════════════════╝│
│← loose ─────────────────────────→  │  ← bounded region → 底部 chrome band(規則 4)
│ ← loose → [Alert hint]    ← loose →│  ← 底部 chrome band
│ ← loose → [BulkActionBar] ← loose →│
└────────────────────────────────────┘
```

---

## 常見誤解

- ❌ **元素間 gap 硬寫 `gap-4`**:容器級 gap 走規則 3 token(`tight` / `loose`);固定 `gap-2` / `gap-4` 只限規則 5 橫排 input 與 bundled family 自帶 canonical
- ❌ **Pattern C 場景把 padding 寫在 list 容器**:hover bg 需 flush 貼邊,padding 必須 item 自帶(規則 1C);寫在容器 = hover bg 縮一圈
- ❌ **unbounded list 漏自帶 py**:規則 2 / 4 的「0」前提是 list 自帶 py 撐 spacing;漏 py = 內容貼 chrome 邊

---

## 模式切換

```ts
// 全域 density(含 layout space)
document.documentElement.setAttribute('data-density', 'lg')
// 單獨控制版面間距而不影響元件尺寸
document.documentElement.setAttribute('data-layout-space', 'lg')
```

---

## Notes

- **不抽 universal LayoutBody / FormLayout primitive**:每元件 own variant + 共享 token 就夠 —— 規則 1-6 universal,但「誰是 body、誰是 header」是 scope-relative 的角色,抽成一個 primitive 容易封錯。獨特 chrome 已在 `overlay-surface.spec.md` + `action-bar.spec.md`
- **List-as-region in overlay body**(2026-05-01 canonical):當 Dialog / Sheet / Popover body 內容 = unbounded list-as-region(menu / Cmd+K / nav)時,consumer 用 className override 撤掉 chrome padding(`<DialogBody className="!px-0 !pt-0 !pb-0">`)+ 自管 list outer wrapper(`<div className="py-2">`)+ item 自帶 `px-loose rounded-md`。**item 有沒有 hover 底色不是判定條件**(判定條件 owner 見 `overlay-surface.spec.md`「List-as-region in overlay body」)。**不做成 body variant**(`flush?: boolean`)—— variant 不解決底層脆弱(加 1 row search/banner 就破功),反把 1 surface decision 拆兩 API。詳 `overlay-surface.spec.md`「List-as-region in overlay body」+ `dialog.tsx#DialogBody` JSDoc
- **Tabs-in-chrome-body 單一 gap owner**(2026-07-01 canonical):`tabsSlot` 模式下 `TabsContent` 放進 `DialogBody`/`SheetBody`/`SurfaceBody`(自帶 `pt-/py-tight`)時**必 `className="mt-0"`** — chrome body 已擁有 header→content gap(規則 2「element → tight」),TabsContent 內建 `mt-tight` 會雙重疊加(md 24 / lg 32)。同「一軸單一 spacing owner」原則(`item-anatomy.spec.md`「垂直 padding 歸屬:row 集合不加 py,由外層容器負責」)。詳 `components/Tabs/tabs.spec.md`「出現在 Dialog」段 + hook `check_tabs_content_chrome_body_double_gap.sh`
- **v1 → v6**(2026-04-30):block-adjacent 機械 → 親疏判 + bundled-family 分權 + region 二分(bounded/unbounded)+ 多 region 限制。詳 git 歷史(原 memory `feedback_layout_v6_canonical.md` 已 prune)

---

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-decision-card.spec.md`
- `agent-panel.spec.md`
- `app-shell.spec.md`
- `coachmark.spec.md`
- `data-table.spec.md`
- `description-list.spec.md`
- `empty.spec.md`
- `field.spec.md`
- `overlay-chrome-sizing.spec.md`
- `overlay-surface.spec.md`
- `pagination.spec.md`
- `uiSize.spec.md`
