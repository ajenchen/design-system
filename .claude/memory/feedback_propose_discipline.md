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
- tsc / build:lib / typecheck:stories / tsc -b → 「程式碼(型別)檢查」
- preflight / release:preflight → 「發版前總檢查」
- smoke / runtime smoke → 「頁面實跑測試」
- commit → 「存進版本紀錄」/「已存檔」
- tree clean → 「沒有未存的改動」
- merge / merge main → 「合併回主線」
- branch → 「分支」
- grep / rg → 「全庫搜尋」
- playwright / screenshot → 「自動化瀏覽器測試」/「截圖」
- gate → 「檢查關卡」/「把關」
- verified → 「驗過了」;done → 「做完了」

**Format**:
```
### 決策 N:<一句話標題,zero jargon>

**現況**:<目前 code/spec 行為,人話>
**影響**:<不改會怎樣 / 改了會怎樣,具體>
**選項**:
- A. <做法 1>(後果:...)
- B. <做法 2>(後果:...)
- C. <不動>(後果:...)
**我推**:<A / B / C> 因 <理由>
```

**禁止**:`L1-L7` / `canonical` / `primitive` / `SSOT` / `consume` / `traits` / `M-rule` / `cva` / `tier` / `tokens` / `wrapper` 等內部術語 propose 內裸用。改翻成人話:
- canonical → 「主檔/標準寫法」
- primitive → 「共用零件」
- SSOT → 「單一資料源」
- spec → 「規格檔」
- consume → 「沿用」
- traits → 「行為類型」
- tier → 「層級」
- tokens → 「設計變數」
- wrapper → 「外殼」

**Anchor**:2026-05-15 user verbatim「要 user 決策必中文具體人話講(發生什麼/影響/選項 outcome)」。

**Mechanical enforcement**:`.claude/hooks/check_propose_discipline.sh(r1,2026-06-11 merge)` PreToolUse Edit/Write 偵測 propose pattern + jargon keyword → BLOCKER。

## Sub-rule 2 — file:line cite(原 propose_without_cite_fabrication)

**Rule**:propose 含 claim「規定 / 必配 / canonical 寫 / spec 說 / 文件規定」必附 inline file:line cite。沒 cite = 視為瞎掰,自動撤回。

**Format**:
```
**現況 + cite**:per `<file path>:<line>` 「<verbatim quote>」 → <implication>
```

**禁止**:
- 「DS canonical 規定 X」 沒 cite
- 「spec 寫 Y」沒 cite
- 「per 規範 Z」沒 cite

**Anchor**:2026-05-27 user verbatim「誰跟你說的?」— 我曾 cite「caption + muted SSOT 規定」但 grep `semantic.css:49` 是 use-case 描述非 rule。建議 propose 全 retract。

**Mechanical enforcement**:`.claude/hooks/check_propose_discipline.sh(r2,2026-06-11 merge)` PreToolUse Edit/Write 偵測 propose pattern + canonical claim 但無 file:line cite → BLOCKER。

## How to apply

每次 propose / 列 option 前 inline 跑 4-test(per M18 Q0):
1. **plain Chinese** ✓ — 0 jargon?
2. **cite present** ✓ — 「規定/必配」claim 有 file:line?
3. **option matrix** ✓ — A/B/C + outcome?
4. **我推 reason** ✓ — 推薦 + 理由?

任一 NO → 自動撤回,不送 user。

## Anti-pattern(永久 ban)

- ❌ Propose 用 jargon(canonical / SSOT / primitive 等)裸用
- ❌「DS 規定 X」「spec 寫 Y」沒 file:line cite
- ❌ 列 N options 無 outcome 描述
- ❌ 沒「我推」推薦 + 理由
- ❌「per memory」「per 規範」當 cite(memory 不是 SSOT,需指向 spec.md / code)

## 對齊原則

- M18 Q0 propose 前 6-題自檢(本 rule 是 Q0「人話」+ Q1「cite」具體化)
- M22 benchmark cite mandate
- mindset #1 不取巧:propose 用 jargon = 取巧;沒 cite = 取巧
- Linux kernel patch:每 claim cite source / Atlassian RFC discipline


## Sub-rule:選項題最終訊息必自包含(2026-06-11 第 2 次 mobile 摺疊事故)

**Rule**:turn 的「最後一條訊息」若要 user 拍板選項,必須**完整重述每個選項的人話說明 + 建議 + 理由**,禁止「選 (a) 還是 (b)」引用前文 — 手機 app 會摺疊訊息中段(tool call 之間的文字),user 只看得到最後一條。
**Anchor**:2026-06-11 R2 拍板題 6/8 完整說明寫在中段、結尾只剩「選 (a) 還是 (b)」→ user 截圖怒「叫你解釋然後又沒解釋」(同 2026-06-10 沙箱三步驟事故同 failure mode)。

## Sub-rule:URL 必獨立成行、後面不准黏任何文字(2026-06-12 第 2 次警告)

**Why**:URL 跟中文/括號黏在同一行,auto-linker 會把後綴吃進連結或讓 user 手機上點不準。User verbatim:「我不是警告過你不要再把連結混入其他文字了嗎?這樣我他媽要怎麼直接點進去正確的連結??」(前次警告 + 2026-06-12 再犯:`...netlify.app(Netlify 建置 2-3 分鐘)`)。

**How to apply**:任何 URL 一律單獨一行、行內只有 URL 本身;說明文字放上一行或下一行。Markdown link 形式 `[文字](url)` 也行,但裸 URL 絕不與其他字元同行。
