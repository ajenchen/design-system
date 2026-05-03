---
name: propose-options
description: Auto-invoke when about to list options / 建議 / 候選方案 to user. Forces inline 4-Q principle check(M8 world-class benchmark / M17 SSOT / Rule-of-3 / M10 下游 subsumption)per option BEFORE listing. Options that fail any Q are filtered out OR labeled with the failure;passing options listed with evidence inline. Closes the gap where Claude proposes options based on intuition without verifying the design principles, leading to user having to challenge proposals (this conv: c hook + d M18-inner-area both proposed wrong, user pushed back, retracted). After repeated correction(M13 trigger), this skill codifies "verify before propose" as runtime discipline.
---

# /propose-options — Propose-time 4-Q Gate

**目的**:Claude 對 user 提建議 / 列 option list 時,**先跑 4 題原則自檢**,通過才寫進回覆。Reject 的不列 OR 列出時標 fail 原因。

**對齊**:
- CLAUDE.md mindset #1(不取巧)+ #2(消費既有)+ #5(猶豫就問)+ #6(meta 抽象)
- M8 benchmark / M17 SSOT / M12 binary rule / 資訊治理「加規則前 3 題」
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

## Workflow(強制 4 題,缺一就 reject 此 option)

每個 candidate option 過以下 4 題,inline 寫進回覆:

### Q1 — M8 World-class benchmark
**問**:本 option ≥ 3 家 world-class DS / framework / canonical 有對照嗎?
**列**:具體實作名 / API 指向 / docs URL
**Fail**:< 3 家對照 → option 未成熟,不該 propose
**例**:
- ✅ "Polaris IconButton padding-free / Atlassian button-iconOnly p:0 / Material UI MuiSvgIcon flex-shrink:0"
- ❌ "感覺合理 / 可能對 / 沒查"

### Q1' — **M23 DS internal canonical 優先 grep**(2026-05-03 加,chevron 事件後)
**先 grep DS 既有 token / variant / pattern 命中?有 → 必對齊,Q1 外部 benchmark 只是輔證。**
**問**:propose 的 visual decision(color / size / spacing / typography / state)是否已 grep `src/design-system/tokens/` + 近親 component spec/tsx 確認沒命中既有?
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
**Fail**:純 append 沒 retire,違反「上游加 = 下游減」 + 資訊治理 anti-bloat
**例**:
- ✅ "M18 加,M12 部分 overlap 但 scope 不同共存(說明)"
- ❌ "新加 M18,既有 M-row 全保留(沒檢查)"

---

## Workflow Output Format

對 user 回覆中的 option list 必含 **inline 4-Q 表**:

```markdown
| 選項 | M23 DS grep | M8 benchmark | M17 SSOT | Rule-of-3 | M10 下游 | 結論 |
|---|---|---|---|---|---|---|
| A | DS 已有 X token,對齊 | Polaris/Atlassian/Material 輔證 | 抽 utility 共用 | 0 處 SSOT 新增 OK | 可刪 X 條冗餘 | **PASS,推薦** |
| B | 沒 grep | 只查 1 家 | 純 markdown rule | 已 3 處,無新 SSOT 動 | 純 append 沒 retire | **REJECT(M23+M8 雙 fail)** |
| C | DS 已有 Y 但 option 違 | 4 家 2:2 split 無共識 | n/a | n/a | n/a | **REJECT(M23 違反 → 自開新 tier)** |
```

**所有 fail 過 4-Q 的 option 必明示 reject + 原因**,不只 list 不過的。User 看見 reject 過程才能信 propose 過原則。

---

## Edge cases

### 緊急 / surgical bug fix
不需走全 4 題(沒 option list,直接修)。但 commit message 仍應簡述「修法已知 root cause + 不取巧」(對齊 mindset #1)。

### Option 內含 sub-option(nested)
每層各自跑 4 題。Skill 不限深度但實作上 ≥ 3 層 nested 已是設計問題,user 該停下重整。

### User 已明示要 X(非 propose)
不跑 skill。直接執行。

---

## 為什麼這 skill 必要(本 session 教訓)

User 已就「為什麼會給錯誤建議」糾正 ≥ 3 次:
- session 初:G6/G7/G8 推力,我自己沒 dogfood test → 第 3 次問才補
- 中:c hook + d M18-inner-area propose,**user sign-off 前剛好我自己覺察跑 4-Q 才撤回**
- 末:user 直接質問「為什麼會給錯誤建議?如果我答應了會直接執行嗎?」(本 skill 的觸發)

**Infra G6/G7/G8 是 post-edit / session-start 防線,沒 propose-time gate**。Claude Code event model 沒 OnAssistantMessage hook,**只能靠 model-runtime 紀律 + skill self-invoke**。本 skill 就是 mechanical 補位 — invoke 時讀本檔,4-Q 表格自然寫進回覆。

---

## Self-improvement capture

每次 invoke 完,session 結束前自問:
- (a) 是否每個 option 真跑了 4-Q 還是糊弄填表?
- (b) 是否有 reject option 曾被 list?(reject 不該被列出)
- (c) 是否 user 仍質疑 propose 品質?(若是 → 4-Q 沒抓到的 gap → 加 Q5)

回填到本 SKILL.md 或 CLAUDE.md M18(若需 escalate)。

---

## 與其他 skill 對位

| Skill | scope |
|---|---|
| `pre_write_subsumption_check.sh`(hook)| Edit/Write 已發生時 |
| `post_edit_canonical_interrogate.sh`(hook)| 寫完 canonical 後 3 題 |
| `check_governance_compliance.sh`(hook)| 寫新 hook 7 題 |
| **本 skill** `/propose-options` | **propose-time(寫進 user 回覆前)4 題** |

4 個正交 — propose 前 / write 前 / write 中 / write 後 全 cover。
