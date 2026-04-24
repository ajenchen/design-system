---
name: knowledge-prune
description: Prune governance sprawl across CLAUDE.md / specs / skills / hooks / memory / settings. Finds duplicate rules, dead hooks (6mo 0 fire), stale memories, over-concrete bug case studies that should abstract to meta, and contradictions across homes. Enforces per-file budget (CLAUDE.md ≤ 400 lines, spec ≤ 300, SKILL ≤ 250, memory ≤ 100) and retire rate ≥ 5% / quarter. Invoke via /knowledge-prune quarterly or when CLAUDE.md > 800 / MEMORY.md > 20 entries / audit Phase F reports sprawl. Auto-chained by /design-system-audit --deep Phase 4.5.
---

# Knowledge Prune — 治理反膨脹 skill

**目的**:本 DS governance 自身是活的知識庫,若只 append 會讓 CLAUDE.md 載入成本失控、MEMORY.md 條目爆炸、hook 變殭屍、spec.md 重複。本 skill 掃 8 個 home 找冗贅,提議 retire 候選,加嚴執行 Rule-of-3 SSOT + 行數預算。

**對齊 CLAUDE.md `# 資訊治理 canonical`**:本 skill 是 L3(Periodic deep)實作。L1(pre-write hook)+ L2(fire log)自動執行,L3 需人決策 canonical retire,走 checkpoint。

**對齊 `# 稽核 vs 執行 分權 canonical`**:動 canonical substantive meaning → **STOP 提議**;對齊 / 清 duplicate / 回填 pointer → **AUTO**。

## When to run

- CLAUDE.md 超過 800 行(hook 硬 cap 觸發)
- MEMORY.md 超過 20 條 index
- 季度健檢(每 3 個月跑 1 次)
- `/design-system-audit --deep` Phase 4.5 自動 chain
- 單一 spec.md 超過 500 行(hook 硬 cap 觸發)

## Non-goals

- 不動 code(`.tsx` / `.css` / `.ts`)— 只動 governance 文件
- 不 retire 被 hook / skill 仍引用的 rule(先改 consumer,再 retire)
- 不刪歷史 commit / git log
- 不 rewrite spec.md 內容(只刪 duplicate / 提議合併,實質改寫走 `/design-system-audit`)

---

## Workflow(5 phases)

### Phase 0 — Baseline scan(AUTO)

掃 8 個 home 建立基準表:

```
Home              Size           Over-budget?
─────────────────────────────────────────────
CLAUDE.md         N lines        [≤400 / transition 800]
MEMORY.md         N entries      [≤20]
spec.md total     N files        per-file ≤300
SKILL.md total    N files        per-file ≤250
hooks             N scripts      (count only, Phase 3 看 fire log)
memory files      N              per-file ≤100
.claude/logs/     parse existing  (feed Phase 3)
```

**Output**:`phase0-baseline.md`(session-local,不 commit)

### Phase 0.5 — 讀 external signal(AUTO)

讀 `.claude/logs/` + `.claude/benchmarks/`(Commit 5 後):

- `hook-fires.jsonl` — 過去 6 月每個 hook fire 次數(0 = retire 提名)
- `skill-invokes.jsonl`(若存在)— 過去 3 月每 skill invoke 次數
- `user-corrections.jsonl`(若存在)— pending codification 清單
- `benchmarks/claude-code-features.jsonl` — 新 CC feature 採用提議
- `benchmarks/external-ds-snapshots/*.md` — Polaris / Material / Atlassian 近期更動

**Output**:外部 signal 摘要(送 Phase 3 judging)

### Phase 1 — 4 維 scan(並行 sub-agent)

4 個 sub-agent 並行跑,每個產 finding 清單:

#### D1 — Duplicate across homes(Rule-of-3)

Scan:同概念(同 keyword / 同 canonical)出現在 ≥ 3 個不同 home 寫完整 rule?

Example violations:
- `Portal 逃脫 theme` 在 CLAUDE.md M3 + color.spec.md + hover-card.spec.md + avatar.spec.md 都有完整描述(應 SSOT 一處,其他 pointer)
- `Inline Action vs Button predicate` 在 CLAUDE.md + item-anatomy.spec.md + button.spec.md 都完整

**Output**:duplicate cluster 清單 + 建議 SSOT home。

#### D2 — Dead & stale(fire / edit recency)

- **Dead hooks**:讀 `.claude/logs/hook-fires.jsonl`,6 月 0 fire 的 hook 名 → retire 提名
- **Stale memories**:`ls -la ~/.claude/.../memory/*.md`,6 月無 git log 變動且不在 MEMORY.md index head = stale
- **Unused skills**:`skill-invokes.jsonl` 3 月 0 invoke(除非是 rare-event skill,例 `delivery-handoff`)

**Output**:retire 候選 + rationale(`fire=0 / last_edit=2025-10 / 被 M14 吸收`)

#### D3 — Over-concrete case studies

Scan:Meta-Pattern / spec / memory 條目是「單次 bug 敘述」而非「meta 抽象」?

Example:
- M-row 是「2026-04-22 Dialog autoFocus tooltip 洩漏 / body 未用 ScrollArea / ... 7 題炸」這種純敘述 → 是否該抽成「凡 overlay + subtree context,必 self-scan N 題」的 meta rule?
- feedback memory 條目:「2026-04-21 User 抓到 applicable-where-meaningful」→ 是否已被 M10 / M14 吸收?

**Output**:候選 abstract proposal + 被吸收後可刪的下游條目

#### D4 — Cross-home contradiction

Scan:CLAUDE.md canonical vs spec.md vs skill reference 描述同概念時**語義衝突**(非表達差異)?

Example:
- CLAUDE.md M3 說「Portal 必繼承 data-theme」;但 avatar.spec.md 說「Portal 必繼承 data-theme + data-density」— 差 `data-density`,看誰真 SSOT
- CLAUDE.md `# 稽核 6 維` 列 D4 UX;`# 稽核三級 policy` 也談 UX — 有重疊但說法略差

**Output**:matrix of 衝突點 + 誰該讓步

### Phase 2 — Triage + Checkpoint 1(MUST ASK)

```
Phase 1 findings:
- D1 duplicate: M clusters
- D2 dead/stale: N items
- D3 over-concrete: K items (abstract proposals)
- D4 contradiction: L pairs

Priority:
- P0 (AUTO): 對齊 SSOT / 補 pointer / 刪 confirmed dead hook / retire unused skill — 表達層調整,不動 canonical 意思
- P1 (AUTO with brief report): 合併 duplicate(保 semantic)/ 刪 6+ 月 stale memory(非 critical)/ 編號 renumber
- P2 (STOP / CHECKPOINT): 抽新 meta / 合併 contradiction 要選哪邊 / 撤 Meta-Pattern / 改 SSOT ownership

Proceed with P0+P1 as atomic commit? Then discuss P2?
```

**Do NOT skip**:P2 動 canonical substantive,per `# 稽核 vs 執行 分權`,必 user sign-off。

### Phase 3 — Apply P0 + P1 fixes(分組 commit)

- 每個 cluster 一個 commit(`prune: duplicate X → SSOT owner Y / pointers elsewhere`)
- 每次 commit 後 `npx tsc -b` 驗證(prune 不動 code,但防 spec path 斷)
- 每 commit 後重跑 Phase 0 baseline,確認 size 有下降

### Phase 4 — P2 discussion + apply(user sign-off 後)

- 每 P2 item 一個獨立 commit(animation trail 可回溯)
- 新 meta-pattern 加進 CLAUDE.md `# Meta-Pattern 預警` → 同時**必檢討哪些下游條目冗餘**(上游加 = 下游減)

### Phase 5 — Final report + baseline update

```markdown
## Prune report(N 日期)

### Metric delta
- CLAUDE.md: B → A(-X 行)
- MEMORY.md: B → A(-Y 條目)
- Total spec.md: B → A(-Z 行)
- Hooks: B → A(-N 個)
- Retire rate: X% (target ≥ 5% per quarter)

### Retired
- {list of retired items + why}

### Still deferred(P2 pending user sign-off)
- {list}

## Self-improvement capture(對齊 CLAUDE.md `# 資訊治理 canonical` → Audit skill Phase F 節)
- 新發現 prune pattern: {...} OR "無"
- 新確立 anti-bloat rule: {...} OR "無"
- 下次 prune trigger 建議: {...}
```

Update `.claude/logs/metric-snapshots.jsonl`(append 本次 baseline)。

---

## Checkpoints(禁止跳)

### ⚠️ Checkpoint 1 — Phase 2 triage(見上)

### ⚠️ Checkpoint 2 — 動 Meta-Pattern(P2)

提議撤 / 合併 / 改寫 Meta-Pattern 條目前 STOP。Meta-Pattern 是 CLAUDE.md 最上游,動意思必 user 拍板。

### ⚠️ Checkpoint 3 — 抽新 canonical

Phase 1 D3 發現 5+ 條下游條目可被新 meta 吸收 → 提議新 Meta-Pattern 前走命名三 test + world-class benchmark(對齊 CLAUDE.md M8 / M12)。

### ⚠️ Checkpoint 4 — Retire 率 < 5%

季度 prune 若 retire 不到 5%,表示:(a) 真沒冗餘(罕見),OR (b) judgment 太保守。STOP 跟 user 確認哪邊。

---

## Retire rules(執行規則)

| 項目 | Retire criteria |
|------|-----------------|
| Hook | 6 月 `hook-fires.jsonl` 0 fire + 無 future-planned consumer |
| Skill | 3 月 0 invoke + 非 rare-event skill(release-cut 類可例外) |
| Meta-Pattern 條目 | 被新上游 meta 完全吸收 + grep 無引用 |
| Memory file | 6 月未更新 + 現況已不符 + MEMORY.md 無 head pointer |
| Spec 段落 | 被 SSOT pointer 取代 + grep 無外部引用 |

**Hard rule**:retire 前必 grep 全 repo 無 reference,避免斷鏈。

---

## 世界級對照

本 skill 是本 DS 原創的自我 prune 機制,但對齊:

- **Elasticsearch Index Lifecycle Management**:hot / warm / cold 階段自動降級 + delete old data — 類 retire rate
- **Linux kernel doc policy**:Sphinx deprecation warnings + removal schedule — 類 transition period 過渡期
- **Python PEP 387 Backwards Compatibility Policy**:明定哪些改動需 deprecation 期,哪些可立刻刪 — 類 P0 vs P2 triage

## 與其他 skill 的分工

| Skill | Scope | 不重疊點 |
|-------|-------|---------|
| `/design-system-audit` | **22 維 DS code + spec audit** | 不管治理文件冗贅 — 找 bug / drift,不 prune governance 大小 |
| `/knowledge-prune` | **治理文件冗贅 + 行數 + 矛盾** | 不 audit DS code 本體 — 管 governance 不管 DS |
| `/baseline-audit` | baseline matrix(audit 前置) | 跟 prune 正交 |

---

## Non-goals 重申

- 不 refactor spec.md 內容(改寫走 `/design-system-audit`)
- 不 retire 有 active consumer 的 rule(必先改 consumer)
- 不處理 `git log` 歷史 / 歷史 commit 訊息
