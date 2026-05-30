---
name: codify-principle
description: User 提出新設計原則 → auto 5-layer artifact generation pipeline。將原則文字自動轉化為 SSOT canonical text + hook scaffold + audit dim + scaffold update + memory entry,放入正確 home。對齊 M14 + M19 + 8-home 治理 canonical。Invoke when user says「我想加一條設計原則 X」「新原則 Y」「ensure X always」OR auto-recognize trigger phrase。本 skill 把 reactive markdown rule 升級成 proactive principle-to-artifact generator。
---

# Codify Principle Skill — 原則 → 5-layer artifacts auto-generator

User mandate「我說一條原則 → 自動轉化產生正確 artifacts 放正確位置」(2026-04-26)。本 skill 是 M19 ensure-canonical pipeline 的 generator 上層,接受 principle text 為 input,output 5-layer 完整落地。

## When to invoke

- User 明說「我想加一條設計原則 X」「新原則 Y」
- User 描述新規則 + 期望「永遠遵守」/「不可漂移」
- M19 trigger phrase(確保 / 一定 / 永遠不漂移)+ 涉及新原則內容
- Auto-chained from `/ensure-canonical` 當 trigger 是「新原則」非「既有原則 enforce」

## Non-goals

- 不直接動既有 canonical without sign-off(改 substantive meaning 走 STOP)
- 不跳過 M8 benchmark — 任何新 cross-component 原則必 ≥ 3 家世界級對照
- 不省略 user sign-off checkpoint
- 不替換 user 判斷 — 模糊原則需要 user 親自釐清

## Workflow(7 phases)

### Phase 1 — Parse principle text(Auto)

User 提供 principle text。Skill 提取:
- **Scope**:跨元件 / 單元件 / 跨 layer / governance-only
- **Type**:Absolute(機械可驗)/ Consistency(對照可驗)/ Judgement(無 mechanical)
- **Affected homes**(8-home matching):
  - `CLAUDE.md` 章節?
  - `*.spec.md` 哪個元件?
  - 新 hook?
  - 新 audit dim?
  - 新 skill?
  - Memory entry?

### Phase 2 — M8 benchmark(STOP if missing)

對 cross-component 原則(scope ≠ governance-only),**強制** M8 ≥ 3 家世界級 DS 對照:
1. 跑 web research(WebFetch Polaris / Material / Carbon / Atlassian / Ant 等對應 component / pattern)
2. 列對照表:每家做法 + 我們對齊 / 偏離 + 偏離 rationale
3. **STOP** 若 < 3 家對照 → 跟 user 確認原則是否成熟

### Phase 3 — Draft 5 layer artifacts(STOP per layer)

每 layer 產 draft + Checkpoint sign-off:

| Layer | Action |
|-------|--------|
| 1. SSOT canonical | 寫 markdown text 到對應 home(CLAUDE.md 章節 / spec.md 段 / references/{topic}.md);包含 rule + Why + How to apply + 世界級 anchor |
| 2. Spec frontmatter | 若 trait-like → 加入 `traits:` array OR 新增 frontmatter field |
| 3. Hook | 若 Absolute → scaffold `.claude/hooks/check_{topic}.sh` 含 P0/P1 detection logic + 7-Q self-check 模板 |
| 4. Audit dim | 加 dim N 到 `/design-system-audit` SKILL + audit-prompts.md(periodic verify) |
| 5. Memory | 寫 `~/.../memory/project_{topic}_{date}.md` + add MEMORY.md index entry |

**每 layer 都 Checkpoint user sign-off**:
```
Phase 3 Layer N draft ready:
{draft content}
Approve? Edit? Skip?
```

### Phase 4 — Auto-generate scaffold update

若原則是「新元件 / 新 story 該滿足」 → 更新 `/new-component` Phase 5 scaffold + `/story-writing` Phase 0。

### Phase 5 — Auto-generate hook test

若 Layer 3 hook 建立 → scaffold `.claude/hooks/tests/test_{topic}.sh` 含 ≥ 5 smoke tests(silent skip / canonical compliance / drift block / rationale escape / per-trait verify)。

### Phase 6 — Apply + verify(分組 commit)

Per layer 一個 commit:
1. SSOT commit
2. Hook + test commit
3. Audit dim commit
4. Scaffold update commit
5. Memory + final verify commit

每 commit 後跑:
- `npx tsc -b`
- 新 hook test
- `node scripts/audit-content-quality.mjs --check`(防 content drift)

### Phase 7 — Self-improvement capture

```markdown
## Self-improvement capture
- 新原則 SSOT home: {path}
- 新 hook: {filename} / fires on: {pattern}
- 新 audit dim: N
- 5-layer 落地完整度: {% layers actually shipped}
- 跳過的 layer + rationale: {if any}
```

更新 `.claude/logs/codified-principles.jsonl` log:
```json
{"date":"2026-04-26", "principle":"...", "scope":"...", "layers":["ssot","hook","audit","scaffold","memory"], "commits":[...]}
```

## Checkpoints(禁止跳)

### ⚠️ Checkpoint 1 — Phase 1 parse
User 親自確認 scope / type / affected homes 是否正確,禁 AI 單方面決定。

### ⚠️ Checkpoint 2 — Phase 2 benchmark
< 3 家世界級對照 → STOP,跟 user 確認是否走 OG-only(原創原則,需 rationale 文檔)。

### ⚠️ Checkpoint 3 — Phase 3 per-layer
每 layer draft 都過 user。SSOT 是 canonical 改變,動 substantive meaning → 必 sign-off。

### ⚠️ Checkpoint 4 — Phase 6 verify
任何 layer commit 後 tsc / hook test fail → 回該 phase 修,**不繞過**。

## 與既有 skills 分工

| Skill | Scope |
|-------|-------|
| `/ensure-canonical` | 既有原則 enforcement(hook / audit 補強)|
| `/codify-principle`(本)| **新原則** 從 0 生成 5-layer artifacts |
| `/knowledge-prune` | 反向:既有原則太多時 retire |
| `/design-system-audit` | periodic verify 既有 artifacts compliance |

`/codify-principle` 是新原則 entry point;落地後其他 skill 接管 enforcement / verify / retire。

## References

- `~/.../memory/MEMORY.md` — index of codified principles
- `.claude/logs/codified-principles.jsonl` — execution log
- CLAUDE.md `# 治理 canonical` 8-home — home 識別 rules
- CLAUDE.md `# Meta-Pattern 預警` M14 / M19 — 上游 pipeline rules

## 範例呼叫

User 說:「我要加一條原則:所有 form-like 元件必須支援 controlled + uncontrolled dual-mode」

Skill 自動:
1. Parse:scope=cross-component,type=Absolute(可機械驗 prop pair)
2. M8:Polaris/Material/Atlassian React form lib 都支援 dual-mode ✓ (3/3 ≥3)
3. Draft layer:
   - SSOT:`.claude/rules/ui-development.md`「元件 Props 命名」 + form spec
   - Hook:`.claude/hooks/check_form_dual_mode.sh`(未實作;此為 5-layer 產物範例 — audit-only via dim,無 write-time hook)偵測 missing pair
   - Audit dim:Dim 31「Dual-mode coherence」(已存在 Dim 26 — STOP 提議擴充而非新增)
   - Scaffold:`/new-component` Phase 4 加 dual-mode template
   - Memory:`project_form_dual_mode_2026_04_26.md`
4. Per-layer Checkpoint
5. Hook test + audit prompt
6. Apply + tsc + verify
7. Capture
