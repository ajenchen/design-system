---
name: governance-health
description: Monthly metric-driven governance health scan. Reads .claude/logs/{hook-fires,hook-fires-per-hook,skill-invokes,user-corrections}.jsonl → detects dead hooks(6mo 0 fire)/ hot files / Meta-Pattern candidates / stale memories / pending corrections. Auto-proposes retire + rule upgrades. Complement to /knowledge-prune(quarterly deep restructure).
---

# Governance Health — 持續 metric 監控 + auto-propose

**目的**:從 aspirational「會有大腦」升級到 **operational 自我優化**。/knowledge-prune 是季度深度重構;本 skill 是**月度 metric scan + 自動提議 rule 升級 / retire 候選**。

## When to run

- 月度 check(預設 cadence)
- CLAUDE.md 行數突增(> 100 行/month)→ trigger
- `.claude/logs/hook-fires.jsonl` > 5MB → trigger
- audit Phase F 報告 sprawl 時 auto-chain
- user 說「governance 健康嗎」/「有沒有 rule 該 retire」/「哪條 rule 該升級」

## Non-goals

- 不改 canonical substantive(只提議,STOP 等 user sign-off)
- 不做深度 prune(那是 `/knowledge-prune`)
- 不 retire 有 active consumer 的規則(只列候選,不執行)

---

## 5-Phase Workflow

### Phase 0 — Log freshness check

```bash
ls -la .claude/logs/*.jsonl
```

若任一 log > 1MB → 確認已 rotate(`*.jsonl.YYYYMM` 檔存在)。無 log → Phase 0 回報「instrumentation 未積累資料,需 1-2 個月 baseline」,退出。

### Phase 1 — Metric harvest(parallel)

| Metric | Source | 判斷 |
|--------|--------|------|
| **Hook fire count**(per hook,6 月窗)| `hook-fires.jsonl` parse path column | 0 fire = retire 候選;>50 fire = hot rule |
| **Skill invoke count**(per skill,3 月窗)| `skill-invokes.jsonl`(若存在)| 0 = dead;< 3 = under-used |
| **User correction signals**(per session)| `user-corrections.jsonl` count + sample | 總累積 > 20 = 需 codify |
| **File size trend**(weekly snapshot)| `metric-snapshots.jsonl`(若存在)| CLAUDE.md 增速 > 5 line/week = sprawl alert |
| **Benchmark freshness**(external)| `.claude/benchmarks/last-fetch.txt` | > 30 天 = 過期 |
| **Infra-ref integrity**(2026-05-30 加,根因防線)| `node scripts/check-dangling-infra-ref.mjs` + `node scripts/check-skill-deadref.mjs`(fail-open report)| bucket-B > 0(死 hook ref)OR removed-section/line-number ref > 0 = infra-self drift → 提議 repoint。錨例:2026-05-30 抓 40 處死 hook ref + env-smoke set-e bug |

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
| CLAUDE.md 行數 | N | M | ↑/↓/→ |
| Hook fire total | N | M | ↑/↓/→ |
| Skill invoke total | N | M | ↑/↓/→ |
| Pending corrections | N | — | — |
| Benchmark freshness | X days | — | — |

## Retire 候選(auto-propose,需 user sign-off)
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
- 若過期 → 提議 run `.claude/benchmarks/fetch.sh`
```

### Phase 4 — Checkpoint 1(MUST ASK)— user sign-off

report 給 user 後 **STOP**:
- P0 retire(confirmed dead + 無 reference):AUTO OK 可執行
- P1 Meta-Pattern upgrade / codify:STOP,需 user sign-off(動 canonical)
- P2 外部 benchmark 過期:AUTO run fetcher

### Phase 5 — Self-improvement capture + snapshot

報告尾加:

```markdown
## Self-improvement capture
- 新發現 governance pattern: {...} OR "無"
- 新確立 monitoring rule: {...} OR "無"
- 修完的矛盾 / user 糾正: {list}
```

Snapshot 本次 metric 到 `.claude/logs/metric-snapshots.jsonl` append:
```json
{"ts":"2026-04-24","claude_md_lines":686,"hook_fires_total":N,"skill_invokes_total":M}
```

下次 Phase 1 對比 trend。

---

## 與 `/knowledge-prune` 分工

| Skill | Cadence | Focus | Scope |
|-------|---------|-------|-------|
| `/governance-health` | 月度 / auto-triggered | **Metric-driven 自動提議**(retire / upgrade / codify) | 全 governance files(CLAUDE.md / skills / hooks / memory / logs)|
| `/knowledge-prune` | 季度 / release cut | **深度結構重構**(duplicate / dead / contradiction / over-concrete abstraction) | 同上 |

**Chain 關係**:`/knowledge-prune --deep` 可 auto-chain `/governance-health` 產 metric baseline,但 health 不自動 chain prune。

## Non-goals 重申

- 不改 canonical substantive meaning
- 不刪 memory 檔(只提議)
- 不動元件 / spec
- 不處理 git log / commits

## References

- `.claude/logs/` — metric source
- `.claude/benchmarks/` — external signal
- CLAUDE.md `# 治理 canonical` — governance rules (本 skill 執行)
