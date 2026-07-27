---
name: governance-health
description: Monthly provider-neutral governance health scan. Reads opt-in Git-owned telemetry through the canonical runtime resolver, detects dead hooks/hot files/Meta-Pattern candidates/stale memories/pending corrections, and proposes retire or rule upgrades without mutating policy. Complement to /knowledge-prune.
---

# Governance Health — 持續 metric 監控 + auto-propose

**目的**:從 aspirational「會有大腦」升級到 **operational 自我優化**。/knowledge-prune 是季度深度重構;本 skill 是**月度 metric scan + 自動提議 rule 升級 / retire 候選**。

## When to run

- 月度 check(預設 cadence)
- repository instruction 行數突增(> 100 行/month)→ trigger
- Git-owned `hook-fires.jsonl` > 5MB → trigger
- audit Phase F 報告 sprawl 時 auto-chain
- user 說「governance 健康嗎」/「有沒有 rule 該 retire」/「哪條 rule 該升級」

## Non-goals

- 本次 health scan 保持 read-only；confirmed engineering remediation 交給 canonical owner skill 自動執行，不因 canonical substantive 而等 user sign-off
- 不做深度 prune(那是 `/knowledge-prune`)
- 不 retire 有 active consumer 的規則(只列候選,不執行)

---

## 5-Phase Workflow

### Phase 0 — Log freshness check

```bash
for NAME in hook-fires.jsonl hook-fires-per-hook.jsonl skill-invokes.jsonl user-corrections.jsonl metric-snapshots.jsonl; do
  SAFE_FILE="$(node scripts/lib/governance-runtime-evidence.mjs --repo-root . --telemetry --path "$NAME")" || exit 2
  [ ! -e "$SAFE_FILE" ] || ls -la "$SAFE_FILE"
done
GOVERNANCE_TELEMETRY_DIR="$(dirname "$(node scripts/lib/governance-runtime-evidence.mjs --repo-root . --telemetry --path hook-fires.jsonl)")"
```

resolver 只允許真實 Git directory 下的 `governance-runtime/`，並逐檔拒絕 escape/symlink/hardlink；禁止自行改讀 `.claude`、`.codex` 或 workspace runtime。若任一 log > 1MB → 提議由 canonical telemetry writer 實作受測 rotation，不能自行搬檔。無 log → Phase 0 回報「instrumentation 未 opt-in 或尚未積累 1-2 個月 baseline」,退出。

### Phase 1 — Metric harvest(parallel)

| Metric | Source | 判斷 |
|--------|--------|------|
| **Hook fire count**(per hook,6 月窗)| `hook-fires-per-hook.jsonl`(+ `.jsonl.YYYYMM` rotation 檔)或 `npm run audit:hook-quality`(產 hook-quality-report.json 含 fire_count_6mo/dead 分類);**`hook-fires.jsonl` 記的是 governance-file 編輯軌跡(hot files 分析用),無 hook 名欄** | 0 fire = retire 候選;>50 fire = hot rule |
| **Skill invoke count**(per skill,3 月窗)| `skill-invokes.jsonl`(若存在)| 0 = dead;< 3 = under-used |
| **User correction signals**(per session)| `user-corrections.jsonl` count + sample | 總累積 > 20 = 需 codify |
| **File size trend**(weekly snapshot)| `$GOVERNANCE_TELEMETRY_DIR/metric-snapshots.jsonl`(若存在)| repository instruction 增速 > 5 line/week = sprawl alert |
| **Benchmark freshness**(external)| `infra/governance/runtime/benchmarks/last-fetch.txt` | > 30 天 = 過期 |
| **Infra-ref integrity**(2026-05-30 加,根因防線)| `node scripts/check-dangling-infra-ref.mjs` + `node scripts/check-skill-deadref.mjs`(fail-open report)| bucket-B > 0(死 hook ref)OR removed-section/line-number ref > 0 = infra-self drift → 提議 repoint。錨例:2026-05-30 抓 40 處死 hook ref + env-smoke set-e bug |
| **判準化佔比 trend**(2026-07-07 加,治理進化方向 1 KPI)| `node scripts/audit-coverage-matrix.mjs`(PURE-JUDGMENT / HOOK / DETERMINISTIC 三級計數)| PURE-JUDGMENT 佔比應逐月持平或降;連 2 月上升 = deep-audit C.0b 判準化 harvest 沒在跑 → flag。SSOT → `governance/planning/2026-07-07-governance-evolution-roadmap.md` |

### Phase 2 — Analysis(fire-driven auto-propose)

三類 auto-propose:

#### 2a. Hot rule → Meta-Pattern upgrade candidate

規則 fire > 50 次 / 6 月 = 該 rule 反覆觸發 = 問題普遍 = 值得上升 Meta-Pattern layer 收斂(對齊 mindset #6「大原則吸收瑣碎」)。

Output: 「`check_item_list_gap.sh` 6 月 fired 78 次 → 提議擴充到 CLAUDE.md Meta-Pattern M18?」

#### 2b. Dead rule → retire 候選

Hook 0 fire / 6 月 OR skill 0 invoke / 3 月 = 無 consumer = retire 候選。

Output: 「`check_sideoffset_canonical.sh`(retired;已移入 hooks/retired/,此為 dead-rule 偵測示例)6 月 0 fire → retire 候選(先 grep 全 repo 確認無 reference 才執行)」

#### 2c. Pending corrections → codify 候選

`user-corrections.jsonl` > 10 條未 codify = user 反覆糾正類似錯誤,該升級到 canonical。

Output: 「過去 4 週 user 糾正 15 條,sample: ..., 提議:升級 M19「XX pattern」或擴充 `# Meta-Pattern 預警`」

### Phase 3 — Health report(produce report to user)

```markdown
# Governance Health Report — {YYYY-MM-DD}

## Metrics
| | 本月 | 前月 | Trend |
|--|------|------|-------|
| repository instruction 行數 | N | M | ↑/↓/→ |
| Hook fire total | N | M | ↑/↓/→ |
| Skill invoke total | N | M | ↑/↓/→ |
| Pending corrections | N | — | — |
| Benchmark freshness | X days | — | — |

## Retire 候選(auto-propose → engineering remediation queue)
- {hook/skill name} — 0 fire / N mo — rationale
- ...

## Meta-Pattern upgrade 候選(auto-propose)
- {rule name} — {fire count}/6mo — propose: 升級 M{N} 「...」
- ...

## Codify 候選(pending corrections)
- {topic} — {count} user corrections — propose: 擴充 CLAUDE.md {section}
- ...

## 外部 benchmark
- Last fetch: {date} ({days} days ago)
- 若過期 → 提議 run `bash governance/benchmarks/fetch.sh`
```

### Phase 4 — Authority routing(no blanket checkpoint)

report 是 receipt，不是 approval milestone；完成後直接 routing:
- P0 retire(confirmed dead + 無 reference):AUTO chain `/knowledge-prune`
- P1 Meta-Pattern upgrade / codify:若純工程治理，AUTO chain canonical remediation + maximum-assurance independent review；只有會改產品／UI／UX SSOT 的真取捨才 batch 到 human-only boundary
- P2 外部 benchmark 過期:AUTO run fetcher

### Phase 5 — Self-improvement capture + snapshot

報告尾加:

```markdown
## Self-improvement capture
- 新發現 governance pattern: {...} OR "無"
- 新確立 monitoring rule: {...} OR "無"
- 修完的矛盾 / user 糾正: {list}
```

本 skill 保持 read-only，不直接 append telemetry。若 trusted adapter 已明示 `GOVERNANCE_TELEMETRY_OPT_IN=1`，canonical `stop_passive_logging.sh` 會把同一 schema 寫入 `$GOVERNANCE_TELEMETRY_DIR/metric-snapshots.jsonl`：
```json
{"ts":"2026-04-24","claude_md_lines":686,"hook_fires_total":N,"skill_invokes_total":M}
```

下次 Phase 1 對比 trend。

---

## 與 `/knowledge-prune` 分工

| Skill | Cadence | Focus | Scope |
|-------|---------|-------|-------|
| `/governance-health` | 月度 / auto-triggered | **Metric-driven 自動提議**(retire / upgrade / codify) | canonical governance files + Git-owned opt-in telemetry |
| `/knowledge-prune` | 季度 / release cut | **深度結構重構**(duplicate / dead / contradiction / over-concrete abstraction) | 同上 |

**Chain 關係**:`/knowledge-prune --deep` 可 auto-chain `/governance-health` 產 metric baseline,但 health 不自動 chain prune。

## Non-goals 重申

- 本 skill 自身不 mutate canonical；工程 substantive finding 必 route 到 canonical owner 自主 remediation
- 不刪 memory 檔(只提議)
- 不動元件 / spec
- 不處理 git log / commits

## References

- `<real-git-dir>/governance-runtime/` — metric source；只能透過 canonical resolver 解析
- `governance/benchmarks/` — provider-neutral fetch policy；`infra/governance/runtime/benchmarks/` — disposable external signal cache
- AGENTS.md `# 治理 canonical` — provider-neutral governance rules (本 skill 執行)
