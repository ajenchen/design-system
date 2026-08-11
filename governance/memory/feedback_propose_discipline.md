---
name: Propose discipline (2-in-1 consolidated 2026-05-28) — 中文人話 + file:line cite
description: User 決策 propose 必過 2 規則:(1) 用中文具體人話講(發生什麼/影響/選項 outcome)禁 jargon(2) 含「規定/必配/canonical 寫」claim 必附 file:line cite,沒 cite = 瞎掰自動撤回
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Propose Discipline — 2 rules consolidated

User 2026-05-15 + 2026-05-27 系列 directives codified per Rule-of-3 absorb principle.
原 2 file(`feedback_propose_in_plain_chinese.md` + `feedback_propose_without_cite_fabrication_2026_05_27.md`)合併本檔。

## Sub-rule 1 — 中文人話(原 propose_in_plain_chinese;2026-05-31 擴大至所有 reply)

**Rule**:propose 給 user 拍板的決策必用中文具體人話講,禁術語 jargon。**2026-05-31 擴大**:不只 propose —— **所有給 user 的 reply / 清單 / summary** 都必繁中人話。User 看不懂英文,整段/整句英文 = reply 對 user 無效 = 白做。唯一例外:不可避免的識別碼(檔名 / token 名 / commit hash / 指令)出現時必緊跟中文解釋。工具輸出(CI log / git output)要引用 → 摘成中文重點,禁貼原始英文 dump。

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
