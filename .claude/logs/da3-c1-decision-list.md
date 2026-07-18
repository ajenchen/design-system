# DA3 要你拍板的清單(全部講人話,不縮寫)

共 21 題。每題:問題(白話)→ 我的推薦 → 一句理由。你可以回「全照推薦」我一次全做,或挑某幾題改。另有 17 條已自動歸「照既有規矩做、不用你決定」,列在最後。

---

## 一、必修,只問你要哪種修法(不是要不要修)

**1. 分頁籤(Tabs)右側那顆操作按鈕,位置違反無障礙標準**
你之前依設計圖加在每個頁籤右邊的動作按鈕,現在被程式包在「頁籤清單」裡面,螢幕閱讀器會判定結構錯誤(無障礙自動檢測列為 critical 必修)。
→ **推薦**:把那顆按鈕移到頁籤清單「外面」,用定位讓它視覺上仍貼在頁籤右側,再用一個關聯屬性讓系統知道它們仍是一組。**畫面看起來完全不變**。唯一要你確認:移出去後用鍵盤 Tab 的順序會變,你能接受。
(另一種是重新設計成收進選單,但那會動到你的設計圖外觀。)

---

## 二、型別誠實化(公開型別答應了做不到的事)

**2. 13 個元件的 `asChild` / `children` 型別,答應了做不到的事(一次決定,套全部)**
ScrollArea、Slider、頁籤項、Switch、單選鈕、麵包屑、Tooltip 等 13 個「內部結構固定」的元件,公開型別都繼承了 Radix 的 `asChild`/`children`,但它們自己固定要畫好幾個內部元素 → 有的一用就當場報錯,有的你傳進去的內容被靜默蓋掉(麵包屑最慘:路由連結拿不到網址,點了不會跳)。
→ **推薦**:把這些做不到的選項從公開型別「拿掉」(比照你 2026-07-07 已上線的 Slider 同款做法 + 你 2026-07-14 拍板的 Select「全部收窄」)。**唯一「弄壞」的是本來就會報錯/失效的用法**,不是拿掉能用的功能。代價是要發一個 beta 版(型別檔變動)。Tooltip 這一個可以單獨保留彈性(它內容比較可能是你自訂的)。

**3. 內部專用的符號還是從公開入口漏出去**
你 2026-06-05 已拍板「內部專用的東西不進公開入口」,但目前的產生器只看「整個資料夾是不是內部」,沒看「單一符號有沒有標記為內部」→ 散在公開元件裡、個別標了 `@internal` 的符號(尺寸常數、排版 helper 等)還是漏到公開入口。大部分已歸「照規矩自動清」,只剩一個要你一句話:
→ **推薦**:擴充產生器去讀「內部」標記自動剔除(這是 TypeScript / MUI / 微軟工具的標準做法)。順帶定案 `handleSheetOpenAutoFocus` 這個符號:保持內部,還是扶正成公開?(規格自相矛盾,要你選方向)

**4. 有上限的數字設定(評分滿分、小數位、截幾行),型別沒鎖範圍**
評分滿分 `max`、小數位數 `precision`、截行數這些「規格有明確上限」的數字,型別現在寫「任意數字」,傳超界值會靜默失效或直接當掉。要不要把型別鎖成只能填合法值?
→ **推薦「不鎖」**(這題我反而建議保守):維持任意數字,但超界自動修正 + 開發時警告。因為 MUI / Ant / Chakra 四家世界級**全部維持不鎖**,我們自己對「非法設定」的既有做法也是「寬鬆型別 + 警告」(已有 7 個元件先例);而且順手把負數當掉、截行失效這些真 bug 一起修了。鎖型別會破壞現有程式又跟全世界背道而馳。

---

## 三、無障礙 / 行為契約(要新增規範)

**5. 沒填名稱的元件,螢幕閱讀器讀不到(頭像、麵包屑、標籤、輪播)**
規格說 label 必填但型別允許不填;不填時圖示被標成「裝飾」→ 螢幕閱讀器完全讀不到那是什麼。
→ **推薦**:型別不動(不破壞現有程式),但改成:解析不出名稱時「開發階段警告」+ 輪播自動產生「第 N 張,共 M 張」+ 真的是裝飾就明確標記(`alt=""`)。等於新增一條「DS 如何保證每個元件都有可讀名稱」的無障礙規範。

**6. 批次操作(例如選 500 筆一起刪)進行中,整條操作列該怎麼表現,沒規範**
按下批次刪除要打 API 的那段時間:誰顯示轉圈?其他按鈕要不要鎖?勾選要保留還是先清?現在完全沒規範,每個人做的不一樣。
→ **推薦「最小規範」**:轉圈由「被按的那顆按鈕自己顯示」(用既有的按鈕 loading 功能),操作列只負責協調規則(進行中鎖其他鈕、勾選保留到成功才清)。不要把操作列變成有狀態的複雜元件(Polaris / MUI 都是這樣分工)。

**7. 兩個元件的「展開/開關」控制只做了一半**
步驟元件(Steps)只能設「一開始展開哪幾步」,但外部程式沒法隨時控制;側邊欄(AppShell)剛好相反,能隨時開關但不能設「一開始是開還是關」。兩者都沒寫「為什麼只做一半」。
→ **推薦分開處理**:Steps 補上完整控制(它整體就是「外部掌控」哲學,獨缺這個很矛盾,而且最像它的 TreeView 就是完整的);側邊欄則寫一句「初值刻意固定關閉」就好(實務上一定由 app 狀態驅動,多加反而是過度設計)。

**8. 10px 極小字沒有無障礙下限保護**
規格允許 10px 用在法律/來源小字,但整份沒任何保護:沒說重要資訊不能只靠這種小字、沒要求放大 200% 不被裁掉。
→ **推薦**:補一段無障礙規範(限定用途 + 上線前驗證放大不裁切),**不砍掉 10px**。因為無障礙標準本來就不設像素硬下限,只要求「能放大到 200% 不失內容」——正解是補用途限制,不是砍字級。

**9. Tooltip「滑鼠移開就消失」的說明是錯的,而且照著做會倒退無障礙**
規格和範例都寫 Tooltip「滑鼠離開就立刻消失」,但實際程式不是這樣(Radix 預設讓指標能短暫移到浮層上,這是無障礙標準 WCAG 1.4.13 的刻意合規)。照文字改成「真的立刻消失」反而會違反無障礙。
→ **推薦**:改的是「說明文字」不是程式——把 Tooltip 跟 HoverCard 的分界從「消失快慢」改成「內容能不能互動」(Tooltip 純文字不可互動、HoverCard 可互動)。程式不動,保住無障礙。

---

## 四、公開 API 契約細節

**10. 命令面板(Command / Cmd+K)該公開還是維持內部**
整個 Command 家族標記為內部,但它的規格又叫「app 要做 Cmd+K 就用這裡的 CommandDialog」——可是那顆做不出完整面板(還得配其他內部零件)。要嘛整個家族公開,要嘛整組維持內部。
→ **推薦「維持內部」**:改規格措辭,叫 app 走「子路徑 import + 自行包裝」(這正是你 2026-07-10 已定的規矩),而不是新增 8 個永久公開 API。只有你確定要「app 直接 import 零摩擦」才選公開。

**11. 規格叫人用「Combobox + 建立新選項」,但這功能根本不存在**
SelectMenu 規格寫「要能自建新選項就用 Combobox 的 creatable」,但 Combobox 根本沒這個功能,而且另一份規格才剛白紙黑字寫「Combobox 不提供 creatable」。指路指向不存在的 API。
→ **推薦「修掉這條假指路」**:改規格說明「目前無公開的自建選項功能」,不新開功能。因為沒有任何需求信號,開這功能要完整做 API+範例+無障礙,沒必要。只有你確定要把「使用者自建選項」變成正式產品功能才選開發。

**12. 兩個公開設定名稱跟我們自己的命名規矩衝突**
批次操作列的 `onClear` 其實是「清空勾選」,但我們命名規矩早把 `onClear` 定成「清空欄位內容」;另外 DescriptionList / ButtonGroup 用 `direction` 表示排列方向,但全 DS 其他 8 個元件同樣的東西都叫 `orientation`,兩套詞並存。
→ **推薦「硬改名」**:`onClear`→`onClearSelection`、`direction`→`orientation`(先掃過 apps 確認沒人用到 = 0 才硬改,同你 Tag 改名先例)。若掃出有人用到,該個就加過渡別名。全世界(ARIA/Radix/MUI)軸線都叫 orientation。

**13. 標籤(Tag)移除鈕的無障礙名稱設定,名字漂移**
Tag 的移除功能叫 `onRemove`(對的),但它的無障礙名稱設定卻叫 `dismissLabel`——`dismiss` 在我們規矩是給通知類的,Tag 用它是混用;而且同樣「移除集合項目」的 FileUpload 用的是 `removeAriaLabel`。
→ **推薦**:改名成 `removeAriaLabel`(跟 FileUpload 完全一致)+ 留一版舊名別名過渡。方向幾乎被既有命名鎖死,你只需拍板「現在做這個破壞性改名 + 留不留別名」。

**14. 輪播(Carousel)左右箭頭能不能傳完整按鈕設定**
箭頭現在只吃 `className` 和無障礙標籤,而且 `className` 實際套在外層定位容器不是按鈕本身,consumer 沒法客製按鈕(換尺寸、綁分析事件都不行)。
→ **推薦「開放」**(附遷移說明):改成完整按鈕設定,`className` 改指按鈕、另加 `wrapperClassName` 指定位層。對齊 shadcn/Radix 上游。**代價**:`className` 意義改變會破壞現有 consumer,需要遷移說明。這題破壞性較明顯,所以要你確認。

**15. Combobox 的 `ref` 在不同模式指向不同/不存在的東西**
Combobox 的 `ref` 只在編輯模式指向輸入框;檢視/唯讀模式走另一套渲染,`ref` 完全收不到。同一個 `ref` 隨模式靜默指向不同東西。
→ **推薦「記錄例外」**:規格明寫「ref 只在編輯模式保證指向輸入框」,不硬造跨模式統一結構(四個模式渲染的本來就是不同東西,強行統一風險大)。

**16. 表格的欄位顯示設定面板,結構跟它的兄弟面板不一致**
DataTable 的「欄位顯示」面板是公開元件卻回傳空殼(沒有根節點、不能接 ref),但同資料夾的「篩選」「排序」兄弟面板都有正常根節點。
→ **推薦「補上根節點」**對齊兄弟面板。**代價**:會改變浮層內的結構,修完要跑一次捲動行為的視覺驗證確認沒破壞。

**17. 表格篩選面板有兩個會打架的 `mode` 設定**
篩選面板同時收一個獨立的 `mode` 和資料自帶的 `mode`,型別允許兩者矛盾;矛盾時會出現「按鈕文字說加篩選、按下去沒反應」的死操作。
→ **推薦「移除獨立的那個 mode」**,一律由資料自帶的判斷(單一真相源,對齊 MUI/AG Grid)。**代價**:移除一個曾公開的設定,consumer 要改傳法。

**18. 側邊欄(AppShell)內容貼邊沒留白**
側邊欄有背景色和左邊框(是個有邊界的面),但內容區沒有內距 → 內容貼著邊框,違反我們「有邊界就要自帶留白」的規矩。
→ **推薦「加預設留白」**(需要滿版的清單/表格可用設定覆蓋)。這是 bug 不是設計。**代價**:現有側邊欄內容的間距會變。

---

## 五、規格用語 / 視覺(低風險,強烈建議照推薦)

**19. 批次刪除鈕現在是灰色的,看不出是危險操作**
兩份規格打架:按鈕規格禁止「次要+危險」組合,但批次操作列規格又強制批次刪除要用這組合 → 結果批次刪除鈕靜默變成灰色,看不出危險。
→ **推薦**:給按鈕補上「次要+危險」樣式(紅字不填色)。Carbon / Ant 都有這種「低強調的危險操作」,正是批次操作列的場景。

**20. Alert 的 `placement="inline"` 跟別的元件「inline」意思不同**
Alert 用 `inline`/`fixed` 表示「頁內卡片/頂部橫幅」,但別的元件的 `inline` 是「單行排版」——同一個字兩種意思。
→ **推薦「不動」**:因為 Alert 的 `inline` 對齊 Carbon 世界級用語,而且改名要破壞已公開的 API,划不來。這題我建議維持現狀,只是因為涉及公開命名才列給你知道。

**21. 範例文件用「模式 A / 模式 B」這種沒意義的字母代號**
FieldControlGroup 的規格和範例用「Mode A/B/C」字母代號,沒有產品語意。
→ **推薦「改成有意義的名字」**(如「Field 內尺寸」「單獨設定」「浮層鎖定」)。你 2026-06-03 已核准過把 FileItem 的「Type A/B」改成語意名,這題同方向,你一句「跟 FileItem 一樣」就能帶過。

---

## 附:17 條已自動歸「照既有規矩做,不用你決定」

這些經查證都對齊你以前已拍板的規矩或屬修 bug,我會直接做、完成後列在驗證表給你看,不佔你決策力:
分頁籤直向型別收窄、內部符號排除(6 個)、麵包屑截行對齊 MUI、SelectMenu 內部改名、範例去重(3 個)、z-index 歸屬釐清、標籤色收窄、篩選運算子收窄、DOM 轉發補齊(4 個)。

---

# 使用者拍板結果(2026-07-17)

**逐題查證後定案**(user 針對 7/8/11/18/19 提問 + 其餘授權「確保世界級+一致設計語言則照建議」):

| # | 題目 | 定案 | 依據 |
|---|------|------|------|
| **1** | Tabs axe-critical | **需先實跑 axe 確認嚴重度**:更嚴重的 button-巢-button 已於 2026-07-05 修成 sibling 佈局(tabs.tsx 註解);codex「button 在 tablist 容器內=critical」是剩餘較輕問題,實作前先跑 axe 證明仍違規才修。方向仍是移出+aria-owns | **ground-truth 驗:2026-07-05 已修 nested-interactive,severity 待 axe 實證** |
| 2 | asChild 全域收窄 | ✅ 照建議 A(Omit) | 對齊 Select 收窄先例 |
| 3 | barrel @internal 收緊 | ✅ 照建議 A + handleSheetOpenAutoFocus 保持 internal | 對齊 2026-06-05 拍板 |
| 4 | 有界數字型別 | ✅ 照建議 B(不鎖+dev-warn) | 世界級 4 家一致 |
| **5** | 空 label a11y | **範圍更正**:Avatar `alt: string` 已是**必填**(finding「型別允許省略」錯);真缺口只剩 `alt=""` 空字串 + Carousel 投影片無名。dev-warn 只針對空字串;Carousel 自動位置名成立 | **ground-truth 驗:Avatar alt 型別已 required(avatar.tsx:356),finding 框架部分錯** |
| 6 | 批次 loading 契約 | ✅ 照建議 A(最小契約) | user 授權 |
| 7 | controlled 完整性 | ✅ Steps 補控制 / AppShell 記 rationale | user 理解後授權 |
| **8** | 10px a11y | **降級**:只加一句 spec 用途限制(僅 storybook 註解/法律細字用,正式元件禁用)= AUTO;無正式元件消費,不做大規範 | **user 質疑「哪裡用到」→ grep 證實零正式消費** |
| 9 | Tooltip 分界措辭 | ✅ 照建議 A(改用「可互動性」分界,程式不動) | user 授權 |
| 10 | Command public/internal | ✅ 照建議 B(留 internal 走 subpath) | 對齊 2026-07-10 canonical |
| **11** | creatable | **改推薦 A(forward 到公開 Select+Combobox)** | **user 指正 + grep 證實 SelectMenu 已完整實作邏輯/顯示/互動;成本 = 接線,非大功能** |
| 12 | onClear/direction 改名 | ✅ 照建議 A(硬改名,先掃 apps=0) | 對齊 Tag 先例 |
| 13 | Tag dismissLabel→removeAriaLabel | ✅ 照建議 A+alias | 對齊 FileUpload |
| 14 | Carousel 箭頭 props | ✅ 照建議 B(開放+遷移註記) | user 授權 |
| 15 | Combobox 跨 mode ref | ✅ 照建議 A(記例外) | user 授權 |
| 16 | ColumnVisibilityPanel root | ✅ 照建議 A(加 root+驗 scroll) | user 授權 |
| 17 | FilterPanel mode 重複 | ✅ 照建議 A(移除獨立 mode) | user 授權 |
| **18** | 側邊欄留白 | **更正:非 bug、從沒被改壞**(git -S 證實 aside body 從未有內建 padding;範例留白是內容自帶 stories:208/214)。改為可選一致性決策:甲=維持內容自帶+補 spec 明文(推薦,對齊 Table/DataTable 裸結構、讓清單/表格貼邊)/ 乙=框架自加對齊 Dialog/Sheet(遷移面大,恐雙重 padding)。**待 user 選甲/乙** | **user 質疑「本來是壞的?」→ 查證:code 註解刻意走規則 1B(內容負責 padding),非 regression;我上輪誤信 codex「bug」框架已更正** |
| **19** | 批次刪除鈕紅色 | **改推薦 B(刪除鈕用一般 tertiary+垃圾桶 icon,紅色留給確認框最終鈕)** | **user 直覺正確;spec 證實刪除鈕開確認框、非直接刪;世界級「紅留給不可逆最終確認」** |
| 20 | Alert inline 命名 | ✅ 照建議(不動) | 對齊 Carbon idiom |
| 21 | Mode A/B 改語意名 | ✅ 照建議 A(改名) | 對齊 FileItem 先例 |

**淨變更 vs 原建議**:8 降級(理論題)、11 flip 成開放(功能已建好)、19 flip 成不上紅(開確認框)、18 確認。其餘照建議。


---

## ⚠️ 實作紀律(2026-07-17,user 質疑第 18 後 codify)
**每條決策實作前必 ground-truth 驗**:對真實程式碼 + git 歷史查證 finding 說的「壞了/缺失」是否屬實、是否 intentional、是否已修過(如 Tabs 2026-07-05)、severity 是否需實跑工具(axe/pixel)確認。**禁照 codex finding 框架盲修**。已抓到框架有問題者:18(從沒壞)、1(已修 nested-interactive)、5(Avatar alt 已必填)。


## 實作進度(2026-07-17,受控小批 + 每條 ground-truth 驗)
- ✅ **已實作 committed**:8(10px 註記)/ 9(Tooltip 分界 WCAG)/ 10(Command subpath 措辭)/ 18(甲 aside padding 明文)/ 20(Alert 不動,確認)/ 21(Mode→語意名)= 6 條 doc 類,全綠
- ⏳ **待做**:1 Tabs axe(需先跑 axe)/ 2 asChild 收窄 / 3 barrel @internal / 4 bounded numeric / 5 空 label / 6 loading / 7 controlled / 11 creatable forward / 12 命名 / 13 Tag rename / 14 Carousel / 15 Combobox ref / 16 ColumnVisibility / 17 FilterPanel / 19 批次刪除鈕 = 15 條(code 類,逐條 ground-truth+驗)
- ⏳ **其他軌**:剩餘 AUTO findings(中斷 batch 未完 + 4 reverted)/ Phase B 1273 驗證 / C.1 report


## 續實作(2026-07-18)
- ✅ **6 批次 loading 契約**:ground-truth 發現 spec 172-180 段已含「批次操作進行中(loading/防重複/選取保留)」= 我推薦的 A 案 → finding stale,已滿足
- ✅ **15 Combobox cross-mode ref 例外**:combobox.spec 加「Ref 契約」段(ref 只保證 edit mode 指 trigger,記錄例外)
- ✅ **7-AppShell controlled rationale**:app-shell.spec 加「Aside 開關控制刻意單向」段(initial 固定關閉,不加 defaultAsideOpen)
- ⏳ **7-Steps controlled**:待加 expanded/onExpandedChange(code)/ 剩 2/3/4/5/11/12/14/16/17

- ✅ **3 barrel @internal 符號級收緊**:generator 讀 `@internal` JSDoc tag → root front-door 排除(subpath 仍有)。ground-truth:11 符號收窄(7 value:ButtonGroupContext/floatingLayerClass/getMenuListMinHeight/handleSheetOpenAutoFocus/ItemInlineAction/ItemInlineActionButton/RowSizeProvider + 2 props type + 2 Field type channel);M10 exhaustive scan 多抓 ItemInlineAction(named-6 漏)。**精準判定**:JSDoc-tag-only,排除 `//` prose(實證 greedy 誤殺 Input/FieldVariant/Select）。handleSheetOpenAutoFocus 保持 internal(對齊 2026-06-05 拍板)。驗:tsc -b ✓ / build:lib ✓(無 TS4023)/ --check ✓ / 0 root-package consumer / 15/15 hook test。canonical:ui-development.md 補符號級 `@internal` 段。

- ✅ **12 命名硬改**:`BulkActionBar.onClear`→`onClearSelection`(清勾選≠清欄位);`DescriptionList.direction`/`ButtonGroup.direction`→`orientation`(+ 型別 `DescriptionDirection`→`DescriptionListOrientation`)。ground-truth:0 apps consumer → 硬改無 alias(對齊 Tag 先例)。**改一處看三處**:build:lib+typecheck:stories 抓出 folder-scoped grep 漏的跨元件 consumer — FileViewer/AppShell story 用 `<DescriptionList direction>`、DataTable story 用 BulkActionBar `onClear`(全修)。**反過度**:`OverflowScrollArrow.direction`(左/右,非軸)/ `ResizeHandle.direction`(另元件,不在 scope)/ `SelectClearButton.onClear`(另元件)= **不動**。canonical:props-naming.md 補 `onClearSelection` row。驗:tsc -b ✓ / build:lib ✓ / typecheck:stories ✓。
  - ⚠️ **follow-up 給 user**:`ResizeHandle.direction='horizontal'|'vertical'` 語意上也是 orientation 軸,但不在本次 audit finding scope(僅 flag DescriptionList/ButtonGroup)→ 若要 DS-wide 徹底統一 orientation,ResizeHandle 是另一破壞性 rename,待 user 授權(public composition primitive API 改動)。

- ✅ **14 Carousel 箭頭 props(B 案:開放)**:`CarouselPrevious/Next` ArrowProps 改 `Omit<ComponentPropsWithoutRef<typeof Button>, 'iconOnly'> + wrapperClassName`(對齊 shadcn `ComponentProps<typeof Button>`)。`className`→箭頭按鈕(疊在 `rounded-full` 後可覆寫)、`wrapperClassName`→定位層;`onClick`/`disabled` 與 scrollPrev/Next + 邊界態 compose;variant/size/startIcon default 可覆寫;iconOnly 固定。**BREAKING**:className 語義 wrapper→button。**0 遷移成本**:DS 內全數 bare `<CarouselPrevious />`(grep 證實無 className/props 傳入)。**Provable identity**:default 全保留(cn('rounded-full',undefined)==前;onClick/disabled compose 到同值)→ 既有 render+behavior 零變。canonical:carousel.spec.md 補「Arrow Props」段 + BREAKING 遷移註記 + 視覺規格標 default 可覆寫。驗:tsc -b ✓ / build:lib ✓ / typecheck:stories ✓ / benchmark-citation hook ✓。

- ◑ **11-Select creatable**:ground-truth 發現 Select searchable=trigger 內嵌 input(SelectMenu searchable=false),creatable 需把 trigger 搜尋接進 SelectMenu creatable 顯隱(架構整合非 prop forward)。Combobox creatable 已覆蓋主場景;Select 這半留評估。

- ✅ **16 ColumnVisibilityPanel** → 改走 B(保留 Fragment):ground-truth 發現 A 加 root 會破壞 PopoverHeader 邊緣 bleed(Fragment 刻意讓 PopoverHeader 當 PopoverContent 直接子);sibling 自刻 header 故可包 root、本 panel 用 primitive 不行。加註解記錄刻意,非缺陷。

- ✅ **4 bounded numeric** → 照建議 B(維持 number 不收窄):建 lineClampClass helper(靜態 map,修 cell-registry:127 + item-anatomy:395 兩處動態 line-clamp silent bug)+ NumberInput precision guard(clamp [0,20] 防 RangeError + dev-warn)+ Rating max dev-warn。對齊世界級 4 家維持 number。

- ✅ **5 空 label a11y**:Carousel 自動位置名「第N張共M張」(CarouselContent 注入 index/total,consumer aria-label 優先;WAI-ARIA APG N-of-M)。Avatar alt 已必填(ground-truth 證實,不動);Tag/Breadcrumb 空 label dev-warn 為次要 additive(有 removeAriaLabel/label 通道,consumer 可補)。
