---
name: codify-corrections
description: Process .claude/logs/user-corrections.jsonl — the Stop-hook-harvested signals of user corrections ("不是" / "不對" / "應該" / "糾正" etc.). Dedup by session + keyword, cluster by topic, propose edits to the right home(CLAUDE.md M-row / memory feedback file / skill reference / spec.md rationale). Each cluster is a Checkpoint — user approves before edit. After codification archive processed entries. Invoke when user-corrections.jsonl > 20 entries(session_start soft reminder)or > 40 entries(hard threshold), OR quarterly. This skill closes the loop between mindset #6 "user tell me once, not twice" and actual governance text changes — without it, corrections die in logs.
---

# Codify Corrections — 把 user 糾正 log 落到 governance 文件

**目的**:`.claude/logs/user-corrections.jsonl` 是 `stop_passive_logging.sh` R2 `rule_harvest_corrections()`(原 lib/stop_harvest_corrections.sh,已 folded 進統一 Stop hook)從每 session transcript 抓到的「不是 / 不對 / 應該 / 糾正」訊號。骨架存在,但從 log 到實際 CLAUDE.md / memory / spec edit 原本全靠人工讀 + 決定寫哪,實務上堆積 = 骨架失靈。本 skill 把這條 loop 合上。

**對齊 CLAUDE.md**:
- 治理 canonical L2(per-commit)下游
- mindset #6「user tell me once,我不該要 tell me twice」執行面
- M14 AUTO integrate pipeline 第 7 層(memory / CLAUDE.md 落地)
- 稽核 vs 執行 分權:動 canonical substantive → STOP Checkpoint(本 skill 內建)

## When to run

- User 明言「處理 correction / codify / 看一下 log」
- `session_start_governance_check.sh` soft reminder(> 20 corrections)或 hard blocker(> 40)
- 季度(跟 `/knowledge-prune` 同期)
- `/knowledge-prune` Phase 0.5 external signal 可 chain 本 skill

## Non-goals

- 不改 code(`.tsx` / `.css`)— 只動 governance 文件
- 不自動 write 任何 M-row(新 Meta-Pattern 必 Checkpoint 3 — 動 canonical substantive)
- 不刪 jsonl 歷史 — 處理後 append 到 `.processed.jsonl`,raw log 保留 grep evidence
- 不重跑 harvest — harvest 是 stop_passive_logging.sh R2 rule_harvest_corrections()(原 stop_harvest_corrections.sh,已 folded)的責任

---

## Workflow(5 phases)

### Phase 0 — Scan + dedup

讀 `.claude/logs/user-corrections.jsonl`。每行格式:
```json
{"ts":"...", "session":"...", "count":N, "sample":"unescaped correction text"}
```

**dedup 規則**:
- 同 session 多行 → 只保留 count 最大那行(log 已 per-session dedup,但防萬一)
- 跨 session 同 `sample` 內容 > 80% similar(levenshtein / token ratio)→ merge

**output**:`.claude/logs/corrections-pending.md`(session-local 不 commit),每條 entry:
```
- [2026-04-22 session:abc123] sample: "不是 X,是 Y"  — occurrences: 3
```

### Phase 1 — Cluster by topic(AI judgement)

每條 entry 判斷 topic + 應落 home:

| Topic pattern | 應落 home |
|--------------|----------|
| 個人偏好 / 工作節奏 / 「我喜歡 X」| `~/.claude/.../memory/feedback_*.md` |
| 設計 canonical / 元件行為 / prop API | `packages/design-system/src/**/spec.md`(rationale 段) |
| 跨元件 meta 規則(「凡 overlay 都必 X」)| CLAUDE.md Meta-Pattern M-row(**必 Checkpoint 3**)|
| Audit protocol / skill workflow | `.claude/skills/*/references/` |
| Tool / hook 使用方式 | hook docblock or `.claude/hooks/*.sh` 修行為 |

**判斷原則**:先看 sample 是否已有 home — 若 memory 已有相似 entry → 更新既有;無 → 新建。

**output**:`phase1-clusters.md`,每 cluster 含:proposed home / proposed edit text / which jsonl entries subsumed

### ⚠️ Checkpoint 1 — Phase 1 triage

向 user present:
```
Phase 0 scan 找到 N 條 pending corrections(dedup 後 M 條)。
Phase 1 cluster:
  - P0(auto-apply)AUTO fixes to memory 現有 entry / spec rationale:X 條
  - P1(review + apply)新建 memory file / spec rationale 新段:Y 條
  - P2(STOP)新 M-row / 動 CLAUDE.md canonical substantive:Z 條(需 Checkpoint 3)

Proceed P0 auto?然後逐一 review P1?P2 分開討論?
```

**Do NOT skip**:P2 動 canonical meaning,per 稽核 vs 執行 分權 必 user sign-off。

### Phase 2 — Apply P0 + P1

**P0**(明確 home + 明確 edit):AUTO edit,commit 前最後 show diff 給 user 一次過目。

**P1**(新建 memory / spec 新段):one-by-one present → user approve → edit。

每次 Edit 後 tsc / lint 無需跑(純 governance 文件),但 MEMORY.md index 若有更新必包含。

### ⚠️ Checkpoint 2 — 新 memory 命名 3-test

每個新 memory file 過 CLAUDE.md `## 命名必過三重 test`:
1. 既有命名 pattern?
2. ≥ 2 家 world-class DS idiom?
3. 跨元件認知衝突?

Fail 任一 → 重名或拆分。

### ⚠️ Checkpoint 3 — P2 新 M-row(動 canonical substantive)

**STOP**。present 完整 proposal:
- Correction cluster 原始 samples
- Proposed M-row 文字
- World-class benchmark(≥ 3 家 DS,M8 強制)
- 被吸收的下游 M-row / specific bug / memory entries 清單(M10 下游刪)

User approve 後才 edit CLAUDE.md。

### Phase 3 — Archive processed entries

處理完畢:
```bash
# Append processed entries to .processed.jsonl(保留歷史 grep)
cat user-corrections.jsonl >> user-corrections.processed.jsonl
# Truncate main log
: > user-corrections.jsonl
```

### Phase 4 — Final report + metric snapshot

```markdown
## Codify corrections report(N 日期)

### Processed
- Total entries scanned:N
- After dedup:M
- Clustered:K

### Applied
- P0 auto:X edits to {file list}
- P1 review:Y edits
- P2 new M-row:Z(詳列)

### Subsumed downstream(M10 上游加下游減)
- {list of specific bugs / memory entries / M-row 可刪}

### Still deferred
- {entries 不適合 codify:過度零散 / scope 不清 / user 已撤回}
```

Update `.claude/logs/metric-snapshots.jsonl`:
```json
{"ts":"...","tag":"codify-corrections-run","processed":N,"p0":X,"p1":Y,"p2":Z}
```

## Self-improvement capture

```markdown
## Self-improvement capture
- 新發現 pattern:{某 topic 反覆出現 → 該抽 meta}OR "無"
- Harvest miss:{stop_passive_logging.sh R2 rule_harvest_corrections()(原 stop_harvest_corrections.sh,已 folded)沒抓到但該抓的 keyword}OR "無"
- Codify-to-home 公式漂移:{有 topic 判斷多次走錯 home → 更新 Phase 1 判斷表}OR "無"
```

---

## 與其他 skill 分工

| Skill | Scope |
|-------|-------|
| `stop_passive_logging.sh` R2 rule_harvest_corrections()(原 stop_harvest_corrections.sh,已 folded)| 抓 log — 不 codify |
| **本 skill**(`/codify-corrections`) | log → governance 文件 edit |
| `/knowledge-prune` | governance 文件 prune — 不處理新 correction |
| `/design-system-audit --deep` Phase 4.5 | chain `/knowledge-prune`;未來可 chain 本 skill |

**跟 `/knowledge-prune` 差異**:prune 是「砍冗贅」(retire),本 skill 是「吸收新訊號」(add / update)。兩者對稱,時序:先 codify(加 new)再 prune(砍 old)。

---

## 世界級對照

- GitHub CODEOWNERS diff → assignment:本 skill 類似「correction ownership assignment」
- Linux kernel `Documentation/process/howto.rst`:upstream patches go through maintainers — 我們 correction 也有「送到對的 home」的流程化
- RFCs / ADRs workflow:新 canonical 走 Checkpoint 3 等同提 ADR

本 skill 是本 DS 原創,因為 Claude Code 生態沒有同層級的「session log → governance codify」pipeline。

---

## Non-goals 重申

- 不改 code
- 不自動寫新 M-row
- 不刪歷史 log
- 不跑 harvest(是 hook 責任)
