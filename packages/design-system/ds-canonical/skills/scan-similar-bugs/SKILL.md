---
name: scan-similar-bugs
description: Auto-invoke after fix commits — extracts root-cause anti-pattern, greps DS-wide for same pattern, runs visual verify, batches related fixes. Closes M10 mechanical gap. Invoke via /scan-similar-bugs.
---

# /scan-similar-bugs — Fix-time DS-wide Exhaustive Scan

**目的**:任何 bug fix 提交後,**機械化掃 DS-wide 找同 pattern**,而非靠 model 記得 M10。

**對齊**:
- CLAUDE.md M10 「Proactive exhaustive scan」mechanical 落地
- mindset #1「不取巧」+ #2「優先消費既有」+ #6「meta 抽象」
- 對齊 IDE「find similar / find references」+ Chrome DevTools「find usages」+ GitHub Copilot「related code」3+ 家世界級 idiom

**對位其他 skill**:
- `/design-system-audit` 是**定期 batch** full-dim audit
- `/visual-audit` 是**單次視覺對齊** check
- 本 skill 是 **batch-end-only root-pattern scan**(2026-05-12 codex 抓 infra conflict 重構:per-fix → batch-end,對齊 `/bug-fix-rhythm` Phase 2-3 batch fix + single end-verify canonical;M32 split 後 batch-end home 移至 bug-fix-rhythm skill)

## When to invoke

**強制(auto-chain)— batch-end only**(2026-05-12 重構,per codex):
- multi-issue session 結束後**一次**(不是每 fix 一次)
- session 內 ≥ 2 fix commit 觸發批次 root-pattern scan
- session_start_governance_check.sh 偵測 上 session 有 ≥ 2 fix commit 但 batch-end scan 沒跑 → 提醒

**手動 invoke**:
- user 明言「掃同類 bug / 看其他元件有沒有 / 全 DS scan」
- multi-issue batch session 結束想驗 root-pattern DS-wide

**不 invoke**(對齊 Anthropic Best Practice 小修 skip plan):
- **Surgical visual bug**(user 列 N 個 visual defects + 無 canonical / API / cross-component → 批 fix + final verify only,不必 scan-similar)
- pure refactor(無 bug 修復語義)
- spec.md / docs only commit
- 純 typo / import cleanup

## Non-goals

- 不擴展 scope 到「audit full-dim品質」(那是 `/design-system-audit`)
- 不做視覺 regression baseline diff(那是 `/visual-audit`)
- 不改 canonical(找到 pattern 後修是 surgical fix,動 canonical 走 audit / Checkpoint)

---

## Workflow(5 phases)

### Phase 0 — 抓 root-cause anti-pattern

```bash
# 讀 last fix commit message + diff
git log -1 --format='%s%n%n%b'
git show HEAD --stat
```

從 commit message + diff 抽出 grep-able pattern。常見類型:

| Bug 類型 | Anti-pattern grep target |
|---|---|
| Padding / sizing 公式錯 | `calc((var(--field-height-X) - <num>px) / 2)` etc |
| Token leak / shadcn alias | `bg-popover / text-muted-foreground / bg-accent` |
| 硬寫 magic number | `text-[14px] / shadow-[0_2px_8px_...]` |
| API mis-use(prop combo)| `iconOnly + endIcon` / `loading + disabled` |
| a11y missing | `<button>` 無 `aria-label` 又無 children |
| Symbol mis-import | `from 'shadcn/ui/X'` |
| CSS w/h asymmetric | SVG 量測 width !== height |

**Output**: `ANTI_PATTERN`(grep regex / Playwright assertion)。

### Phase 1 — DS-wide grep / visual scan

選最適合的 detection:

**Static grep**(快,適合 token / class / API mis-use):
```bash
grep -rnE "$ANTI_PATTERN" packages/design-system/src/ --include="*.tsx" \
  | grep -v "test_\|stories\|node_modules"
```

**Playwright visual scan**(慢,適合 geometry / a11y / interaction):
```bash
node scripts/scan-asymmetric-icons.mjs   # 已存在,iconOnly visual scan template
# 或 base 同 pattern 自寫 dim-specific scan
```

**Output**:候選清單(file:line + 樣本)。

### ⚠️ Checkpoint 1 — Triage

向 user present:
```
Phase 1 found N candidates of same anti-pattern:
- packages/design-system/src/components/A/a.tsx:42  > grep match
- packages/design-system/src/components/B/b.tsx:18  > grep match
- packages/design-system/src/components/C/c.tsx:55  > 視覺 14×16

Proceed?
- (a) Auto-fix all N(若修法 deterministic 例 token rename)
- (b) Review per-file(若 fix 需個別判斷)
- (c) 留 N 個 tech debt 後續處理(寫 memory + 不修)
```

不可 silent 跳過 user — fix scope 影響 N 元件,**M10 + 稽核 vs 執行 分權**要求 user 拍板。

### Phase 2 — 批量 / 個別 fix

按 Checkpoint 1 user 選的路執行。每修一檔:
- 用 Edit(不 Write,降風險)
- 修完 grep 該 anti-pattern 應 0 match
- npx tsc --noEmit 必過

### Phase 3 — Visual / unit verify

- Visual:跑 `npm run icons:scan` 或 dim-specific scan
- Unit:跑 `npm run hooks:test`
- TSC:`npx tsc -b`
- 全綠才繼續

### Phase 4 — Final report + memory + new defense

```markdown
## Scan-similar-bugs report

### Root cause(來自 last fix commit `<hash>`)
- Pattern:{ANTI_PATTERN}
- Origin file:{first detected location}

### DS-wide impact
- {N} candidates found
- {M} fixed this run
- {K} deferred(spec rationale 已記)

### New defense layer(防 future regression)
- 加 hook:`.claude/hooks/check_<pattern>.sh`(若 pattern 易 grep)
- 加 visual test:`scripts/scan-<pattern>.mjs`(若需 Playwright)
- 加 spec rule:{spec.md anchor}

## Self-improvement capture
- 新 anti-pattern 加進本 skill 的 Phase 0 「Bug 類型 → grep target」表
- M10 fire 紀錄(commit 後本 skill invoke vs not)
```

寫進:
- 對應 commit message
- `memory/` 若是 cross-session pattern
- 本 skill `references/` 若是 reusable detection 公式

---

## ⚠️ Checkpoints(禁止跳)

### Checkpoint 1 — Phase 1 後 Triage
N 個 candidate 的修法 scope。**禁止 auto-fix 超過 5 檔不 ask user**。

### Checkpoint 2 — 動 canonical
若 N candidates 都 violate 同 canonical,但 canonical 本身可能 outdated → 走 audit 重訂(不在本 skill scope)。

### Checkpoint 3 — Defer 的 tech debt
若 user 選 (c) 留 tech debt → 必寫 memory + 標明「deferred at <date>,reason: <reason>」。`/codify-corrections` 季度會 review。

---

## 對位其他 skill / hook

| Tool | scope | 跟本 skill 關係 |
|---|---|---|
| `/design-system-audit` | full-dim batch audit | 本 skill 抓不到的 architectural pattern audit 補位 |
| `/visual-audit` | 單次視覺對齊 | Phase 3 verify 用 |
| `/scan-similar-bugs`(本) | **immediate-after-fix grep + verify** | M10 mechanical 落地 |
| `/knowledge-prune` | 季度 governance prune | 不重複 |
| `check_canonical_propagation.sh` E.2(hook;原 check_l3_primitive_import.sh folded 折入,P0 BLOCK) | L3 primitive import 違規 | 即時 detect,本 skill 是 batch retro scan |
| `pre_write_subsumption_check.sh`(hook)| 新 file / M-row | 不重複 |

**3 層 防線**:
- Hook(pre/post tool):**寫的瞬間** detect
- 本 skill(fix-time):**修完瞬間** scan DS-wide
- `/design-system-audit`(periodic):**季度** full-dim sweep

---

## 世界級對照

- **Chrome DevTools "find references"**:單元件變更後找其他 consumers
- **VS Code "find similar code"**:AI-powered same-pattern scan
- **GitHub Copilot Workspace**:fix 後自動 propose related changes
- **WebStorm "Inspect Code → Similar Patterns"**:同 pattern detect

我們對齊 4 家但加 **DS-domain-specific anti-pattern table**(Phase 0 列表),是 generic IDE 沒做到的。

---

## Self-improvement capture

每次 invoke 完寫:
- (a) 新發現 anti-pattern → 加到 Phase 0 表(grep target template 更新)
- (b) Detection false positive → 修 grep regex 或加 allowlist 註解 pattern
- (c) Phase 1 漏掃 location → 補 grep scope(extend 到 hooks/ / scripts/ etc)

回填 SKILL.md 或 references/ 形成累積資產。
