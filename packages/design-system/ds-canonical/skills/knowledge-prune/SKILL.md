---
name: knowledge-prune
description: Prune governance sprawl across CLAUDE.md / specs / skills / hooks / memory / settings. Finds duplicate rules (Rule-of-3), dead hooks (6mo 0 fire via `.claude/logs/hook-fires-per-hook.jsonl`), stale memories, over-concrete bug case studies that should abstract to meta, and contradictions across homes. Enforces per-file budget (CLAUDE.md target ≤ 200 / transition ≤ 400, spec ≤ 300, SKILL ≤ 250, memory ≤ 100) and retire rate ≥ 5% / quarter. Invoke via /knowledge-prune quarterly or when CLAUDE.md > 800 / MEMORY.md > 20 entries / audit Phase F reports sprawl. Auto-chained by /design-system-audit --deep Phase 4.5.
---

# Knowledge Prune — 治理反膨脹 skill

**目的**:本 DS governance 自身是活的知識庫,若只 append 會讓 CLAUDE.md 載入成本失控、MEMORY.md 條目爆炸、hook 變殭屍、spec.md 重複。本 skill 掃 8 個 home 找冗贅,提議 retire 候選,加嚴執行 Rule-of-3 SSOT + 行數預算。

**對齊 CLAUDE.md `# 治理 canonical`**:本 skill 是 L3(Periodic deep)實作。L1(pre-write hook)+ L2(fire log)自動執行,L3 需人決策 canonical retire,走 checkpoint。

**對齊 CLAUDE.md `# 稽核 canonical`「Audit-vs-execute 分權」**:動 canonical substantive meaning → **STOP 提議**;對齊 / 清 duplicate / 回填 pointer → **AUTO**。

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
CLAUDE.md         N lines        [target ≤ 200 / transition ≤ 400 / hard cap 800]
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

- `hook-fires.jsonl` — governance-file edits(tool/path per event);用於 hot governance files 分析
- `hook-fires-per-hook.jsonl` — per-hook fire count(2026-04-25 起);via shared helper `.claude/hooks/_log-fire.sh`;啟用 D2 dead-hook detection
- `skill-invokes.jsonl`(若存在)— 過去 3 月每 skill invoke 次數
- `user-corrections.jsonl`(若存在)— pending codification 清單
- `benchmarks/claude-code-features.jsonl` — 新 CC feature 採用提議
- `benchmarks/external-ds-snapshots/*.md` — Polaris / Material / Atlassian 近期更動

**Output**:外部 signal 摘要(送 Phase 3 judging)

### Phase 1 — 4 維 scan(並行 sub-agent)

4 個 sub-agent 並行跑,每個產 finding 清單:

#### D1 — Duplicate across homes(Rule-of-3)

Scan:同概念(同 keyword / 同 canonical)出現在 ≥ 3 個不同 home 寫完整 rule?

Example violations(historic — 2026-05-22 prune verify 後均已收斂為 pointer 模式,僅留作教學範例):
- `Portal 逃脫 theme`:過去在 hover-card.spec.md / avatar.spec.md / color.spec.md 各重述;現只 M3 SSOT + 各 spec pointer。2026-05-22 audit verify 為已對齊(僅 ui-development.md / meta-patterns.md 2 home 涉及,clean pointer)
- `Inline Action vs Button predicate`:過去 CLAUDE.md / item-anatomy.spec.md / button.spec.md 各完整;現 `inline-action.spec.md` 為 SSOT,其他 cross-link
- 新範例(2026-05-22 抓):**hook count threshold** 在 CLAUDE.md `# 治理 canonical` 行數預算表 / meta-patterns M14 / M20 / `session_start_governance_check.sh` 4 處 drift 3 值(40/35/30)→ M14/M20 strip 數字改 pointer SSOT 修

**Output**:duplicate cluster 清單 + 建議 SSOT home。

#### D2 — Dead & stale(fire / edit recency)

- **Dead hooks**:讀 `.claude/logs/hook-fires-per-hook.jsonl`(2026-04-25 起 instrumented via `_log-fire.sh` helper),6 月 0 fire 的 hook 名 → retire 提名
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
- CLAUDE.md `# 稽核 canonical` 列 D4 UX 同時也談 3-tier scope — 2026-04-24 已合併為一章(原本 2 章重疊)

**Output**:matrix of 衝突點 + 誰該讓步

#### D5 — Canonical drift(spec vs code 語義漂移)— 2026-05-17 加

Scan:`*.spec.md` 寫的 canonical vs `*.tsx` 實際 code 行為衝突 / spec 寫禁止但 code 仍用 / spec 升級但 code 沒跟。

Example:
- `radius.spec.md:57-71` 禁 `rounded-xl/2xl/3xl` → grep `packages/design-system/src/**/*.tsx` 仍有用 → drift
- `field-controls.spec.md` v13 state machine 升級 → 但 Combobox.tsx 還是 v12 behavior → drift

**Output**:per (spec, code) drift entry + 對應 commit hash 追溯 last alignment 時點

#### D6 — Hook-fire health(log-driven)— 2026-05-17 加

讀 `.claude/logs/hook-fires-per-hook.jsonl`,3 大病徵:
- **Dead**:6 月 0 fire(retire 候選,per `# Retire rules` Hook 規則)
- **Hot**(過 fire):fire / day > 50 → 可能 false positive 多 / regex 太鬆
- **Toggle pattern**:同 fire 反覆 inject + retract → hook design 不穩

**Output**:dead retire list + hot tune list + toggle re-design list

#### D7 — Skill-invoke health(log-driven)— 2026-05-17 加

讀 `.claude/logs/skill-invokes.jsonl`,2 大病徵:
- **Unused**:3 月 0 invoke(除 rare-event skill 如 delivery-handoff)
- **Always co-invoked**:Skill A 永遠跟 Skill B 一起 invoke → 該合 1 skill 或 chain auto

**Output**:retire list + merge candidate list

#### D8 — Memory recency / orphan— 2026-05-17 加

Scan `~/.claude/.../memory/*.md`:
- 6 月無 git log 變動 + 不在 MEMORY.md index head = stale candidate(per existing D2 retire rule)
- file 存在但 MEMORY.md 沒 entry = orphan(可能 retire 漏刪)
- entry 存在但 file 不在 = broken pointer

**Output**:stale / orphan / broken pointer 3-class list

#### D9 — Benchmark / citation debt(2026-05-17 加,對應 M22)

Scan 全 repo:
- `@benchmark-unverified-blanket` marker(per file retraction;codify 後該 backfill cite 變 verified)
- spec.md / tsx 含 world-class DS keyword(Material / Polaris / Carbon / Ant / Atlassian / Apple)但無 inline URL / GitHub path / screenshot ref
- 過期 benchmark(cite URL 是 v3 但 framework 已 v5)

**Output**:per (file, claim) cite debt entry + 建議 WebFetch 補 source

#### D10 — Verification artifact rot(2026-05-17 加,對應 M32)

Scan 全 audit / test infra:
- audit script 只驗 `getAttribute(...)` / `class.includes(...)` 不驗 `getBoundingClientRect()` numeric(pixel-quantified 缺)
- `*.spec.md` 寫 visual canonical 但無對應 playwright snapshot 或 visual-audit 覆蓋
- stale screenshot ref(snapshot file 6 月未更新)

**Output**:per audit script 升 pixel-quantified 提名 + 缺 visual coverage 列表

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

### Phase Z reference — Cross-repo SSOT propagation(2026-05-26 retract skill-specific Phase Z,移到 CLAUDE.md canonical)

**Per user 2026-05-26 correction**:「不是只要一 knowledge audit deep 之後就要,是等我 push main 後才要」。

Cross-repo SSOT sync trigger 不是「skill 跑完」而是「push main 後 SSOT-affecting diff」— canonical 統一在:
- `CLAUDE.md` `# Git solo-work canonical` Step 5.5
- Hook `check_post_main_ssot_propagate.sh`(PostToolUse Bash 偵測 `git push origin main` + diff)

→ /knowledge-prune skill 本身**不負責 trigger sync**;Phase 3-4 commit + Phase 6 user 拍板 push main 後,canonical hook 自動偵測 SSOT diff + 提議 npm bump。**整鏈 1 trigger 同時 cover /deep-audit-cross-codex / 一般 dev / 任何 SSOT-affecting 來源**(DRY,不複製到每個 skill)。

---

### Phase 5 — Final report + **quantified retire rate** + baseline update

**Retire rate 計算公式**(從 aspirational 轉 quantified,2026-04-24):

```
total_governance_items_before = 
  count(CLAUDE.md 章節) 
  + count(Meta-Pattern 條目)
  + count(.claude/skills/)
  + count(.claude/hooks/)
  + count(MEMORY.md entries)
  + count(memory files)
  + count(spec.md SSOT anchors)

retired_this_quarter = items 本次 /knowledge-prune 刪 / 合併 / 撤

retire_rate = retired_this_quarter / total_governance_items_before
```

**Target**:≥ 5% / quarter。< 5% 不一定壞(系統已成熟 / 無冗贅),但必在 report 明寫 rationale(「成熟 — 無 retire 候選 / stable ecosystem」),不可空白。

```markdown
## Prune report(N 日期)

### Metric delta
- CLAUDE.md: B → A(-X 行)
- MEMORY.md: B → A(-Y 條目 / -Z 檔)
- Total spec.md: B → A(-Z 行)
- Hooks: B → A(-N 個 hook retired)
- Skills: B → A(-N 個 skill retired)
- **Retire rate: X% = retired N / total M**(target ≥ 5%)
  - 公式套用見本 Phase 頂部
  - 若 < 5% 必附 rationale(成熟 / 無冗贅 / deferred 等)

### Retired(實際)
- {list of retired items + why + grep 確認無 reference}

### 未達 retire target rationale(若 < 5%)
- {e.g. "governance ecosystem stable, 上季已大幅 prune,本季無重大冗贅"}

### Still deferred(P2 pending user sign-off)
- {list}

## Self-improvement capture
- 新發現 prune pattern: {...} OR "無"
- 新確立 anti-bloat rule: {...} OR "無"
- 下次 prune trigger 建議: {...}
```

Update `.claude/logs/metric-snapshots.jsonl`:

```json
{"ts":"2026-04-24","retire_rate":0.07,"retired":5,"total_before":71,"claude_md_lines":612,"hooks_total":18,"skills_total":13,"memory_entries":29}
```

**本 snapshot 讓 `/governance-health` trend 分析:**若 3 季連續 retire rate < 5% 且 governance 行數仍增 → auto-propose「有隱性冗贅未抓,考慮換 /knowledge-prune 掃描策略」。

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
| Hook | 6 月 `hook-fires-per-hook.jsonl` 0 fire + 無 future-planned consumer |
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
| `/design-system-audit` | **full-dim DS code + spec audit**(Phase 0 自建 baseline) | 不管治理文件冗贅 — 找 bug / drift,不 prune governance 大小 |
| `/knowledge-prune` | **治理文件冗贅 + 行數 + 矛盾** | 不 audit DS code 本體 — 管 governance 不管 DS |

---

## Non-goals 重申

- 不 refactor spec.md 內容(改寫走 `/design-system-audit`)
- 不 retire 有 active consumer 的 rule(必先改 consumer)
- 不處理 `git log` 歷史 / 歷史 commit 訊息
