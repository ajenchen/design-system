---
name: bug-fix-rhythm
description: Batch-end-verify rhythm + parallel tool batch + user-listed N-rule MUST-ALL + claim runtime verify. Invoke when entering multi-fix session 或 user 列 numbered rules. Replaces M32(c)(d)(h1)(h2) sub-invariants(2026-05-12 split per Knowledge-Prune Checkpoint 2)。
---

# /bug-fix-rhythm — 多 fix session 的 rhythm canonical

**目的**:當 session 有 ≥ 2 fixes(常見 visual bug session / user 列 N 條 numbered 規則),走 batch-end-verify rhythm,而非 per-fix verify cycle waste。**M32 split 後 (c)(d)(h1)(h2) 的 home**。

**對齊**:
- CLAUDE.md mindset #6「大原則吸收瑣碎」+ M14「對話結論 AUTO integrate」
- Bazel incremental-build / GitHub Actions matrix-batch idiom(per-step incremental = waste,batch-end = canonical)
- Anthropic Claude Code prompt engineering「single-message multi-tool-call」canonical
- Toyota TPS jidoka(per-station per-item verify,不可 skip 任何 item)

## When to invoke

**強制 auto-chain**:
- multi-issue session 內 ≥ 2 fix 待處理(visual / behavior / code 任 mix)
- user 列 numbered N 條規則(「規則 1...規則 N」/「Q1...QN」/ image 標 1234)→ 視作 **MUST-ALL checklist**

**手動 invoke**:user 明言「批 fix」「一次做完」「跑完再驗」「列規則」

**不 invoke**(對齊 Anthropic Best Practice 小修 skip):
- 單一 surgical fix(無 numbered rule + 無 cross-component)— per-fix verify 即可
- pure refactor / typo / import cleanup
- spec.md docs only

## Non-goals

- 不擴展到「audit full-dim」(那是 `/design-system-audit`)
- 不取代 `/scan-similar-bugs`(那是 fix 後 root-pattern scan;本 skill 是 fix-過程 rhythm)
- 不動 canonical 語意(走 audit-vs-execute STOP 提議)

---

## Workflow(4 phases)

### Phase 0 — Intake & MUST-ALL checklist 化(原 M32(h1))

讀 user message:

**If user 列 numbered rules**(「規則 1: X / 規則 2: Y / ...」/「Q1 / Q2 / ...」/ image 標號 / bulleted list)→ 抽出 **MUST-ALL checklist**:

```markdown
## MUST-ALL checklist(per-rule 不可下放)
- [ ] 規則 1: <verbatim user wording> — 對應 fix: <target>
- [ ] 規則 2: <verbatim user wording> — 對應 fix: <target>
- ...
- [ ] 規則 N: <verbatim user wording> — 對應 fix: <target>
```

**禁止**:
- 把 N 條視作 ranked-priority(「先修 1-3,4 之後再說」)
- 漏 N 條中第 K 條當「做完」report
- 改寫 user wording 為自己 paraphrase(verbatim 保留)

### Phase 1 — Parallel tool batch(原 M32(d))

Read / Grep / Glob 多檔需求 → **single message multi-tool-call**:

```
✓ Good: 1 message with [Read A, Read B, Read C, Grep D, Grep E]  (~2s)
✗ Bad : 5 messages sequential                                       (~10s)
```

**Heuristic**:任何 tool call 之間**無 dependency**(後一個不需前一個結果) → 必 parallel。

對齊 Anthropic Claude Code best practice:「Maximize use of parallel tool calls where possible」。

### Phase 2 — Batch fix(原 M32(c))

每 fix 用 Edit(不 Write,降風險)。**禁止 per-fix tsc / audit cycle**:

```
✓ Good: [Edit A] [Edit B] [Edit C] [Edit D] → final tsc + audit + visual (once)
✗ Bad : [Edit A → tsc → audit → visual] [Edit B → tsc → audit → visual] ...  (5× waste)
```

例外:某 fix 確實依賴前一 fix 的 type 結果 → sequential 必要時可,但 verify cycle 仍 batch-end-only。

### ⚠️ Checkpoint 1 — Substantive vs surgical 分流

每 fix 落地前 inline 判斷:

- **Surgical**(CLAUDE.md「Scope classifier — Surgical visual bug」):pixel / token / class adjustment, no new SSOT / API / cross-component → AUTO ship 此 fix
- **Substantive**(audit-vs-execute 分權):新 SSOT / 新 prop / 新 canonical meaning / cross-component semantic → **STOP propose**,等 user verbatim 拍板才 ship

混合 batch:surgical 部分 ship,substantive 部分 propose。**禁止**:substantive 偷渡進 surgical batch。

### Phase 3 — Final batch-end verify(原 M32(c)(h2))

全 fix 完成後**一次性**驗證:

```bash
npx tsc -b                                    # type
npm run hooks:test                            # invariant
node scripts/visual-audit-<target>.mjs        # pixel-quantified per M32(a)
```

**MUST-ALL re-check**(per Phase 0 checklist):

```markdown
## MUST-ALL verify report
- [x] 規則 1: ✓ verified via <tsc | audit script | pixel measurement | playwright>
- [x] 規則 2: ✓ verified via ...
- ...
- [x] 規則 N: ✓ verified via ...
```

**禁止**(原 M32(h2) claim runtime verify):
- 寫「不會有問題」「無 side-effect」「verified」「都實作完了」**沒**對應 verify trace
- code-reading 推論當「verified」
- ranked-priority 漏 N 條中第 K 條當「做完」

若某條無法 runtime verify → 明撤回 **「規則 K:未驗證,推論而已,user 真機 verify needed」**,不可假宣告。

對齊 M20 claim-verify gap(M20 是 stop-hook 機制;本 skill Phase 3 是 active workflow side)。

---

## ⚠️ Checkpoints(禁止跳)

### Checkpoint 1 — Phase 2 surgical vs substantive(見上)

### Checkpoint 2 — Phase 3 verify trace 缺漏
若 MUST-ALL N 條有 K 條無 verify trace → STOP report,先補 verify 再報 user。

### Checkpoint 3 — User-listed rule wording 改寫
若 Phase 0 抽 checklist 時改了 user wording → STOP,重抓 verbatim。

---

## 與其他 skill / hook 的關係

| Tool | Scope | 跟本 skill 關係 |
|---|---|---|
| `/scan-similar-bugs` | fix 後 DS-wide root-pattern scan | 本 skill batch-end-verify 後**才** chain `/scan-similar-bugs` |
| `/visual-audit` | 單次視覺對齊 | Phase 3 sub-step,本 skill 包它 |
| `/component-quality-gate` | stakeholder gate | 不重疊(stakeholder vs daily bug fix) |
| `stop_self_audit.sh`(hook) | claim-verify gap 攔 | 本 skill Phase 3 是 active side;hook 是 passive trip-wire |
| `check_pixel_quantified_audit.sh`(hook) | M32(a) audit script 必 pixel | 本 skill Phase 3 跑該 audit |

**3 層 防線**:
- **本 skill**(active workflow):MUST-ALL checklist + batch-end-verify rhythm
- **stop_self_audit.sh / check_codex_collab_5step.sh**(passive hook):claim-verify gap 攔
- **M20 / M32(a)**(meta-rule):上游 invariant

---

## 世界級對照

- **Bazel `bazel test //...`**:全 target 並行 + final report,而非 per-target sequential
- **GitHub Actions matrix**:N 個 job 並行,final aggregate verdict
- **Toyota TPS jidoka**:每 station per-item verify,**但** verify 是 station-end 而非 in-progress checkpoint
- **Anthropic Claude Code prompt eng**:「Maximize use of parallel tool calls」
- **Stripe / Linear engineering blog**:「batch deploy + single canary verify」over「per-PR canary」

---

## Self-improvement capture

每次 invoke 完寫:
- (a) Phase 0 抽 MUST-ALL 時 user wording 是否變形?
- (b) Phase 2 surgical/substantive 分流是否準確?(false-positive 偷渡記錄)
- (c) Phase 3 verify trace 有沒有「runtime verify needed」的條目漏標?
- (d) 新發現 numbered-rule pattern → 加進 Phase 0 抽取 heuristic

回填本 SKILL.md 或 references/。

---

## 歷史 absorbed failures(M32 split 來源)

2026-05-12 4 prior failures absorbed by M32 → split 後本 skill 承接 (c)(d)(h1)(h2):
1. cell-align audit「Δ=0 ALL PASS」但 user 抓 SKU/Qty 視覺垂直置中於 88px 高 row(audit 沒驗 Field collapse)
2. divider 2px audit「ALL PASS」但 pinned panel 邊仍 2px(audit 沒驗 pixel overlap)
3. breadcrumb tooltip audit「ALL PASS」但 user 連抓 hover 不 fire(audit 沒驗 Portal DOM bounding rect)
4. row-alignment audit「Δ=0 ALL PASS」(attr 對齊,Field collapse 沒抓)

具體 M32(a) pixel-quantified rule 仍在 meta-patterns.md,本 skill 是其 workflow side。
