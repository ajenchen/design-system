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

resolver 只允許真實 Git directory 下的 `governance-runtime/`，並逐檔拒絕 escape/symlink/hardlink；禁止自行改讀 `.claude`、`.codex` 或 workspace runtime(唯一例外是 `infra/governance/runtime/benchmarks/`:Phase 1「Benchmark freshness」只讀其中的 `last-fetch.txt`,那是 `governance/benchmarks/fetch.sh` 寫的外部訊號快取、不是遙測;它的保留規則在 `packages/design-system/ds-canonical/references/runtime-evidence-retention.md`「Workspace runtime」)。若任一 log > 1MB → 提議由 canonical telemetry writer 實作受測 rotation，不能自行搬檔。無 log → Phase 0 回報「instrumentation 未 opt-in 或尚未積累 1-2 個月 baseline」,退出。

### Phase 1 — Metric harvest(parallel)

| Metric | Source | 判斷 |
|--------|--------|------|
| **Hook fire count**(per hook,6 月窗)| `hook-fires-per-hook.jsonl`(+ `.jsonl.YYYYMM` rotation 檔)或 `npm run audit:hook-quality`(產 hook-quality-report.json 含 fire_count_6mo/dead 分類);**`hook-fires.jsonl` 記的是 governance-file 編輯軌跡(hot files 分析用),無 hook 名欄** | 0 fire = retire 候選;>50 fire = hot rule |
| **Skill invoke count**(per skill,3 月窗)| `skill-invokes.jsonl`(若存在)| 0 = dead;< 3 = under-used |
| **User correction signals**(per session)| `user-corrections.jsonl` count + sample | 總累積 > 20 = 需 codify |
| **File size trend**(weekly snapshot)| `$GOVERNANCE_TELEMETRY_DIR/metric-snapshots.jsonl`(若存在)裡 `tag:"auto-daily"` 列的 `instruction_lines` | repository instruction 增速 > 5 line/week = sprawl alert |
| **Benchmark freshness**(external)| `infra/governance/runtime/benchmarks/last-fetch.txt` | > 30 天 = 過期 |
| **Infra-ref integrity**(2026-05-30 加,根因防線)| `node scripts/check-dangling-infra-ref.mjs` + `node scripts/check-skill-deadref.mjs`(fail-open report)| bucket-B > 0(死 hook ref)OR removed-section/line-number ref > 0 OR product spec cite generated provider instruction adapter = infra-self drift → 提議 repoint。錨例:2026-05-30 抓 40 處死 hook ref + env-smoke set-e bug；2026-08-02 抓 33 specs / 41 refs authority drift |
| **判準化佔比 trend**(2026-07-07 加,治理進化方向 1 KPI)| `node scripts/audit-coverage-matrix.mjs`(PURE-JUDGMENT / HOOK / DETERMINISTIC 三級計數)| PURE-JUDGMENT 佔比應逐月持平或降;連 2 月上升 = deep-audit C.0b 判準化 harvest 沒在跑 → flag。SSOT → `governance/planning/2026-07-07-governance-evolution-roadmap.md` |

### Phase 2 — Analysis(fire-driven auto-propose)

四類 auto-propose:

#### 2a. Hot rule → Meta-Pattern upgrade candidate

規則 fire > 50 次 / 6 月 = 該 rule 反覆觸發 = 問題普遍 = 值得上升 Meta-Pattern layer 收斂(對齊 mindset #6「大原則吸收瑣碎」)。

Output: 「`check_item_list_gap.sh` 6 月 fired 78 次 → 提議擴充到 `packages/design-system/ds-canonical/rules/meta-patterns.md` M18?」

#### 2b. Dead rule → retire 候選

Hook 0 fire / 6 月 OR skill 0 invoke / 3 月 = 無 consumer = retire 候選。**前提:`audit:hook-quality` 報告的 `summary.observation.blind` 必須是 false,且 skill log 涵蓋 3 個月**;遙測預設關,全盲時零筆不是證據,不得提名(判法同 `/knowledge-prune` D2)。

Output: 「`check_sideoffset_canonical.sh`(retired;已移入 hooks/retired/,此為 dead-rule 偵測示例)6 月 0 fire → retire 候選(先 grep 全 repo 確認無 reference 才執行)」

#### 2c. Pending corrections → codify 候選

`user-corrections.jsonl` 未 codify 數超過門檻 = user 反覆糾正類似錯誤,該升級到 canonical。
**門檻不在本檔硬寫**(同檔 Phase 2 表格曾寫 20、此處曾寫 10,兩個都會漂):唯一 SSOT 是
`session_start_governance_check.sh` Check 3 的 `-gt` 判斷(現行 soft 20 / hard 40)。

Output: 「過去 4 週 user 糾正 15 條,sample: ..., 提議:升級 M19「XX pattern」或擴充 `# Meta-Pattern 預警`」

#### 2d. 退場率連續偏低 → 換 `/knowledge-prune` 掃描策略候選

`/knowledge-prune` Phase 5 每次跑完在同一份 `metric-snapshots.jsonl` 寫一列 `tag:"knowledge-prune"`(含 `retire_rate`,行數欄位用 v3 的 `instruction_lines`)。每個日曆季取最後一列,看最近三季:

```bash
SNAP="$(node scripts/lib/governance-runtime-evidence.mjs --repo-root . --telemetry --path metric-snapshots.jsonl)" || exit 2
[ ! -f "$SNAP" ] || jq -Rsc --arg today "$(date -u +%Y-%m-%d)" '
def qi: (.[0:4] | tonumber) * 4 + (((.[5:7] | tonumber) - 1) / 3 | floor);
def qname: "\(. / 4 | floor)Q\(. % 4 + 1)";
(split("\n") | map(select(test("\\S")) | ((fromjson? // null) | if type == "object" then . else {bad: true} end))) as $all
| ($all | map(select(.tag == "knowledge-prune" and (.retire_rate | type) == "number"
    and ((.ts | type) == "string") and (.ts | test("^[0-9]{4}-[0-9]{2}")))
  | . + {qi: (.ts | qi)}) | group_by(.qi) | map(max_by(.ts)) | .[-3:]) as $r
| {
  quarters: ($r | map({quarter: (.qi | qname), ts, retire_rate, instruction_lines})),
  untagged_retire_rows: ($all | map(select(.tag != "knowledge-prune" and (.retire_rate | type) == "number")) | length),
  unreadable_lines: ($all | map(select(.bad)) | length),
  verdict: (
    if ($r | length) < 3 then "資料不足:knowledge-prune 列不到三季"
    elif $r[2].qi < ($today | qi) - 1 then "資料不足:最近一筆 knowledge-prune 列早於上一季"
    elif $r[2].qi - $r[0].qi != 2 then "資料不足:三季不相連"
    elif ($r | any((.instruction_lines | type) != "number")) then "資料不足:有列沒有 instruction_lines(舊欄位名口徑不同,不比)"
    elif ($r | all(.retire_rate < 0.05)) and $r[2].instruction_lines > $r[0].instruction_lines then "提議換 /knowledge-prune 掃描策略"
    else "不提議" end)
}' "$SNAP"
```

照 `verdict` 寫報告:
- `提議換 /knowledge-prune 掃描策略`:三季相連、每季 `retire_rate` < 0.05、第三季的 `instruction_lines` 大於第一季 = 可能有隱性冗贅沒抓到 → 列進報告「掃描策略候選」,附三季數字。
- `不提議`:三季資料齊全,條件不成立。
- `資料不足:…`:照實寫「量不到」和缺什麼,**不得寫成「沒問題」,也不得當成觸發**(沒觀察到 ≠ 沒發生,M37)。`untagged_retire_rows` > 0 代表有帶 `retire_rate`、卻不是 `tag:"knowledge-prune"` 的列(舊格式)被排除;`unreadable_lines` > 0 代表有壞列。兩者都要寫進報告。
- 檔案不存在 → 同 Phase 0「instrumentation 未 opt-in」。

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
- {topic} — {count} user corrections — propose: 擴充 AGENTS.md / `packages/design-system/ds-canonical/rules/meta-patterns.md` {section}
- ...

## 掃描策略候選(§2d)
- 近三季:{quarter} retire_rate {r} / instruction_lines {n} ×3 → {verdict}
- 排除的舊格式列 {untagged_retire_rows} / 壞列 {unreadable_lines}

## 外部 benchmark
- Last fetch: {date} ({days} days ago)
- 若過期 → 提議 run `bash governance/benchmarks/fetch.sh`
```

### Phase 4 — Authority routing(no blanket checkpoint)

report 是 receipt，不是 approval milestone；完成後直接 routing:
- P0 retire(confirmed dead + 無 reference):AUTO chain `/knowledge-prune`
- P1 Meta-Pattern upgrade / codify / 掃描策略候選(§2d):若純工程治理，AUTO chain canonical remediation；task／deliverable 明確要求時才加 maximum-assurance independent review。只有會改產品／UI／UX SSOT 的真取捨才 batch 到 human-only boundary
- P2 外部 benchmark 過期:AUTO run fetcher

### Phase 5 — Self-improvement capture + snapshot

報告尾加:

```markdown
## Self-improvement capture
- 新發現 governance pattern: {...} OR "無"
- 新確立 monitoring rule: {...} OR "無"
- 修完的矛盾 / user 糾正: {list}
```

本 skill 保持 read-only，不直接 append telemetry。`$GOVERNANCE_TELEMETRY_DIR/metric-snapshots.jsonl` 有兩個寫入者,欄位名都照 `stop_passive_logging.sh` R3 的 schema v3:
- canonical `stop_passive_logging.sh`:trusted adapter 已明示 `GOVERNANCE_TELEMETRY_OPT_IN=1` 時寫 `tag:"auto-daily"` 列(距檔案最後一列不到 24 小時就不寫):
```json
{"ts":"<UTC ISO 8601>","schema_version":"v3","tag":"auto-daily","instruction_lines":N,"memory_entries":N,"hooks_total":N,"skills_total":N,"untested_hooks":N,"last_prune_days_ago":N,"corrections_pending":N}
```
- `/knowledge-prune` Phase 5:寫 `tag:"knowledge-prune"` 列(含 `retire_rate`),由 §2d 讀。

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
