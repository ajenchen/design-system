---
name: propose-options
description: Auto-invoke when listing options / 建議 / 候選方案. Forces inline 7-Q principle check(M8 benchmark / M17 SSOT / Rule-of-3 / M10 subsumption)per option BEFORE listing. Failures filtered or labeled. Codifies「verify before propose」runtime discipline.
---

# /propose-options — Propose-time 7-Q Gate

**目的**:Claude 對 user 提建議 / 列 option list 時,**先跑 7 題原則自檢**,通過才寫進回覆。Reject 的不列 OR 列出時標 fail 原因。

**對齊**:
- CLAUDE.md mindset #1(不取巧)+ #2(消費既有)+ #5(猶豫就問)+ #6(meta 抽象)
- M8 benchmark / M17 SSOT / M12 binary rule / 治理「加規則前 3 題」
- 本 skill 是上述 meta 的**propose-time 落地** — meta 寫成文字不夠,要 mechanical workflow 釘住

## When to invoke

**強制 invoke** 在以下情境(不靠 user 提醒):
- 寫「Option A / B / C」「選 A / B」「3 個方向」 類列表
- 寫「建議做」「該做」「提議」 類 verb
- 寫「c. d. e.」 候選清單(像本 conv 我給 c hook + d M18 那種)
- 任何「if you sign-off, I'll do X」 提案

**不 invoke**:
- User 已明示要做 X(只是 execute,不 propose)
- 純資訊回答(描述現況,不選擇)
- Bug fix 的 surgical solution(無 option,直接修)

---

## Workflow(強制 7 題,缺一就 reject 此 option)

每個 candidate option 過以下 7 題,inline 寫進回覆:

### Q0 — **Pre-ASK self-verify problem 真存在**(2026-05-18 加,absorbs Sheet/inline-action/SurfaceBody 三題誤判事件)

**問**:propose 給 user 拍板前,是否已**grep DS-wide + Read 相關 spec.md / tsx + Read consumer usage** 確認 problem **真存在**?

**為何**:M18 / M23 / M29 都管「決策過程紀律」,但**propose 給 user 前的「problem 真存在?」基本判斷**沒 codify。本 session 我 propose 3 題(Sheet 補 / 5 元件 migrate inline-action / 5 元件 migrate SurfaceBody)**全部不是真 problem** — Sheet spec 已完整、inline-action 已全消費、SurfaceBody 有意設計不該動 — 但我 propose 給 user 拍板浪費 user 時間 + 動搖 user 信任。

**強制檢查**:
1. **grep 既有 code DS-wide** — 「該 migrate 的 X 元件」真沒消費 primitive?(`rg "<primitive>" node_modules/@qijenchen/design-system/src/components/<X>`)
2. **Read 相關 spec.md** — spec 有沒有明文 codify 該設計是有意 / 例外 / 合法分支?(本 session 例:Tag inline-action colored host 例外是 spec L52-54 明寫的)
3. **Read consumer usage** — 該 pattern 已在 N 處 work fine?N ≥ 3 → 該 pattern 是 working canonical,不是 problem
4. **反問**:「如果 user 答 A,我會做什麼?該動 K 個 file?那 K 個 file 真有問題嗎?還是我假設的?」

**Fail criteria**(任一命中 → reject propose,不丟給 user):
- 沒 grep 既有就斷言「N 元件缺 X」
- 沒讀 spec 就斷言「現況違反 canonical」
- 「我推 A 因 X 比較統一」但 X 已是合法分支(spec 明文)
- propose 是 mass-migration 但沒列具體哪 K file file:line 需動

**Pass criteria**(全過才能 propose):
- ✅ 列具體 file:line 證據 problem 存在
- ✅ 列 spec.md 段落 cite 證明「現況違反 spec」
- ✅ counter-example scan 跑過:DS 其他元件用一樣 pattern → 反證「這不是 problem」
- ✅ 給 user 的 option list 含「C. 不動(理由)」且 C 經 grep verify 不是 cheap escape

**例**:
- ✅ "grep 結果 Input/NumberInput/LinkInput 3 file 都未消費 ItemInlineAction(file:line)+ spec.md L60 表格列為 expected consumer → 真 gap"
- ❌ "5 元件應該 migrate"(沒 grep / 沒 cite spec / 不知道 K 元件已 migrate / 是 colored host 合法例外)

**對應 hook**:`check_propose_pre_grep_verify.sh`(2026-05-18 加,Edit/Write `*.md` 內含「propose」/「請拍板」/「決策」keyword 但近 N turn 無 grep/Read tool call → P1 warn)

### Q1 — M8 World-class benchmark
**問**:本 option ≥ 3 家 world-class DS / framework / canonical 有對照嗎?
**列**:具體實作名 / API 指向 / docs URL
**Fail**:< 3 家對照 → option 未成熟,不該 propose
**例**:
- ✅ "Polaris IconButton padding-free / Atlassian button-iconOnly p:0 / Material UI MuiSvgIcon flex-shrink:0"
- ❌ "感覺合理 / 可能對 / 沒查"

### Q1' — **M23 DS internal canonical 優先 grep**(2026-05-03 加,chevron 事件後)
**先 grep DS 既有 token / variant / pattern 命中?有 → 必對齊,Q1 外部 benchmark 只是輔證。**
**問**:propose 的 visual decision(color / size / spacing / typography / state)是否已 grep `node_modules/@qijenchen/design-system/src/tokens/` + 近親 component spec/tsx 確認沒命中既有?
**Fail**:跳過 grep 直接搬 world-class → M23 違反(本 conv chevron 用 Ant 5 家 muted 覆蓋 DS 內 icon-only Button = neutral-9 canonical → user 4 輪糾正)
**例**:
- ✅ "grep `text-foreground` 已是 icon-only Button 預設(neutral-9 / 85%)→ 對齊;Ant cite 為輔證"
- ❌ "Ant / Material muted → 直接套(沒 grep 內部 canonical)"

### Q2 — M17 SSOT 必可傳播
**問**:本 option 動到的 canonical 有真正可執行 SSOT 嗎(token / primitive / utility)?還是只在 markdown 文字?
**Fail**:只增加 markdown 文字、沒提供 mechanical enforcement → 假 SSOT
**例**:
- ✅ "新 utility class `ICON_ONLY_BASE` 共用,2 host import"
- ❌ "spec 寫一行 rule,未來誰記得就好"

### Q3 — Rule-of-3 SSOT placement
**問**:本概念在現有 home 已 ≥ 3 處出現?該選 SSOT,其他 pointer。新加的話,SSOT 該住哪 home?
**Fail**:concept 已 ≥ 3 處仍要新增 home / 重複描述 → 違 Rule-of-3
**例**:
- ✅ "uiSize.spec.md 是 SSOT,button.spec.md / segmented-control.spec.md 1 行 pointer"
- ❌ "每個 spec 各自寫一份"

### Q4 — M10 下游吸收
**問**:本 option 加入後,既有哪些 rule / memory / bug case 被吸收可刪?
**Fail**:純 append 沒 retire,違反「上游加 = 下游減」 + 治理 anti-bloat
**例**:
- ✅ "M18 加,M12 部分 overlap 但 scope 不同共存(說明)"
- ❌ "新加 M18,既有 M-row 全保留(沒檢查)"

### Q5 — Issue list 100% mapped(2026-05-05 anti-drift,user trigger 第 5 次後新增)
**問**:plan iteration / option list 改版時,user 提的**所有** raised issue 是否 100% mapped 到本版的 step / option / 評估?**未 mapped 的逐條 explicit 標**:`done` / `folded into Step X` / `informational(無實作)` / `dropped(原因)` / `pending`。
**Fail**:silent drop / 沒 mapping table / fold 進 step 沒 trace
**例**:
- ✅ "Issue 1-14 列 mapping table,Issue 3+13 標 informational,其他 11 條 mapped"
- ❌ "改版只列新 Step,沒 walk-through user 之前提的 issue list"

---

## Workflow Output Format

對 user 回覆中的 option list 必含 **inline 7-Q 表 + Issue mapping**(plan iteration 場景):

```markdown
| 選項 | M23 DS grep | M8 benchmark | M17 SSOT | Rule-of-3 | M10 下游 | Issue cover | 結論 |
|---|---|---|---|---|---|---|---|
| A | DS 已有 X token,對齊 | Polaris/Atlassian/Material 輔證 | 抽 utility 共用 | 0 處 SSOT 新增 OK | 可刪 X 條冗餘 | covers 8/14 | **PASS,推薦** |
| B | 沒 grep | 只查 1 家 | 純 markdown rule | 已 3 處,無新 SSOT 動 | 純 append 沒 retire | covers 4/14 | **REJECT(M23+M8 雙 fail + Q5 不全)** |
```

**Plan iteration 必含 Issue ↔ Step 完整 mapping table**(不可只列新 step 表,user 看不到原 issue trace):
```markdown
| # | Issue (按 user 提出順序) | 處理 |
|---|---|---|
| 1 | <user 原文 issue> | Step X / informational / dropped(reason) |
| ... | ... | ... |
```

**所有 fail 過 7-Q 的 option 必明示 reject + 原因**,不只 list 不過的。User 看見 reject 過程才能信 propose 過原則。

---

## Edge cases

### 緊急 / surgical bug fix
不需走全 7 題(沒 option list,直接修)。但 commit message 仍應簡述「修法已知 root cause + 不取巧」(對齊 mindset #1)。

### Option 內含 sub-option(nested)
每層各自跑 7 題。Skill 不限深度但實作上 ≥ 3 層 nested 已是設計問題,user 該停下重整。

### User 已明示要 X(非 propose)
不跑 skill。直接執行。

---

## 為什麼這 skill 必要(本 session 教訓)

User 已就「為什麼會給錯誤建議」糾正 ≥ 3 次:
- session 初:G6/G7/G8 推力,我自己沒 dogfood test → 第 3 次問才補
- 中:c hook + d M18-inner-area propose,**user sign-off 前剛好我自己覺察跑 7-Q 才撤回**
- 末:user 直接質問「為什麼會給錯誤建議?如果我答應了會直接執行嗎?」(本 skill 的觸發)

**Infra G6/G7/G8 是 post-edit / session-start 防線,沒 propose-time gate**。Claude Code event model 沒 OnAssistantMessage hook,**只能靠 model-runtime 紀律 + skill self-invoke**。本 skill 就是 mechanical 補位 — invoke 時讀本檔,7-Q 表格自然寫進回覆。

---

## Self-improvement capture

每次 invoke 完,session 結束前自問:
- (a) 是否每個 option 真跑了 7-Q 還是糊弄填表?
- (b) 是否有 reject option 曾被 list?(reject 不該被列出)
- (c) 是否 user 仍質疑 propose 品質?(若是 → 7-Q 沒抓到的 gap → 加 Q5)

回填到本 SKILL.md 或 CLAUDE.md M18(若需 escalate)。

---

## 與其他 skill 對位

| Skill | scope |
|---|---|
| `pre_write_subsumption_check.sh`(hook)| Edit/Write 已發生時 |
| `post_edit_canonical_interrogate.sh`(retired/未實作 — mindset enforcement)| 寫完 canonical 後 3 題 |
| `check_governance_compliance.sh`(retired/未實作 — 靠 `check_propose_pre_grep_verify.sh` + 加 hook 前 3 題)| 寫新 hook 7 題 |
| **本 skill** `/propose-options` | **propose-time(寫進 user 回覆前)7 題** |

4 個正交 — propose 前 / write 前 / write 中 / write 後 全 cover。
