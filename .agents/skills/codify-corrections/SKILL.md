---
name: codify-corrections
description: Process $GOVERNANCE_STATE_DIR/user-corrections.jsonl — the Stop-hook-harvested signals of user corrections ("不是" / "不對" / "應該" / "糾正" etc.). Dedup by session + keyword, cluster by topic, and apply edits to the canonical owner(ds-canonical rule / repository memory / canonical skill reference / spec.md rationale) under the shared authority classifier. After codification archive processed entries in the same Git-owned runtime state root. Invoke when user-corrections.jsonl exceeds 40 entries(session_start hard blocker; there is no soft reminder), when the user asks, OR quarterly.
---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: packages/design-system/ds-canonical/skills/codify-corrections/SKILL.md; provider: codex; do not edit this adapter view. -->

# Codify Corrections — 把 user 糾正 log 落到 governance 文件

**目的**:`$GOVERNANCE_STATE_DIR/user-corrections.jsonl` 是 `packages/design-system/ds-canonical/hooks/stop_passive_logging.sh` R2 `rule_harvest_corrections()`(原 lib/stop_harvest_corrections.sh,已 folded 進統一 Stop hook)從每 session transcript 抓到的「不是 / 不對 / 應該 / 糾正」訊號。`$GOVERNANCE_STATE_DIR` 必須是 trusted adapter 提供的 Git-owned `<git-dir>/governance-runtime/` 子路徑；任何 provider home 都不是 telemetry authority。骨架存在,但從 runtime signal 到實際 canonical rule / repository memory / spec edit 原本全靠人工讀 + 決定寫哪,實務上堆積 = 骨架失靈。本 skill 把這條 loop 合上。

**對齊 canonical governance**:
- 治理 canonical L2(per-commit)下游
- mindset #6「user tell me once,我不該要 tell me twice」執行面
- `packages/design-system/ds-canonical/rules/meta-patterns.md` M14 AUTO integrate pipeline 第 7 層(memory / canonical rule 落地)
- **分權(本檔只寫這一次,以下各 Phase / Gate 都照這句)**:照共同 bootstrap(repo 根的共用指令檔)「# 自主執行 canonical」—— 純工程／治理 canonical substantive(含新 engineering M-row)依 evidence AUTO,不得把工程判斷轉交 user;只有會改產品／UI／UX SSOT、且仍有真取捨才是 P2H(human-only);independent review 只在 task／deliverable 明確要求時才加,user waiver 要記錄、不得冒充已做,缺席不阻擋 P2E

## When to run

**前提**:輸入檔 `user-corrections.jsonl` 是功能狀態,不看遙測開關(2026-11-21 起):`stop_passive_logging.sh` R2 只在啟動 hook 的 adapter 給了本 repo Git 目錄下的 runtime root、且不是 `GOVERNANCE_READ_ONLY=1` 時才寫(直接手動跑 hook、CI replay、hooks:test 都不寫;條件見 `_log-fire.sh` 檔頭「兩種寫入、兩道開關」),而且只在 transcript 裡抓到糾正字樣時才新增一列。`session_start_governance_check.sh` Check 3 只有一條:> 40 筆 → BLOCKER,沒有 soft reminder。檔案不存在時先分清是哪一種:寫入條件不成立 → 記「無輸入、儀器全盲」;條件成立但還沒抓到糾正 → 記「0 筆」。不要一律當成「沒有糾正」。

- User 明言「處理 correction / codify / 看一下 log」
- `session_start_governance_check.sh` Check 3 hard blocker(> 40 筆)
- 季度(跟 `/knowledge-prune` 同期)
- `/knowledge-prune` Phase 0.5 external signal 可 chain 本 skill

## Non-goals

- 不改 code(`.tsx` / `.css`)— 只動 governance 文件
- 不自行發明產品／UI／UX語意(工程治理 M-row 照檔頭分權句)
- 不刪 jsonl 歷史 — 處理後 append 到 `.processed.jsonl`,raw log 保留 grep evidence
- 不重跑 harvest — harvest 是 stop_passive_logging.sh R2 rule_harvest_corrections()(原 stop_harvest_corrections.sh,已 folded)的責任

---

## Workflow(5 phases)

### Phase 0 — Scan + dedup

讀 `$GOVERNANCE_STATE_DIR/user-corrections.jsonl`。若 trusted adapter 未提供安全的 Git-owned runtime state，fail closed 並報告「無可信 correction evidence」，不得回退讀 provider home。每行格式:
```json
{"ts":"...", "session":"...", "count":N, "sample":"unescaped correction text"}
```

**dedup 規則**:
- 同 session 多行 → 只保留 count 最大那行(log 已 per-session dedup,但防萬一)
- 跨 session 同 `sample` 內容 > 80% similar(levenshtein / token ratio)→ merge

**output**:`$GOVERNANCE_STATE_DIR/corrections-pending.md`(session-local 不 commit),每條 entry:
```
- [2026-04-22 session:abc123] sample: "不是 X,是 Y"  — occurrences: 3
```

### Phase 1 — Cluster by topic(AI judgement)

每條 entry 判斷 topic + 應落 home:

| Topic pattern | 應落 home |
|--------------|----------|
| 個人偏好 / 工作節奏 / 「我喜歡 X」| `governance/memory/feedback_*.md` |
| 設計 canonical / 元件行為 / prop API | `packages/design-system/src/**/spec.md`(rationale 段) |
| 跨元件 meta 規則(「凡 overlay 都必 X」)| `packages/design-system/ds-canonical/rules/meta-patterns.md` M-row(**必 Gate 3 evidence + authority classification**)|
| Audit protocol / skill workflow | `packages/design-system/ds-canonical/skills/*/references/` |
| Tool / hook 使用方式 | `packages/design-system/ds-canonical/hooks/` 的 docblock 或 canonical hook 行為 |

**判斷原則**:先看 sample 是否已有 home — 若 memory 已有相似 entry → 更新既有;無 → 新建。

**output**:`phase1-clusters.md`,每 cluster 含:proposed home / proposed edit text / which jsonl entries subsumed

### Phase 1.5 — Authority classification + triage receipt

在 `$GOVERNANCE_STATE_DIR` 寫 session-local triage receipt(分權照檔頭那句)：
```
Phase 0 scan 找到 N 條 pending corrections(dedup 後 M 條)。
Phase 1 cluster:
  - P0(auto-apply)AUTO fixes to memory 現有 entry / spec rationale:X 條
  - P1(engineering review + apply)新建 memory file / engineering spec rationale 新段:Y 條
  - P2E(AUTO)新 engineering M-row / governance substantive:Z 條
  - P2H(HUMAN-ONLY,檔頭分權句的停止類):K 條

Execution order:P0 → P1 → P2E；P2H 若有則 batch-at-end 一次提請產品決策。
```

**Do NOT skip authority classification**:每一條都要分進 P0／P1／P2E／P2H;分法照檔頭分權句。

### Phase 2 — Apply P0 + P1

**P0**(明確 home + 明確 edit):AUTO edit，commit 前記錄 diff receipt。

**P1**(新建 memory / engineering spec 新段):由 agent 逐項以 canonical evidence review 後 edit；若內容會改產品／UI／UX SSOT，照檔頭分權句重新分類。

每次 Edit 後 tsc / lint 無需跑(純 governance 文件),但 MEMORY.md index 若有更新必包含。

### Gate 2 — 新 memory 命名 3-test

每個新 memory file 過 `packages/design-system/ds-canonical/references/naming-conventions.md` 的命名三重 test:
1. 既有命名 pattern?
2. ≥ 2 家 world-class DS idiom?
3. 跨元件認知衝突?

Fail 任一 → 重名或拆分。

### Gate 3 — P2 新 M-row(動 canonical substantive)

先產完整 evidence package:
- Correction cluster 原始 samples
- Proposed M-row 文字
- World-class benchmark(≥ 3 家 DS,M8 強制)
- 被吸收的下游 M-row / specific bug / memory entries 清單(M10 下游刪)

P2E 由最高 certified capability 依 canonical evidence、tests 與 hard gates 自主收斂後直接 edit `packages/design-system/ds-canonical/rules/meta-patterns.md`(review 與 waiver 照檔頭分權句)。P2H 等 user 決定產品／UI／UX 方向後才 edit。Generated provider instruction/view 只能由 adapter materialize，禁止反向手改。

### Phase 3 — Archive processed entries

處理完畢:
```bash
# 在同一個安全的 $GOVERNANCE_STATE_DIR 內 append processed entries(保留歷史 grep)
cat "$GOVERNANCE_STATE_DIR/user-corrections.jsonl" >> "$GOVERNANCE_STATE_DIR/user-corrections.processed.jsonl"
# Truncate main log
: > "$GOVERNANCE_STATE_DIR/user-corrections.jsonl"
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

Update `$GOVERNANCE_STATE_DIR/metric-snapshots.jsonl`:
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
- RFCs / ADRs workflow:新 canonical 走 Gate 3 evidence，誰拍板照檔頭分權句

本 skill 是本 DS 原創,因為常見 agent coding 生態沒有同層級的「session signal → governance codify」pipeline。

---

## Non-goals 重申

- 不改 code
- 不自行發明產品／UI／UX SSOT
- 不刪歷史 log
- 不跑 harvest(是 hook 責任)
