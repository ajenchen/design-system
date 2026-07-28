---
name: SSOT 機械強制 P0 BLOCKER not P1 WARN
description: SSOT canonical = 必 P0 BLOCKER 機械強制 with explicit @escape mechanism;NEVER P1 WARN soft signal (2026-05-27 user permanent directive)
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# SSOT 機械強制 P0 BLOCKER 不分級(2026-05-27 user verbatim)

**Rule**:DS 寫進 spec.md / canonical / SSOT 的東西 = 必機械強制 P0 BLOCKER。**禁** P1 WARN / soft signal / 「heuristic 不準」當理由弱化。

**Why**(user 2026-05-27 verbatim):
> 「你他媽機械無強制就不會做?那你要怎麼評斷哪些要強制哪些不強制?那為何不全部 ssot 都要強制吻合?」

User 邏輯:
- SSOT = canonical 必遵守
- 「P1 WARN」= 我嘴上說重要但執行軟 = self-inconsistent
- 真正 canonical 不該分級

## How to apply

**寫新 hook 時:**
- Default = P0 BLOCKER `exit 2`
- 顯式 escape comment marker per-line(`// @<rule>-skip: <rationale>`)
- 不寫「P1 WARN soft signal」「heuristic 不準避免 false positive」

**現存 P1 hooks 必審計**:
- 既存 P1 WARN hooks 升 P0 + escape mechanism
- 真不該機械強制(eg. taste / context-dependent design judgement) → 改 memory note 不寫 hook
- 折衷:hook 偵測 → emit 警告但 exit 0 = 假裝 enforcement = 反 pattern

## Decision tree(寫 hook 前自問)

1. **是 SSOT canonical 嗎?**(寫進 spec.md / 既定 token / structural rule)
   - YES → P0 BLOCKER + per-line escape comment 機制
   - NO → 不該寫 hook,純 memory / spec.md 即可
2. **False positive 風險高嗎?**
   - YES → 設計更精準的 detection regex + per-line escape OR 改變 enforcement layer(eg. lint 不 hook)
   - NEVER → 改 P1 WARN(那等於宣告自己不重要)
3. **Heuristic 不準?**
   - 換 deterministic detection(grep exact pattern / AST parse / generator output diff)
   - 不能 deterministic → 改成 reviewer guidance memory,不上 hook

## Anchor(2026-05-27)

`check_layout_space_magic_numbers.sh` 第一版寫 P1 WARN「magic numbers might be legitimate (Avatar size, icon size etc.)」→ user 抓「為何不全部 ssot 都要強制吻合」→ 升 P0 BLOCKER + `// @layout-space-magic-ok: <rationale>` per-line escape comment。Test:
- Plain `<div className="p-4">` → BLOCK exit 2 ✓
- With escape → pass ✓
- Token usage `var(--layout-space-loose)` → pass ✓

## 反 pattern(永久 ban)

- ❌ 「P1 WARN soft signal,不 block,避免 false positive 太多」(self-inconsistent)
- ❌ Hook 偵測 magic + emit 警告但 exit 0(假 enforcement)
- ❌ 「heuristic 不準」當理由不機械強制(若不準 → fix detection,別降級)
- ❌ User 抓「為何 X 不強制」我 propose 加 P1 WARN(那等於沒做)

## 對齊 mindset #1

「對標世界級 + 不取巧省工」— 寫 SSOT 就要機械強制到底,不允許「省工 fallback to WARN」。
