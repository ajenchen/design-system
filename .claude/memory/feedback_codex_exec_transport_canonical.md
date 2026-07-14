---
name: Codex exec transport canonical(地端 path + visual audit bypass + large-brief 死局)
description: 地端 codex 走 node_modules/.bin/codex(3-test discovery)+ visual audit 必加 --dangerously-bypass-approvals-and-sandbox(user authorize)+ 大 brief 拆 N 個 focused 小 brief 才不死局
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Codex exec mode 完整 transport canonical

## Rule 1 — 地端 transport = `node_modules/.bin/codex`(3-test discovery)

**啟 codex collab 前必跑 3-test discovery,順序固定**(per `.claude/skills/codex-collab/SKILL.md` Step 0.4):

```bash
ls -la node_modules/.bin/codex && node_modules/.bin/codex --version   # 1 Local CLI(primary)
which codex 2>/dev/null && codex --version 2>/dev/null                 # 2 Global(罕見)
ls -la ~/.codex/auth.json                                              # 3 Auth(sanity)
```

**Why**:`@openai/codex` 是 npm dep(`package.json` 已含),正規 binary 在 `node_modules/.bin/codex`(symlink to `@openai/codex/bin/codex.js`)。**全域 `which codex` 通常找不到**(npm 不自動 link 進 PATH),**這是預期的,不代表 codex unreachable**。

**Decision tree**:1 ✅ → local exec / 1 ❌ + 2 ✅ → global / 1+2 ❌ + 3 ✅ → `npm install` 補 / 全 ❌ → 報 user。**絕禁 fallback Explore agent 當 codex 替身**(Explore 是同模型,不滿 M31 dual-track bias)。

**Anchor 2026-05-17**:user verbatim「你他媽你難道不知道這裡是地端?跟你說過地端要怎樣跟codex協作?講百次要你遵循原則了」。我犯錯:`which codex` 失敗就斷言 unreachable + 嘗試 `sudo npm i -g @openai/codex` + 嘗試繞 M28 + fallback Explore 替身。

## Rule 2 — Visual audit MCP via `--dangerously-bypass-approvals-and-sandbox`(user authorize 才用)

**Rule**:`codex exec` + Playwright MCP visual audit → 必加 `--dangerously-bypass-approvals-and-sandbox` 才能 auto-approve MCP browser tool calls。Codex CLI 0.134.0 feature `exec_permission_approvals` 仍 under-development,試過全部 sandbox/approval 組合都被 cancel。

**唯一 working path**:
```bash
# @codex-brief-invariant-skip: user authorized --dangerously-bypass for visual audit
cat brief.md | node_modules/.bin/codex exec --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  > output.txt 2>&1 &
```

**How to apply**:
1. **User explicit authorize required first** — Claude Code default safety blocks。需 user verbatim「授權 codex bypass」/「照建議 dangerously」trigger
2. **Brief MUST forbid edit/delete/write source code** — bypass 解 codex 內部 sandbox(不解 host OS),但 codex 仍能寫 file。限 read-only
3. **MUST sequential MCP not batch**:`browser_run_code_unsafe` disallows dynamic import / fs / batch。Per-component sequential `browser_navigate → wait → screenshot → evaluate`
4. **Codex saves screenshots at repo root** — `.gitignore` 必加 per-comp PNG OR `mv` to `/tmp/codex-screenshots/`

**Anchor 2026-05-27**:User 要求「ensure codex 把所有元件都驗證過並截圖」+ explicit authorize「codex 並不會動到你的檔案，對吧？那就照你建議做」。Final 62/62 PASS,artifact `.claude/snapshots/codex-visual-audit-2026-05-27/audit-report.json`。

## Rule 3 — 大型 brief 死局 / Success pattern = 小 focused brief + 最強模型算力 + bypass(2026-07-10 user 強制升級)

**Anti-pattern**:DISCUSS-ONLY 大型 6+ 軸 brief + xhigh / medium reasoning effort = 模型在 plan turn 燒掉 budget,沒輸出 verdict。Anchor 2026-05-29 turn:r1 / r2(xhigh)/ r3(medium)/ r4(medium + bypass)全失敗,只 echo brief 0 substantive output。

**2026-07-10 user 強制 directive(verbatim「deep audit cross codex 應強制使用 codex 最新最強的模型與算力」)**:
**禁任何 `-c model_reasoning_effort` / `-m` 降檔 override** —— `~/.codex/config.toml` 已設最強
(**無 model pin** + **effort = probe 出的最高可用檔**,2026-07-10 實測 ultra > xhigh)= SSOT — model:解 pin 隨 CLI default 跟最新;effort:檔位支援是 server 執行期資料(enum 已有 max/ultra),靜態不可知 → `scripts/check-codex-freshness.mjs --probe` 由高往低實測、**自動改 config pin + cache**;CLI 換版 → check 紅燈 → B.0 自動重探。「不用 user 提醒」全機械。codex exec 不帶任何 effort/model flag 即繼承最強。
2026-05-29 的死局根因是 **brief 太大**(xhigh + 6 軸 DISCUSS-ONLY brief 燒光 budget),
不是 effort 本身 —— 對策只允許「拆更小 focused brief」,不允許降 effort(低檔省成本
= 稽核品質打折,違 user directive)。若 xhigh + 小 brief 仍死局 → 再縮 brief / 減軸,記錄實測。

**Success pattern(升級版)**:
1. `--dangerously-bypass-approvals-and-sandbox`
2. **不帶** effort/model override(繼承 config.toml 最強)
3. **拆 N 個 single-axis focused brief 並行**(每 brief 1 軸;這是 2026-05-29 實證的真成功要素)
4. Brief 含「禁寫 plan」/「直接從 ### A1 verdict 開始輸出」directive

```bash
# parallel dispatch pattern(最強模型算力,禁降檔)
echo "<focused single-axis brief>" | node_modules/.bin/codex exec \
  --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check \
  > /tmp/codex-r6a.md 2>&1 &
# ... repeat for r6b, r6c
```

## Codex 失敗守衛(2026-07-10 user directive「codex 額度不足你會知道嗎?應通知你,你要通知我讓我處理」)

**缺口**:codex quota/rate 耗盡 → codex exit≠0 + last-message 空;若把「空輸出」當「codex 0 findings = 全乾淨」= false-green,且 user 不知情無法處理。

**規則(硬)**:所有 audit / dual-track 的 `codex exec` **必經單一守衛入口** `node scripts/codex-run-guarded.mjs`(--brief/--stdin)。它分類 outcome:SUCCESS / QUOTA / AUTH / EMPTY / ERROR / TRANSPORT_MISSING(exit code 0/4/5/7/6/7/3)。**任何非 SUCCESS → 立即 STOP + `PushNotification` 通知 user**(QUOTA=額度耗盡請 user 充值/換帳號/等重置;AUTH=請 user `codex login`),**禁**把空/錯輸出當 clean 或 0-findings 續跑。classifier 純函式 + 單元測 `scripts/test-codex-run-guarded.mjs`(9/9,含 429/usage-limit/out-of-usage/401/login/empty/bad-model/signal)。錨:2026-07-10 我自己的 Anthropic subagent 額度耗盡(workflow 半途 fail),user 抓「codex 的也要這樣偵測+通知」。

## Mechanical enforcement

`stop_self_audit.sh` 偵測「本 turn 含 codex/dual-track/比稿 keyword + 無 `node_modules/.bin/codex` cmd trace」→ BLOCKER inject。

## 反 pattern(永久 ban)

- ❌ `which codex` 失敗斷言 unreachable + 嘗試 `sudo npm i -g`
- ❌ Fallback Explore agent 當 codex 替身(同模型,不滿 dual-track)
- ❌ AI auto-invoke `--dangerously-bypass` without user explicit authorize
- ❌ Brief allow batch `browser_run_code_unsafe`(已驗 fail)
- ❌ Skip capability smoke 直接 full run
- ❌ Brief 允許 codex edit / delete / write source code under bypass mode
- ❌ 大型 6+ 軸 brief + high reasoning(2026-05-29 r1-r4 anchor)
