---
name: codex visual audit via --dangerously-bypass-approvals-and-sandbox
description: Codex CLI exec mode 跑 Playwright MCP visual audit 唯一可行路徑(user explicit authorize 才用),feature exec_permission_approvals 仍 under-development
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Codex visual audit via --dangerously-bypass(2026-05-27 user 永久 authorize)

**Rule**:`codex exec` + Playwright MCP visual audit → 必加 `--dangerously-bypass-approvals-and-sandbox` 才能 auto-approve MCP browser tool calls。

**Why**:Codex CLI 0.134.0(latest as of 2026-05-27)feature `exec_permission_approvals` 仍 `under development = false`。試過全部 sandbox/approval 組合都 cancel:
- `--enable exec_permission_approvals` + `approval_policy="never"` ← MCP cancelled
- `-s workspace-write` + `mcp_servers.playwright.auto_approve=true` ← MCP cancelled
- `--enable browser_use_external` ← MCP cancelled

**唯一 working path**:
```bash
# @codex-brief-invariant-skip: user authorized --dangerously-bypass for visual audit
cat brief.md | node_modules/.bin/codex exec --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  > output.txt 2>&1 &
```

**How to apply**:
1. **User explicit authorize required first** — Claude Code default safety policy blocks this flag(message:「Permission denied. Let the user decide」)。需 user verbatim「授權 codex bypass」/「照建議 dangerously」trigger 才執行。
2. **Brief MUST forbid edit/delete/write source code** — bypass 解的是 codex 內部 sandbox(不解 host OS),但 codex 仍能寫 file。Brief 限 read-only + 明確 output dir(`.playwright-mcp/` 或 `/tmp/codex-screenshots/`)。
3. **MUST use sequential MCP pattern not batch**:`browser_run_code_unsafe` MCP context disallows dynamic import / fs / batch loops。Brief explicit forbid「DO NOT use browser_run_code_unsafe」+ require per-component sequential `browser_navigate → wait → screenshot → evaluate`。Bite the bullet ~30s/comp × N。
4. **Codex saves screenshots at repo root** — `<comp>.png` resolved relative to cwd。`.gitignore` 必加 per-comp PNG entries 或 batch glob。Brief 要 codex 在 run 結束 `mv` 到 `/tmp/codex-screenshots/`。

## Capability smoke test pattern(verify before full run)

```markdown
@codex Playwright MCP capability smoke test

## Brief invariants(全盤閱讀全部 source / Triple-verify / 禁抽樣 NO-SAMPLE)

1. MCP `browser_navigate` to <single-url>
2. MCP `browser_take_screenshot` 存到 `<output-dir>/smoke.png`(MCP 拒 /tmp absolute → 先 `.playwright-mcp/` 然後 mv)
3. MCP `browser_evaluate` 取 DOM
4. Verdict 1 line:`✅ MCP available` OR `❌ <reason>`

禁止 edit / delete / write source code。
```

## Anchor(2026-05-27)

User 要求「ensure codex 把所有元件都驗證過並截圖視覺稽核過」。
- 試 4 種 codex config override 全失敗(`exec_permission_approvals` 仍 under-dev)
- User explicit authorize `--dangerously-bypass-approvals-and-sandbox`(「codex 並不會動到你的檔案，對吧？那就照你建議做」+ acknowledged safety constraint)
- Smoke test PASS(`/tmp/codex-screenshots/smoke.png` 37755 bytes)→ v2 strict sequential brief → ✅ 62/62 PASS
- Final artifact `.claude/snapshots/codex-visual-audit-2026-05-27/audit-report.json`(committed)

## 反 pattern(永久 ban)

- ❌ AI auto-invoke `--dangerously-bypass` without user explicit authorize
- ❌ Brief allow batch `browser_run_code_unsafe`(已驗 fail)
- ❌ Skip capability smoke 直接 full run(MCP rejection mode 未知)
- ❌ Brief 允許 codex edit / delete / write source code under bypass mode
