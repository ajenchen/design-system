---
name: code-quality-audit
description: Clean code 量化稽核 — `any` 使用 / dead export / file size / long function / circular dep / magic number。補 `/design-system-audit` 只管「design canonical」的缺口。Invoke via /code-quality-audit scope=all(release / 季度)OR scope=changed(daily)OR scope=component:X(focused)。Auto-chain by `/design-system-audit --deep` Dim 27 + `/component-quality-gate` Ship phase + `/new-component` Phase 4.5。
---

# Code Quality Audit — Clean Code 量化稽核

Scope:**tsx / ts code hygiene**,跟 design canonical 正交。

## 為什麼要這 skill

`/design-system-audit`(全 dim per design-system-audit SSOT)管 design / spec / canonical correctness。但 **clean code 面向**(`any` 濫用 / dead export / 函式爆長 / circular dep / 檔案超標)**無任何 dim 覆蓋**。每次建元件 / audit / ship 都該跑這層。

## 6 個 check

| # | Check | Severity | 如何判定 |
|---|-------|---------|---------|
| 1 | `any` 使用 | P0 | grep `: any` / `as any` / `<any>` / `any[]` / `Record<X, any>`;支援 `// any-allow: {rationale}` 逃生口(同行或上一行) |
| 2 | File size(.tsx)| P0 > 800 / P1 > 500 | `wc -l`;budget 500 / transition cap 800;spec 同 `check_file_size_budget.sh` policy |
| 3 | Long function | P1 > 80 行 | naive:`function`/`const` 宣告到 matching `}` indent 行距 |
| 4 | Dead export | P1 | `export` 名稱在其他 src/ 檔無出現;exempt `*Props/Options/Config/Args/Context/Variants/Value` 型別 API 慣例 |
| 5 | Circular dep | P0 | DFS import graph,找 cycle |
| 6 | Magic number | P1 | 覆蓋不完整 → 由 token 防線(`lib/_token_hygiene.sh` + `check_opacity_token_usage.sh`)層負責(primitive color / shadow / Tailwind v4 `[--foo]`);本 skill 不重複 |

## When to run

- **Daily**:`/code-quality-audit --scope=changed`(git diff)
- **Component ship**:`/component-quality-gate` Ship phase auto-chain
- **New component**:`/new-component` Phase 4.5 auto-chain
- **Release / 季度**:`/code-quality-audit --scope=all`
- **Focus one component**:`/code-quality-audit --scope=component:<Name>`
- **CI gate**:`node scripts/code-quality-audit.mjs --check`(P0 violation → exit 1)

## Workflow

1. Run `node scripts/code-quality-audit.mjs [--scope=<scope>]`
2. Triage findings into P0 / P1 / P2
3. Auto-fix trivial(unused imports,trivial `any` casts with obvious type)
4. STOP for user decision on:
   - File-size P0(大 component architectural split)
   - Circular dep(需設計層面重組)
   - 無法 auto-type 的 `any`(需 design judgment 訂 proper type)

## 禁止

- 禁 silent 吞 `any`(必加 `// any-allow: {rationale}`)
- 禁把 dead export 直接刪(可能是 planned API surface);flag → user 決策
- 禁把 long function 硬拆(拆錯比爆長還糟);只提議,user sign-off

## Integration points

| Skill / Hook | How |
|---|---|
| `/design-system-audit` Dim 27 | `--deep` 必 chain 本 skill scope=all |
| `/component-quality-gate` Ship | chain 本 skill scope=component:{Name} |
| `/new-component` Phase 4.5 | 元件建完必跑 scope=component:{Name} |
| Hook `check_code_quality.sh` | PostToolUse Edit/Write on src/ — 只跑 any + file-size(quick) |

## References

- `scripts/code-quality-audit.mjs` — 實作
- `.claude/hooks/check_code_quality.sh` — per-edit lite check
- 相關:token 防線 `lib/_token_hygiene.sh` + `check_opacity_token_usage.sh`(正交 — token 紀律 vs code 紀律)
