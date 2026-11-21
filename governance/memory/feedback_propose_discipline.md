---
name: Propose discipline (2-in-1 consolidated 2026-05-28) — 中文人話 + file:line cite
description: User 決策 propose 必過 2 規則:(1) 用中文具體人話講(發生什麼/影響/選項 outcome)禁 jargon(2) 含「規定/必配/canonical 寫」claim 必附 file:line cite,沒 cite = 瞎掰自動撤回
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Propose Discipline — 2 rules consolidated

User 2026-05-15 + 2026-05-27 系列 directives codified per Rule-of-3 absorb principle;原 2 file(`feedback_propose_in_plain_chinese.md` + `feedback_propose_without_cite_fabrication_2026_05_27.md`)合併本檔。

## Sub-rule 1 — 中文人話(原 propose_in_plain_chinese;2026-05-31 擴大至所有 reply)
**Rule**:propose 給 user 拍板的決策必用中文具體人話講,禁術語 jargon。**2026-05-31 擴大**:不只 propose —— **所有給 user 的 reply / 清單 / summary** 都必繁中人話。User 看不懂英文,整段/整句英文 = reply 對 user 無效 = 白做。唯一例外:不可避免的識別碼(檔名 / token 名 / commit hash / 指令)出現時必緊跟中文解釋。工具輸出(CI log / git output)要引用 → 摘成中文重點,禁貼原始英文 dump。**做事中途插的文字 user 都看得到**(2026-11-15):只寫 user 需要知道的(發現的問題、要 user 決定的、做完的結果),一律中文;沒有必要的進度句不寫。user 原話「為何你他媽又一直回覆我英文？到底要我教你幾次？」「若是沒必要讓我知道的垃圾訊息，你評估真的是垃圾，那就不用讓我看到吧？」;機械 = 同一支 hook 的中途文字檢查。
**Anchor(2026-05-31)**:user verbatim「你他媽問題後面一長串英文是怎樣?我看不懂英文」。
**Anchor(2026-07-18,第 3 次犯 — 這次是工具/開發術語)**:user verbatim「幹你娘可以講中文嗎?不是講過了?」。整個 session 一直裸夾 `tsc / build:lib / typecheck:stories / preflight / smoke / commit / merge / tree clean / branch / grep / playwright` 等**工具與開發術語**(前兩次抓的是 DS 術語,這次是 dev/工具術語,同一 failure mode)。→ 工具/指令名也算 jargon,必翻中文。**必翻對照**:
- tsc/build/typecheck →「程式碼(型別)檢查」;preflight →「發版前總檢查」;smoke →「頁面實跑測試」
- commit/tree clean/merge/branch →「存進版本紀錄/沒有未存改動/合併回主線/分支」
- grep/rg/playwright/screenshot/gate/verified/done →「全庫搜尋/自動化瀏覽器測試/截圖/把關/驗過了/做完了」

**Format**:`### 決策 N:<一句話標題>` → **現況**(目前行為,人話)→ **影響**(不改/改了會怎樣)→ **選項** A/B/C 各附後果 → **我推** X 因 Y。
**禁止**:`L1-L7` / `canonical` / `primitive` / `SSOT` / `consume` / `traits` / `M-rule` / `cva` / `tier` / `tokens` / `wrapper` 等內部術語 propose 內裸用。翻譯:canonical/primitive/SSOT/spec →「主檔或標準寫法/共用零件/單一資料源/規格檔」;consume/traits/tier →「沿用/行為類型/層級」;tokens/wrapper →「設計變數/外殼」。
**Anchor**:2026-05-15 user verbatim「要 user 決策必中文具體人話講(發生什麼/影響/選項 outcome)」。
**Mechanical enforcement**:`packages/design-system/ds-canonical/hooks/check_propose_discipline.sh` r1(2026-06-11 merge)由 provider adapters 接入，偵測 propose pattern + jargon keyword → BLOCKER。

## Sub-rule 2 — file:line cite(原 propose_without_cite_fabrication)
**Rule**:propose 含 claim「規定 / 必配 / canonical 寫 / spec 說 / 文件規定」必附 inline file:line cite。沒 cite = 視為瞎掰,自動撤回。
**Format**:`**現況 + cite**:per <file>:<line> 「<逐字引文>」 → <推論>`
**禁止**:「DS canonical 規定 X」/「spec 寫 Y」/「per 規範 Z」沒 cite。
**Anchor**:2026-05-27 user verbatim「誰跟你說的?」— 我曾 cite「caption + muted SSOT 規定」但 grep `semantic.css:49` 是 use-case 描述非 rule。建議 propose 全 retract。
**Mechanical enforcement**:同一 canonical hook 的 r2 由 provider adapters 接入，偵測 propose pattern + canonical claim 但無 file:line cite → BLOCKER。

## How to apply
每次 propose / 列 option 前 inline 跑 4-test(per M18 Q0):(1) 0 jargon?(2)「規定/必配」claim 有 file:line?(3) A/B/C + outcome?(4) 有「我推」+ 理由?任一 NO → 自動撤回,不送 user。

## Anti-pattern(永久 ban)
- ❌ Propose 用 jargon(canonical / SSOT / primitive 等)裸用
- ❌「DS 規定 X」「spec 寫 Y」沒 file:line cite
- ❌ 列 N options 無 outcome 描述
- ❌ 沒「我推」推薦 + 理由
- ❌「per memory」「per 規範」當 cite(memory 不是 SSOT,需指向 spec.md / code)

## 對齊原則
M18 Q0(本 rule 是「人話」+「cite」的具體化)/ M22 benchmark cite mandate / mindset #1 不取巧(用 jargon、沒 cite 都是取巧)/ Linux kernel patch 每 claim cite source。
## Sub-rule:選項題最終訊息必自包含(2026-06-11 第 2 次 mobile 摺疊事故)
**Rule**:turn 的「最後一條訊息」若要 user 拍板選項,必須**完整重述每個選項的人話說明 + 建議 + 理由**,禁止「選 (a) 還是 (b)」引用前文 — 手機 app 會摺疊訊息中段(tool call 之間的文字),user 只看得到最後一條。
**Anchor**:2026-06-11 R2 拍板題 6/8 完整說明寫在中段、結尾只剩「選 (a) 還是 (b)」→ user 截圖怒「叫你解釋然後又沒解釋」(同 2026-06-10 沙箱三步驟事故同 failure mode)。
## Sub-rule:URL 必獨立成行、後面不准黏任何文字(2026-06-12 第 2 次警告)
**Why**:URL 跟中文/括號黏在同一行,auto-linker 會把後綴吃進連結或讓 user 手機上點不準。User verbatim:「我不是警告過你不要再把連結混入其他文字了嗎?這樣我他媽要怎麼直接點進去正確的連結??」(前次警告 + 2026-06-12 再犯:`...netlify.app(Netlify 建置 2-3 分鐘)`)。

**How to apply**:任何 URL 一律單獨一行、行內只有 URL 本身;說明文字放上一行或下一行。Markdown link 形式 `[文字](url)` 也行,但裸 URL 絕不與其他字元同行。

## Sub-rule 3 — user 以問句結尾必正面回答(2026-08-09)
**Rule**:user 訊息以「好不好 / 行不行 / 可以嗎 / 對吧 / 是不是 / 不是更 X 嗎」結尾 = **要一個裁決**,不是要一段分析。**第一句必先給「是 / 不是 / 有條件的是(條件是什麼)」**,再展開理由與代價。鋪陳分析卻不表態、或反問回去 = 結論永遠懸空,下一輪雙方又要重辯同一題。

**連帶(同日同一則 user 訊息抓出)**:**禁自己虛構一個矛盾再自己否掉**(「這看起來衝突…其實不衝突」)。有疑問直接問,沒疑問就別提——這屬既有錯誤類型「自己製造矛盾(加戲)」。

**Anchor(2026-08-09)**:user verbatim「我他媽每次以問句結尾,你他媽經常都不正面回答,難怪你會經常不知道結論到底是什麼啊,我問你好不好、行不行,你難道就不能腳踏實地好好評估正面回覆嗎?」+ 同則「到底是誰說這裡衝突了?我他媽沒說過這裡衝突吧?你提及此又說其實沒衝突是什麼意思?浪費我的時間?」。

**Why**:不正面回答會造成**結論漂移**——user 以為講定了,AI 沒登記成結論,下一輪就被當未決題重辯。與 [[meta-patterns]] M10 sub-rule「已成立的結論必須當場登記進總帳」是同一個 failure 的兩端。

**How to apply**:回覆開頭先一句表態;若真的無法表態,明說「我還缺什麼才能判」,不要用分析填充。

## Sub-rule 4 — 規則改動必附「具體情境 → 具體結果」表(2026-08-09)
**Rule**:任何版位／互動規則的改動,**不得只寫機制**。必須同時附一張表:**列出具體情境,逐格寫出直接答案**(會不會 X / 會不會 Y / 使用者看到什麼 / 關掉回到哪)。寫完機制就交出去 = 逼 user 自己推,而且推不出來就得一題一題戳。

**Anchor(2026-08-09)**:改完「一律疊加、不分類」之後,我寫了整段機制說明,卻沒有回答最直接的問題「從 agent 點的預覽到底會不會蓋住 agent?會不會重置舞台?」。user verbatim:「你他媽你腦袋真的有清楚嗎?那 Ai agent 點下去的預覽modal到底是會不會蓋住 Ai agent?還是重置舞台?你他媽話都講得不清楚,難怪規格書寫得跟屎一樣…你到底要怎樣才能強迫自己思考周到?每次都要我一個一個戳?」

**Why**:機制正確 ≠ 讀者能推出結果。規則交錯時(疊加/重置/幾何/來源)人腦要同時持有四個維度才推得出一格答案——那是作者的工作,不是讀者的。

**How to apply**:改規則 → 立刻自己跑 6-10 個具體情境 → 每格寫**直接答案**(會/不會,不是「依 X 而定」)→ 表放在規則正上方或正下方。**表跑不出來 = 規則還沒定完,不准交。**

## Sub-rule 5 — 提「建 token」前必先過 token-system.spec.md「判斷流程」(2026-09-16;2026-11-17 指標改住處)
**Rule**:任何提案或回覆出現「建 token / 立成 token / 新 token」,必先逐題貼出 `packages/design-system/src/tokens/token-system.spec.md`「判斷流程」的答案(第 0 題 (a)(b)(c) 哪一條成立、第二個讀者是誰;第 1、2 題分類;命名照 `rules/ui-development.md`「Token 命名 4 條硬規則」),沒貼 = 撤回。(當年的 README「新增 token 的 criteria」段已併入該處,README:3 改指 token-system.spec.md。)
**Anchor(2026-09-16)**:工具列搜尋框下限 160px,我憑 M17「三處以上要抽出來」直接寫「四處消費所以立成 token」,沒讀 README、沒提名字;user:「為何你這次又沒有仔細全盤查證 ds 的 token 建立守則??」。真相:消費者只有四支示範、零元件,該抽 `stories-helpers/` 零件不是 token。
**Why**:M17 是 token / primitive / utility 三選一,我把它預設成 token;README 早寫明消費者定義,缺的是提案前的強制對照(AGENTS.md 任務導航表「新增 token」列本來就要求先讀)。

## Sub-rule 6 — 題目交給 user 之前必過四道篩(2026-09-25)
**Rule**:任何一題要列給 user 決定前,逐題回答四問,任一題答「是」就**不准問**,改成直接照答案做或直接收掉:(1) user 已經說過的原則推得出答案嗎?(例:「點擊範圍跟看得到的範圍對齊」→ 按鈕之間的空隙不可能算點到);(2) 世界級其實一致嗎?(一致就照做,不叫選擇題;例:選單按下就開 —— Radix 與 React Aria 同為按下開,React Aria 原始碼註解 "For consistency with native, open the menu on mouse/key down");(3) 現行規格已經寫明而且沒壞嗎?(例:側欄列按下不變化,規格明文);(4) 是已經發版、跟這次任務無關的舊事嗎?**研究清單上的題目 ≠ 要問的題目**,轉交前必過篩;題目也要寫成「畫面上看得到什麼 → 要你選什麼」,禁止只給代號。理由:一題假議題的代價是 user 對所有決策的信任。
**Anchor(2026-09-25)**:把一份 AI 自己寫的研究題單(F 模型 D3)原封轉給 user,四題裡三題早有答案、一題是已發版的舊事。user:「你是認真在問我這個問題？你為什麼會認為可以？」「你他媽為何現在才在問我這個問題？世界級的設計在這裡是有分歧嗎？你他媽是真的有理由另闢那麼多新戰場嗎？」「這個早就決定拍板了，你他媽可以不要拿已經發版的東西再來問我嗎？除非跟這次的任務有關，否則不要在那邊翻舊帳，明明就發版了」。

## Sub-rule 7 — 給 user 的決策頁一律開新的,只放「要你決定」與「要你看」(2026-10-27)
**Rule**:批次收尾要 user 拍板 / 檢視時,做一份**全新 artifact**(新檔路徑 = 新網址),不在舊確認頁或總覽頁上追加;內容只有兩類:真的需要 user 決策的題目(附原話、選項、前後圖)、需要 user 看的東西(前後圖、要說「可以改」的基準圖、預覽站)。已定案、只知會、過程紀錄一律不放。
**Anchor(2026-10-27 10:43)**:user verbatim(原訊息分三行)「到時候按照工作流程規範把真的需要我決策的東西以及需要我看的」「整理成一份新的 artifact,不要混在舊的內容」「避免造成我的閲讀負擔」。
**Why**:舊確認頁 v1→v10 一路追加,已答與未答混在一起,user 每次都要重讀全部才找得到新題。**How to apply**:回答 user 的判讀照四類分(選定 / 有條件同意 / 提問要回答 / 未回應),只有「提問要回答」「未回應」與新產生的真取捨進新頁。
**「要你看」的範圍(2026-11-06 補)**:只放**要用眼睛判斷**的 —— 元件畫面 / 互動、範例的 UI 結構有變,才截圖、才給前後圖。**純文字改動、說明頁(非範例)的版寬 / 間距小調整**:不截圖、不產對照圖,只做規格一致性檢查(描述跟規格與其他頁沒有矛盾);**文字的意思變了** → 不是圖,改列決策題(先過 Sub-rule 6 四道篩)。每一項都要帶脈絡(在哪一頁、為什麼改、改前改後各是什麼),**禁止只丟代號**。要你決定的題目照 Sub-rule 6 先篩過才進頁。
**Anchor(2026-11-06,user 看到「要你看」第 60 題)**:user verbatim「我看到第60題了，我他媽覺得很奇怪，為何單純文字改動也要截圖讓我比對？光為了文字改動而進行截圖這件事就十分奇怪了，結果還要我比對？且非範例的文字部分的內容的版面調整也十分minor，確定token有用在刀口上？ 文字內容的部分不就確保描述有SSOT沒有矛盾即可嗎？你要我看圖面的變化幹嘛？浪費我的token也浪費我的時間欸」(同則後段講備註題怎麼處理,此處不引)。同批第 10 題留言:「Dialog 的設計規格的範例拿掉的脈絡是什麼？你這樣去脈絡化解釋這些東西，我他媽怎麼看得懂？」→ 每項帶脈絡。**Why**:這條 11-06 只寫在暫存筆記,沒進 repo;11-10 第 1 批的代理提示詞就漏了「文字改動只做一致性檢查、意思變了改列決策題」與四道篩。寫在這裡,之後產「要你看」頁的人讀得到。
**基準圖審核頁同一條(2026-11-17 補)**:重拍審核包只要有一個像素不同就列為可核准(`scripts/apply-approved-baselines.mjs`),**但給 user 看的只放這次 PR 裡元件、範例或規格(SSOT)有變的那幾張**,每張裁出變了的那一塊、附依據(哪次決策 / 哪條規格);判斷「這次 PR 改了什麼」用同一台機器拍 main 與 PR 頭比對,不用審核包的「舊基準圖 vs 新圖」(那會把舊基準圖落後的差異也算進來)。Storybook 說明文字、設計規格頁間距、舊基準圖落後、字型邊緣差異由 AI 逐張自查,頁上寫明「回『可以改』時一起換」,同一句「可以改」涵蓋整批。
**Anchor(2026-11-17)**:第一版審核頁列了 106 張。user verbatim「然後不要給我看我不需要看的東西」「我只需要看元件或是範例本身或是 ssot 有動到的部分,我不是都一直強調ssot嗎？」「其他storybook上輔助說明的文字之類等完全不影響消費者的調整應該不需要我再次檢查吧？那些東西你自己檢查確認就好了吧？」→ 改版剩 22 張 / 6 組。

## Sub-rule 8 — 引 user 原話當依據前,先比「它回答的那一題 / 情境」不是比「關鍵字」(2026-10-28;2026-11-15 補範圍與效率版)
**Rule**:拿 user 舊話當理由去**擋 / 撤回 / 擴大**這次的工作時,先寫一行「原題:」(原話回答的是哪一題:哪個元件、誰蓋在誰上面、在解什麼問題)再對照這次的情境;兩者條件不同就**不准**當依據,改成從規格推,推不出就問 user。原話只用來證明「user 定過這件事」,不用來替新情境找撐腰。**拿原話當範圍 / 限制時,範圍只從原話字面 + 它回答的那一題推**;AI 解讀欄、帳本摘要、交接清單的轉述都不是範圍;「不要改壞 X」≠「不要改 X」。子代理的引文推論,主 session 轉述給 user 前必親自核對原題。
**Anchor**:一週內三犯 —— 09-18「因為視覺就是要在各種情況營造對稱感吧？」(講 DatePicker 兩張月曆)被套到容器底部;04-29 cell 問句被標成定案;09-04 D12「按鈕可能已經蓋到了表格的捲軸，但點按鈕仍應該觸發按鈕的事件」(講 z-index 高於表格的浮動鈕)被套到側欄自己的捲軸蓋自己的列鈕,還據此改了全 DS 捲軸行為。user 10-28:「我不太明白你最近為什麼都要把我之前的話去脈絡化來解讀」「root cause是什麼？」
**Why**:「每個改動都要附 user 依據」的規矩,讓找依據的人去語料裡搜關鍵字湊引文;脈絡稽核只比對主題字眼(按鈕 / 捲軸),沒比對情境條件;主 session 又直接轉述子代理結論。
**Anchor 2(2026-11-15,第四犯)**:原話「bulkactionbar原本就是正確正常的，你他媽不要給我改壞喔」(`tmp/wip-2026-10-13/ssot-consolidated/user-answers-2026-10-21.md:18`)的原題是「B1 附圖 BulkActionBar」—— B1 問留言框送出鈕要不要靠左,BulkActionBar 只是對照圖;當時 AI 解讀欄寫成「BulkActionBar 一律不動」= 把範圍讀寬,11-11 因此擱置說明頁小標(C11);11-15 審查代理拿這筆摘要說 A13 的說明頁小標修正「跟 C11 擱置衝突」,主線沒核原題就撤回。user 11-15 第一則(‘…‘ 內是 user 引我的原句):「‘審查發現它跟交接清單 C11「擱置」那條衝突。我查到你 10-21 的原話：「bulkactionbar原本就是正確正常的，你他媽不要給我改壞喔」（ssot-consolidated/user-answers-2026-10-21.md:18）。‘我指的是元件本身或是範例本身，你確定你有理解我的意思？還是你又去脈絡化了？若是的話，真的是非常可惡，我已經警告過你多少次不要把我的回覆去脈絡化解讀，root cause 到底是什麼？？？」;第二則:「你要確保你他媽不會一直重蹈覆徹，之前有警告過你不要把我的回覆去脈絡化，然後就導致你不斷浪費我的token 做很多沒意義的回覆的查證，甚至導致每件任務的執行都變得很慢，你他媽可以先研究看看到底要怎麼取得平衡，到底怎樣最有效率嗎？？？不要一直重蹈覆轍，我要你不要去脈絡化也不要浪費我的token」。**為什麼重犯【AI 推導 2026-11-15】**:規則只住在這份檔;索引那一行沒提到它;沒有任何機械檢查;審查代理拿摘要(AI 解讀欄 + 交接清單)說「衝突」,主線沒核原題就照做。
**How to apply(效率版 —— user 11-15 第二則要的平衡:不去脈絡化,也不浪費 token)**:(1) 只有拿原話去**擋 / 撤回 / 擴大**工作時才查,而且只查一件事:原話回答的那一題,回覆寫一行「原題:…」;其他引用不查。(2) 範圍取最窄的字面讀法。(3) 讀完仍不確定:動作可逆 → 照規格做、回覆裡一行說明;不可逆 → 問 user 一句。**不**為了證明自己沒讀錯而派代理、開查證 workflow、寫長報告。規格行優先於原話。機械:`packages/design-system/ds-canonical/hooks/stop_self_audit.sh` Mechanism 8b(引原話 + 同句或下一句拿它當不動 / 撤回 / 擱置等理由 + 整段沒有「原題:」→ BLOCKER)。

## Sub-rule 9 — token 只花在 user 要的任務上:沒證明是問題不開新戰場、決議過或要你先忽略的不翻冷飯(2026-11-04;同晚兩次更正)
**Anchor**:user 2026-11-04 23:16 原話「請確保你沒有沒來由另開新戰場且也沒有把以前決議過或是明確要你先忽略的事情又重新拿出來冷飯熱炒浪費我的時間也浪費我的token,確保你他媽把所有token都用在真的要你做的任務上 我他媽已經連續好幾個禮拜token都被你用光結果任務都沒做完」。**更正 1**(11-04 23:45 記入):user 23:40 原話「並不是說完全不能另開新戰場，我他媽上面講得很明確吧？要有條件的開，確認真的是問題才開，且若已經做了且確定有合理的理由，你確定要全砍？」。**更正 2**(11-05 00:05 記入,撤回 AI 23:50 自己加的一句:既有、已發布的樣式跟規格對不上也不翻案、不問):user 原話「你他媽這是什麼因噎廢食？？？？？跟規格對不上肯定是要翻案要修的確保ssot不是才是最重要的目標嗎？？？？？？且之前的設計或許真的可能有問題啊，可以在我要求 deep audit或是特別針對某部份研究時去深入研究啊 針對這個問題的處理的問題，我認為就只是針對某些地方的對比度的檢查可以先從寬 而不是叫你完全耍廢忽視真的是問題的問題欸」。出處:`tmp/wip-2026-10-13/ssot-consolidated/memory-rules-rescued-2026-11-03.md:30`、`:33`、`:34`(11-04 只寫進 home 快取 `feedback_token_budget_scope.md`、沒進 repo,開 session 的記憶同步會把它蓋掉;本條是 repo 版。token 帳見 `tmp/wip-2026-10-13/MASTER-TODO.md` §0c)。
**Rule**(AI 依上面三段原話整理、已含兩次更正,不是 user 逐字):每項先標來源(user 要的 / 交付必需 / AI 自己發現的)。AI 自己發現的分三類 —— ① 已實測或重現、違反既有規格、看得到的錯或讓 CI 誤判 → 做;② 已經做完而且理由成立 → 保留,不為了省 token 全砍;③ 只是待查 / 核對 / 讀回、沒證明出過問題的工具改良 → 不開,只記。**程式跟規格對不上 = 照修,不管多舊**;重開 user 拍板過的設計本身好不好,只在 user 要求深度稽核或指定研究那一塊時;某些地方的對比度檢查先從寬(錨例:有色 Tag 淡底字),仍追蹤、不忽視。列題給 user 前先查 user 是否說過「先忽略 / 維持 / 照你建議」(查法照 Sub-rule 8 效率版)。跨 provider 的獨立 / 對抗審查只在明確要求時設(AGENTS.md「Independent second opinion」);多包工作的審查照 `packages/design-system/ds-canonical/rules/work-process.md`;代理一段只做一件事,結果寫檔、回覆只回結論。
**How to apply**:價值閘、審查幾輪、實作 / 審查分工與本機 / CI 各跑什麼,照 `packages/design-system/ds-canonical/rules/work-process.md`(本條不重述);小修正能擴既有閘就擴,不每項新寫一支閘。
