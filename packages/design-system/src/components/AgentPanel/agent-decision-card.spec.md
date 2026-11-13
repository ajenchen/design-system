# AgentDecisionCard 設計原則(AgentPanel 家族;獨立 SSOT)

> **本 spec 是 AgentPanel 家族決策卡的獨立 SSOT**(2026-09-27 從 `agent-panel.spec.md`「元件規格」第 8 節整段抽出,避免單一 spec 過長(674 行 > 500 硬上限,待辦總帳 N19);內容零改動,只加本檔頭與檔尾指標)。家族定位 / Token / 何時用 / 動畫總表 / Esc 與關閉語意 / 禁止事項仍住 `./agent-panel.spec.md`;程式碼在 `agent-panel.tsx`(`AgentDecisionCard` 與產題守則機械層 `warnDecisionRules`)。
>
> **Layout Family**:同 `agent-panel.spec.md`(self-contained 容器家族;決策卡繼承 Popover surface 配方 + SurfaceFooter,見下)。本檔不另立 family。

### 8. AgentDecisionCard(決策卡)

- 僅代理被阻擋、需人決策時出現;完全覆蓋輸入區、貼面板底。
- 繼承 Popover surface(rounded-lg、border、elevation-200、compact header:題目行高 21 + 上下 `--layout-space-tight`,沒有小標時一般密度 45 / 大密度 53(2026-11-13 量到後寫準;之前只寫 45)—— 決策卡不在 Popover 裡,間距跟頁面密度走【AI 推導 2026-11-13:這個原因是讀程式得到的 —— 把間距鎖在一般密度的是 Popover 的外殼(`../Popover/popover.tsx`),決策卡只借外觀、沒有用那個外殼】)+SurfaceFooter;
  改寫:無下圓角;header 下、footer 上無分隔線;body 上下無內距、左右 `--layout-space-loose`。【AI 推導 2026-11-13,下面兩句粗體的間距都是;畫面沒有改,只把原本沒寫的這兩段寫下來;間距規則的 SSOT = `../../tokens/layoutSpace/layoutSpace.spec.md`】**題目 → 第一張選項卡 = `--layout-space-tight`**(一般密度 12 / 大密度 16):照該檔規則 2(標頭 → element = tight;選項組是一組輸入控件 = element)。標題列沒有分隔線,標題列的下內距與 body 之間沒有東西隔開,眼睛只看到一段距離 → 這一段只由標題列的下內距給、body 頂部不再給(同檔規則 2「適用範圍與量法三點」(2):從「標頭內容的底」量到第一張卡頂 ——「標頭內容的底」= 標頭裡最低的那個內容的外框底(正常情況下 = 標頭外框底扣掉它自己的下內距);「內容」只算畫面上看得見的東西【AI 推導 2026-11-13】—— 有自己的字的元素、圖示 / 圖片、有看得見的框線 / 跟外層不同的底色 / 陰影的塊;外框看不見的包層(含框線與底色都透明的圖示按鈕)不算它自己的外框,往裡找看得見的東西;只有字、沒有框的元素取內容框的底(它自己的下內距是空白,不是內容);絕對定位的裝飾不算;量的時候指標移開(滑過時按鈕有底色,外框就看得見了);逐項判法住 `scripts/header-first-gap-invariant.mjs` 的頁面量具(決策卡那支閘用的是同一份);例:沒有小標的 AgentDecisionCard,× 鈕的外框是透明的、比題目那一行低 3.5 / 5.5px(一般 / 大密度),看不到、不算 —— 最低的內容是題目那一行,量到 12 / 16;把 × 的外框算進去會量成 8.5 / 10.5(這幾個數字是量到的現況))。**最後一張選項卡(有錯誤時是錯誤訊息 —— 這一項是讀程式推的,閘沒有開到錯誤狀態)→ 按鈕 = footer 自己的上內距 `--layout-space-tight`**:body 底部與頂部同值 = 0(同檔規則 4 表第 4 列:容器不擋頁面、高度貼著內容 —— 決策卡只蓋住面板的輸入區、不是 modal;「關閉」條的「阻擋語意」照本節第一條讀,是代理被擋住、等人決策,擋的不是整頁)。「header 下、footer 上無分隔線;body 上下無內距」是 2026-09-02 隨規格入庫的寫法,有沒有 user 逐字說過查無。這一段由 `scripts/agent-decision-card-validation-invariant.mjs` 的 G 系列機械檢查(有 / 沒有小標 × 一般 / 大密度量像素)。
- Header:`[小標「n / N」(僅 N>1)][題目 text-body font-medium][×=跳過全部]`;× 的名字(aria-label;icon-only Button 自動帶出同字 tooltip)=「跳過全部，用建議繼續」(`labels.skip`,見「關閉」條);小標字樣、距題目與 × 的位置照 `../../patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」標題區(`SurfaceEyebrow`)。
  **選填題題目後加「(選填)」,必答題不變**(依據:user 2026-11-10 在決策頁選「標示:甲」,甲的原文:「選填題題目後加「(選填)」,必答題不變。」):
  字由元件加(`labels.optionalSuffix`,DS 預設「(選填)」,consumer 可換英文),接在題目文字後、同一行同字級同色 —— 照 DS 既有寫法
  (`../Accordion/accordion.stories.tsx` 的 FieldLabel「專案識別碼(選填)」、`../PeoplePicker/people-picker.stories.tsx`「代理人(選填)」;
  同本卡選項後的「(建議)」接法)。只標少數那一邊:決策卡預設必答、選填是少數 —— GOV.UK「add ‘(optional)’ to the legend」「Never mark mandatory fields with asterisks.」
  (<https://design-system.service.gov.uk/patterns/question-pages/>)、Carbon「If the majority of the fields are required, mark only the optional field labels with (optional).」
  (<https://carbondesignsystem.com/patterns/forms-pattern/>)。
- 選項卡(拍板樣張 2026-09-02):每個選項=灰底卡 `bg-secondary rounded-md px-3 py-2`,
  **整卡可點**:卡內任一點點一下 = 點控件一次(`ds-canonical/references/hit-area-canonical.md` 一-4「點下去等於點控件」;控件與 SelectionItem 的 `<label for>` 照它們自己的轉發、「其他」輸入格的外框歸輸入格,其餘由卡轉給控件 —— 同一下點擊只有一個主人,`agent-panel.tsx` `pressOptionCard`;機械閘 `scripts/agent-decision-card-option-press-invariant.mjs` 逐點量切換次數;滑過見下一條);卡片組合 `SelectionItem`(**py 0**:卡的 py 8 是唯一行距 owner,SelectionItem 自帶
  (32−1lh)/2 歸零,避免 double padding——`../Checkbox/checkbox.spec.md`「零外部 gap」鐵律的反向)
  + RadioGroupItem md(複選=Checkbox md);radio↔label 8、label↔description 2;卡間距 8。
  「其他」卡永遠最後、**常駐 Input**(md 32;label 行框↔Input 8;左縮排 24 = radio 16 + gap 8 對齊 label,
  [Polaris ChoiceChildren 同款](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/Choice/Choice.module.css);
  距卡右/下各 12);指標按進輸入格或開始打字即選中「其他」,只用 Tab 經過不改選取(只用鍵盤的人才走得過這一格:選填題清掉後只用 Tab 走到「下一題」,[WCAG 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html));**滑鼠/觸控點整張「其他」卡 → 自動聚焦 Input**(明確指向意圖),
  鍵盤選中不搶焦點 —— 方向鍵(APG radio roving)、焦點在圓 / 方框上按 Space(APG radio「Space: checks the focused radio button」,
  <https://www.w3.org/WAI/ARIA/apg/patterns/radio/>)都只改選取狀態、焦點留在原處,Tab 一步即到 Input;radio `aria-controls` 指向 Input。
  幾何:一般卡 8+21+2+21+8 = 60;「其他」卡 8+21+8+32+12 = 81。
- 選項卡滑過(2026-09-26 AI 建議,列在「其餘建議」、user 未另提 → AI 判讀照建議做;user 的問句見上;待辦總帳 B12):指標在整張卡的**任何位置**(內距、圓與字的空隙、說明文字、「其他」卡的輸入格),
  卡內的圓(複選是方框)照它被自己的 label 滑過時的樣子變色 —— 顏色即 `../Checkbox/checkbox.spec.md`「狀態」Radio / Checkbox 表的 hover 列,
  不新增顏色;**卡片灰底不換色**、字色不變;卡與卡之間的 8 不屬任何卡,滑過不變、點了也不選。
  理由:DS 原本的單選/複選項目本身沒有滑過樣式,回應的只有控件(`../SelectionControl/selection-item.spec.md`「為何無 ColorMatrix / StateBehavior」),
  指到字上圓也會變是 HTML label 的轉發;選項卡的命中區是整卡,同一套語言的回應範圍就是整卡。
  user 原問句(逐字;問句,不是決定):「我覺得好像不用加上底色變化，若它是 radio 的話，那滑到整個 radio item 應該跟原本的radio item有一樣的設計語言？仔細研究查查原本hover radio item會長怎樣？全盤確認。」
  「其他」卡指在輸入格上:圓照樣變,輸入格外框自己的滑過疊在上面 —— 卡片是宿主、輸入格是卡內控件,宿主保留自己的滑過
  (`../../tokens/color/color.spec.md`「Hover 換色配對總則」巢狀滑過段;套到「宿主的滑過是控件變色」是 AI 推導);點輸入格即選中「其他」,圓亮起來的承諾成立。
  作法:卡片掛具名群組 `group/agent-option`,控件把**自己的** `hover:` 配對原樣接到群組滑過(`agent-panel.tsx` `OPTION_RADIO_HOVER` /
  `OPTION_CHECKBOX_HOVER`,逐條鏡射 `../RadioGroup/radio-group.tsx` / `../Checkbox/checkbox.tsx` 的 hover 行,owner 改色時同步改);
  不把整卡改成 `<label>`:卡內已有 SelectionItem 的 label、`<div>` 與輸入格,違反 [WHATWG label 內容模型](https://html.spec.whatwg.org/multipage/forms.html#the-label-element)。
  鍵盤不受影響(焦點框仍在控件本體)。世界級:卡片式單選 [Joy UI Radio `overlay`](https://github.com/mui/material-ui/blob/f2e0dab9d80271310843c57b9bd430e07e267b8d/docs/data/joy/components/radio-button/radio-button.md#L113-L119)
  同形(整卡可點、滑過只變圓;Joy UI 已於 2026-03-11 自 MUI 主 repo 移除,只作曾經的做法);Carbon RadioTile 改換卡片底色
  ([_tile.scss#L62-L73](https://github.com/carbon-design-system/carbon/blob/7e8c8f7db6dd2ed98c4947b78b37614f43eda920/packages/styles/scss/components/tile/_tile.scss#L62-L73)),
  本 DS 不採 —— 單選狀態表的底色欄一律不變(`../Checkbox/checkbox.spec.md`「狀態 › Radio」)。
- 關閉:header × 恆渲染、恆為跳過(= 全部用預設 / 已選值繼續,`onSkip`),**是唯一的跳過入口**,footer 沒有跳過鈕;無 Esc、無外點關閉(阻擋語意)。
  `onSkip` / `onSubmit` 為必填 prop(× 與送出鈕恆渲染、卡片沒有內建行為,沒傳 = 按了沒反應、使用者離不開這張卡;agent-panel.spec.md 固定 anatomy 律,
  `scripts/agent-panel-fixed-anatomy-invariant.mjs` 守型別層)。
  依據:user 2026-11-11 回覆「跳過:甲」;甲的原文(AI 建議、user 選甲):「拿掉下方的「跳過」，只留右上角 ×；× 的提示文字改成「跳過全部，用建議繼續」。第一題下方只剩「下一題」，第二題起是「上一題 / 下一題」。」
  user 原本的提問(逐字):「再者，ai agent決策卡的部分，下方有「跳過」，其應該跟點擊x是一樣的意思？那是否文案要改成「取消」之類的？或是建議拿掉這個按鈕？」;
  另在選填題那張圖留言(逐字,問句):「跳過要拿掉？」(AI 回答「要」)。2026-09-02 到 2026-11-10:第一題 footer 左鈕是「跳過」(與 × 同一行為),× 的名字也是「跳過」。
- 收起後的焦點:送出 / 按 × 之後 consumer 卸載卡片,握著焦點的那顆鈕跟著不見 —— 焦點在卡片裡時交給**面板的對話輸入框**(`AgentPromptInput` 的輸入格),不掉到 body
  (`../../../ds-canonical/references/keyboard-model-canonical.md`「焦點不可因 DOM unmount 掉到 body」;W3C APG dialog:按的元素不在了 →
  「focus is set on another element that provides logical work flow」,原文與出處見同檔 Dialog 那一段)。落點【AI 推導】:卡片本來就完全覆蓋輸入區(本節第一條),
  收起後露出來的就是它,使用者下一步是看代理怎麼接、或自己再打一句。焦點不在卡片裡不動;consumer 送出後不卸載卡片(例如換成讀取中)時焦點留在原處。
  作法:`AgentPanel` 提供、`AgentPromptInput` 登記輸入格(`agent-panel.tsx` `AgentComposerContext`),卡片在卸載那一刻(版面效果收尾,DOM 還在)檢查焦點、
  交接走 `../Field/field-wrapper.tsx` `keepFieldFocusBeforeUnmount`(同「上一題」「清除選取」)。面板外單獨用卡片、或面板裡沒有輸入框時沒有落點可交,不動。
  **尚未涵蓋(2026-11-12 審查補記)**:consumer 若在卡片顯示時不畫輸入框、卡片收起後才畫,卸載那一刻輸入格還沒登記(`AgentComposerContext` 是空的),
  `keepFieldFocusBeforeUnmount` 沒有落點、焦點照舊掉到 body;這個用法目前沒有任何範例與閘量得到(DS 範例輸入框恆在,WM 沒有使用 `AgentDecisionCard`)。
  要不要改成「輸入框掛上時若焦點在 body 且剛有卡片收起就接手」,屬於 × / Esc 語意那一批(第三批頁「× = 取消、焦點到輸入框」排在 r4c,user 原話是問句),一起定。
  閘:`scripts/agent-decision-card-clear-invariant.mjs` O14f(鍵盤按「送出」)與 O28f(滑鼠按標題列 ×)—— 斷言卡收起之後焦點 = 輸入格、不是 body;
  `--selftest` ⑱ 卸載後 blur → 兩條都紅。2026-11-11 前兩條路線焦點都落在 body(r3 實測)。(本句原寫成 `scripts/story-demo-focus-invariant.mjs`,那支裡沒有決策卡的格子,2026-11-12 更正。)
- 步進:**一題一步**,footer 右側:第一題只有「下一題」(只有一題的卡 =「送出」);第二題起「上一題」+「下一題」、末步「送出」(上一題:答案保留;
  [Material Stepper Back](https://m1.material.io/components/steppers.html) / [GOV.UK Back link](https://design-system.service.gov.uk/components/back-link/) 同款,
  2026-09-02 落地;原記為 user 拍板,依據是 user 在 artifact 的留言討論,原話未留存 —— 來源不明);主鈕靠右、每一題同一個位置;header × 恆為跳過。
  第二題按「上一題」回第一題:第一題沒有上一題,那顆鈕跟著卸載 —— 焦點在它身上時交給第一題的選項入口(單選 = 已選的圓、沒選 = 第一個圓;複選 = 第一個方框),不掉到 body
  (`../../../ds-canonical/references/keyboard-model-canonical.md`「焦點不可因 DOM unmount 掉到 body」;落點【AI 推導】:按上一題 = 要改上一題的答案,同「清除選取」後的落點;
  焦點不在它身上不動,同 `../Field/field-wrapper.tsx` `keepFieldFocusBeforeUnmount`;第三題回第二題時上一題還在,焦點留在原處)。
  「下一題」/「送出」恆可按(新建表單,`../Field/form-validation.spec.md`「Submit Button 狀態」),只在按下時驗這一題(「其他」要不要填看「其他」選了沒 = 跨欄位,規則 9):
  沒選(選填題 `optional` 除外 —— 題目後有「(選填)」,見 Header 條:照常前進,值為空字串)或「其他」空白 → 不前進,`FieldError` 放在最後一張選項卡之後,**距離 = 卡間距 8**
  (依據:user 2026-10-29 原話「此外決策卡是否next/submit按鈕都不應該disable?然後點擊這些按鈕若有出錯 應該用跟 field 的 error msg 一樣的字放在最後一個選項的後面跟最後一個選項距離=選項跟選項之間的距離？你覺得如何？」—— 問句,照提案落地;
  8 這個數是 AI 依既有規則定:世界級一致的只有「錯誤不比選項之間更靠近最後一個選項」—— Polaris ChoiceList 選項間 16 時錯誤也離 16、選項貼齊時錯誤 4
  (<https://github.com/Shopify/polaris/blob/5131f8a68b366f55a6e9e3a9e2dd624d4989cd33/polaris-react/src/components/ChoiceList/ChoiceList.tsx#L132-L150>)、
  Carbon 直排選項間 6、錯誤離最後一項 12(<https://github.com/carbon-design-system/carbon/blob/487b24869143fe35599118760ef39d17d8696c65/packages/styles/scss/components/radio-button/_radio-button.scss>
  `--vertical .radio-button-wrapper` 與 `__validation-msg`);Field 內部 gap-1 4 比卡間距 8 還近,兩家都排除,剩下的 8 = user 提的「= 選項跟選項之間的距離」、不新增數值);
  錯誤文案(DS 預設,`labels.errorSingle` / `errorMulti` / `errorOther`)=「請選擇一個選項」「請至少選擇一個選項」「請輸入其他選項」—— AI 依 DS 既有句型定
  (`../Select/select.stories.tsx`「請選擇出貨倉庫」、`../Combobox/combobox.stories.tsx`「請至少選擇一個商品類別」、同一格的提示字「輸入其他選項」;題目由代理出,錯誤句以「選項」通稱),consumer 可經 `labels` 換字;
  焦點移到第一個出錯的控件(沒選 → 第一個圓 / 方框,「其他」→ 輸入格並帶錯誤框;只聚焦不置中捲動,產題守則 13)。清除與 aria 接線照規則 5 與 `../Field/field.spec.md`「驗證與 aria 屬性」;
  本卡沒有 Field context:`aria-errormessage` 掛在 radiogroup / 每個方框 / 輸入格(WAI-ARIA 1.2 不適用於 radio 與 group),複選群組另帶 `aria-invalid`(同 `../Checkbox/checkbox-group.tsx`)。
  選填單選題有選取時,footer 左側出現「清除選取」(user 2026-10-30 提案:「在使用者選了選項之後出現」;預選的建議解也算有選取、一打開就有 = AI 依 `../Select/select.spec.md`「Clearable」有值就顯示推導;
  tertiary sm,左 = 操作選取、右 = 提交,`../../patterns/overlay-surface/overlay-surface.spec.md`「選取類浮層的 footer 內容順序」):
  按了清掉答案與「其他」的字、鈕消失、焦點交給第一個圓(同 `../Select/select.spec.md`「Clearable」清除後焦點),右側的鈕不動;
  必答題沒有(「何時開 clearable」:必須有選擇不開),複選題沒有(方框本來就能取消)。
- 選項=**RadioGroup md 包裝不改造**(Popover all-sm 律之顯式拍板豁免;footer 鈕維持 sm 守律);
  預選項(`defaultValue`,省略=第一項)由元件在 label 後加「(建議)」。
- 進出=淡入+下滑 8、`--motion-duration-overlay`。
- A11y:`role="group"` + `aria-labelledby`;radiogroup / checkbox 原生鍵盤;必答單選題的 radiogroup 帶 `aria-required`(`../Field/field.spec.md`「SR 識別路徑」),複選群組是 `role="group"`、WAI-ARIA 1.2 的 `aria-required` 不適用,不帶。
  選填題的「(選填)」在題目那個元素裡,卡片 group、radiogroup 與複選 group 都以 `aria-labelledby` 指向它 —— 名稱含「(選填)」,讀屏跟題目一起念(複選群組沒有 `aria-required` 可報,只靠這幾個字)。

#### 產題守則(約束代理出題品質;標 ⚙ 者由元件 DEV 警告或渲染邏輯機械強制)

1. ⚙ **題數 1–3,每題必須改變代理下一步**;能一題就不問兩題;禁「計畫可以嗎?」類空問。
   ([Claude Agent SDK AskUserQuestion 1–4 題/次](https://code.claude.com/docs/en/agent-sdk/user-input),
   本 DS 收緊為 ≤3;[GOV.UK one thing per page](https://design-system.service.gov.uk/patterns/question-pages/))
2. ⚙ **一題一步**:一次只顯示一題;N≥2 才顯示小標「n / N」;第二題起可「上一題」回頭改答(答案保留),不可跳題。
   ([GOV.UK 需要才加簡單「Question 3 of 9」](https://design-system.service.gov.uk/patterns/question-pages/);
   [NN/g wizards 標出目前步、強制順序](https://www.nngroup.com/articles/wizards/))
3. ⚙ **題目=一句完整問句、以「?」結尾、句內點名決策對象**(「公告要用哪種語氣?」);禁「確定嗎?」「注意!」。
   選填題標 `optional`,「(選填)」由元件接在題目後(Header 條),代理不寫該字樣(DEV 警告)。
   ([Material 對話框標題=問句或陳述、禁 Are you sure?](https://m1.material.io/components/dialogs.html))
4. ⚙ **具名選項 2–4 個**(不含「其他」);>4 → 拆題。
   ([SDK 2–4 options](https://code.claude.com/docs/en/agent-sdk/user-input);
   [NN/g ≤5 用 radio](https://www.nngroup.com/articles/listbox-dropdown/);`../RadioGroup/radio-group.spec.md`「2-5 個選項且全部可見」)
5. ⚙ **選項標籤單行、≤10 字、無句尾標點、同題平行結構**;標籤說「選了會怎樣」,禁 A/B/C、「方案一」。
   ([Polaris ChoiceList:label based on what the option will do、無句尾標點](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/selection-and-input/choice-list.mdx))
6. ⚙ **每個具名選項附一行差異描述**:單句、無句號、不重複標籤、同題各選項比同一個維度(後果/取捨)。
   ([GOV.UK hint 單句無句號](https://design-system.service.gov.uk/components/radios/))
7. ⚙ **「其他」由元件附加、永遠最後**;代理不得自列「其他」;送出值=使用者文字(非「其他」二字);空字串不得前進。
   ([SDK:custom text as the answer value, not the word 'Other'](https://code.claude.com/docs/en/agent-sdk/user-input);
   [GOV.UK none 選項放最後](https://design-system.service.gov.uk/components/checkboxes/))
8. ⚙ **單選題必預選推薦解、推薦解排第一、「(建議)」由元件標**(代理不寫該字樣);推薦必是代理有證據的最佳解。
   例外:不可逆/安全/法律/身分稱謂類題 `noDefault` 不預選,把後果寫進描述。
   ([NN/g:pre-select the recommended when confident;例外 legal/presumptuous](https://www.nngroup.com/articles/radio-buttons-default-selection/);
   反例 [GOV.UK do not pre-select](https://design-system.service.gov.uk/components/radios/) 的顧慮是漏答/交錯答,本卡一題一步且 Skip(標題列 ×)明示用預設繼續,故取 NN/g 立場。
   【AI 推導,2026-11-11 改寫時加的前提,待 user 看過】「明示」現在只靠 × 的讀屏名稱 / 滑過提示「跳過全部，用建議繼續」(這個名字是 user 選的甲);
   觸控與不滑過去的使用者看不到任何字 —— 比 2026-11-11 前 footer 有一顆寫著字的跳過鈕時弱,這條理由是否仍撐得住「預選建議項」未經 user 確認)
9. **排序**:推薦第一;其餘常見→少見或邏輯序(小→大、保守→激進),禁字母序;「其他」最後。
   ([GOV.UK most-to-least common](https://design-system.service.gov.uk/components/radios/))
10. ⚙ **單選為預設;答案本質可複選才 `multiSelect`**(「要包含哪些章節?」):複選改 CheckboxGroup、選項不得互斥、
    **不預選**、仍附「其他」。([SDK multiSelect](https://code.claude.com/docs/en/agent-sdk/user-input);
    [GOV.UK checkboxes 不預選](https://design-system.service.gov.uk/components/checkboxes/))
11. ⚙ **Skip=「全部用預設繼續」**(非取消、非關對話);header × 恆為 Skip、是唯一入口(名字「跳過全部，用建議繼續」,2026-11-11 拿掉 footer 跳過鈕,見「關閉」條);
    footer 右側最多兩鈕(第一題只有 下一題|送出,之後 上一題/下一題|送出),左側只有選填單選題的「清除選取」。
    ([Material ≤2 actions、肯定右否定左](https://m1.material.io/components/dialogs.html):「Dialogs should not include more than two actions. A third action, such as “Learn more,” navigates away from the dialog, potentially leaving the task unfinished.」—— 上限是一般規則,「Learn more」只是舉例;
    本卡偏離它的只有第二題起左側的「清除選取」(第一題最多「清除選取」+「下一題」兩顆):user 2026-10-30 提案加的,排法依 overlay-surface footer 順序,不是 Material 放行的;[NN/g wizards allow exit midway](https://www.nngroup.com/articles/wizards/))
12. **題與題互不依賴**:後題不因前題答案改變;需要分支 → 下一回合另開一張卡。
    ([NN/g wizards self-sufficient steps](https://www.nngroup.com/articles/wizards/))
13. **每步不需捲動即可讀完**(面板寬內 4 選項+描述皆單行);描述過長=精簡,不截斷
    (`../Checkbox/checkbox.spec.md`「Clamp 政策」;ScrollArea 僅兜底)。
14. **內容真實**:題目與選項必是可辨識業務情境(檔名、頻道、客戶名);禁 Option A/B/C、Lorem(`AGENTS.md` mindset #4)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
