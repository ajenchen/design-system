---
name: Codex collab canonical(常設授權 + transport + dual-track 紀律,2026-08-12 三檔合併)
description: 研究/審查 ad-hoc codex 常設授權全存取沙箱;地端 transport 4-test + 守衛入口 + 最強模型禁降檔 + 小 focused brief;M31 dual-track 三層禁 pass-through + brief 三 invariant + Phase-A-first + auto-mode 禁問
type: feedback
originSessionId: b1e3fe19-f71f-4828-b483-cf3fe2323f47
---
# Codex collab canonical(2026-08-12 合併 dual_track_synthesizer + exec_transport,invariant 零損失)

**程序 SSOT** = `codex-collab/SKILL.md` + meta-patterns M31 + AGENTS.md「自主執行 canonical」;本檔 = user 授權事實(verbatim)+ sharp invariants。

## A. 常設授權(user 2026-08-08 verbatim)

「我要授權codex永遠都可以做這種事啊,確保ssot不要再作繭自縛了,我授權該做的就自動做一做」
→ 研究/審查/比稿 ad-hoc codex 一律可用 `--sandbox danger-full-access` / `--dangerously-bypass-approvals-and-sandbox`,**不逐次請示**。
**邊界不變**:brief 限 read-only 產出,禁 codex 寫/刪/改 source;受治理 provider broker lane 的 `forbiddenArguments` 禁令不因此放寬。
**禁自鎖**(user:「你他媽不要又再作繭自縛為自己加鎖了」):授權內動作被自家 policy/schema/sandbox/hook 擋 → 解自己的鎖或用不放寬安全邊界的既有機制;禁丟回 user/要 user 付費/宣稱做不到。真人邊界僅 login/MFA/OAuth、缺 credential reference、plan 外付費、法律/帳號、產品-UI-UX 真取捨。同族 = M36(b)(b′)。

## B. Transport(地端)

1. **4-test discovery 順序固定**:`node_modules/.bin/codex` → `which codex` → `~/.codex/auth.json` → `npx --yes @openai/codex --version`(2026-08-08 實測 0.147.0;npm cache EPERM 設 `NPM_CONFIG_CACHE`)。`which` 失敗 ≠ unreachable;**絕禁 Explore agent 當 codex 替身**(同模型,不滿 dual-track)。錨 2026-05-17 user:「你他媽你難道不知道這裡是地端?」
2. **沙箱內 codex 跑得起來,入口 = `node scripts/codex-exec.mjs --brief <path> --out <path>`**(2026-09-05 實測 `TRANSPORT_OK`)。舊記載「unix socket 被擋、是平台邊界、要 user 開終端機跑 worker」**是錯的歸因**,兩道其實都是自家的鎖:(a) `~/.codex/config.toml` 有三個 MCP server(pencil `.app`、`npx @playwright/mcp`、node_repl),codex 啟動時 spawn 它們被沙箱擋 → `failed to initialize in-process app-server client`;解法 = 臨時 CODEX_HOME 只刪 `[mcp_servers.*]`、其餘逐字保留(禁降檔結構上成立)。(b) 代理做 TLS 攔截,rustls 不認它的 CA → `invalid peer certificate: UnknownIssuer` 無限重連;curl 走 `/etc/ssl/cert.pem` 就通,指同一份給 rustls 即可(`SSL_CERT_FILE`)。**永遠不要再請 user 開終端機跑 worker**;`scripts/codex-worker.sh` 只留作 codex-exec 失效時的備援。錨 2026-09-05 user:「到底為何沒次都要我開終端機?你他媽你明明就可以自動送自動收」。
3. **最強模型與算力,禁降檔**(user 2026-07-10 verbatim「應強制使用 codex 最新最強的模型與算力」):`~/.codex/config.toml` 為 SSOT(無 model pin + probe 出的最高 effort;`scripts/check-codex-freshness.mjs --probe` 機械維護),exec **不帶** `-m`/`-c model_reasoning_effort`。
4. **守衛入口(硬)**:audit/dual-track 的 codex exec 必經 `node scripts/codex-run-guarded.mjs`;非 SUCCESS(QUOTA/AUTH/EMPTY/ERROR/TRANSPORT_MISSING)→ STOP + PushNotification 通知 user,**禁把空輸出當 0-findings**。錨 2026-07-10 user:「codex 額度不足你會知道嗎?應通知你,你要通知我讓我處理」。
5. **大 brief 死局**:6+ 軸 DISCUSS-ONLY 大 brief 會燒光 budget 零產出(2026-05-29 r1-r4 錨)→ 只允許「拆 N 個 single-axis focused brief 並行 + 禁寫 plan、直接輸出 verdict」,**不允許降 effort 省成本**。
6. Visual audit MCP:必 bypass 旗標(A. 常設授權涵蓋);sequential MCP 禁 batch `browser_run_code_unsafe`;截圖移出 repo root。錨 2026-05-27 62/62 PASS。

## C. Dual-track 紀律(M31)

- **User verbatim(2026-05-10)**:「你跟 codex 都要各自驗證過…最後你整合出完美完整的版本」「避免你完全被 codex 的錯誤解法牽著走」「我就是要有 2nd opinion 的機制來監督…以 SSOT 為前提,**不以省工為前提**」。
- **三層缺一違反**:Layer A(Claude own)+ B(codex own)+ C(比稿 synthesize);禁 pass-through / single-track /「codex 已查所以我不查」。錨:Issue 8 pass-through ship vs Issue 11 cite battle。
- **Phase-A-first**(2026-05-29):啟 codex 前必先完成自己的完整 Phase A(跑 deterministic script ≠ Phase A)。
- **Brief 三 invariant**(hook `check_codex_brief_invariants.sh`):全盤閱讀禁憑記憶 / per-finding triple-verify / NO-SAMPLE。
- **Codex-first for root-cause-elusive bug**:自查窮盡仍無根因(CSS quirk/browser/async)→ 立刻丟 codex,不苦撐。錨:scrollbar-color Chrome 121+。
- **Triple-verify before bothering user**(user:「到底是不是真的問題還是只是無病呻吟」):propose/報 problem 前 (1)grep DS-wide (2)Read spec/tsx (3)對照 canonical exception;任一 NO → 撤回。錨:2026-05-18 三題全誤報。
- **Auto-mode 禁為 non-SSOT ASK**:governance/sync/命名/test 策略/跑不跑 prune → 自己 pick best execute 禁列 A/B/C;deep-audit 收尾 /knowledge-prune 必 AUTO-RUN 禁問。錨:2026-05-29 + 2026-06-11 兩度被怒糾。
- **「trust 自己」= 完整 adversarial dual-track**,永不可解讀為 skip codex(180° 相反)。

## Anti-pattern(永久 ban)

❌ pass-through / single-track / 省工跳 verify ❌ `which codex` 失敗即斷言 unreachable / `sudo npm i -g` ❌ Explore 替身 ❌ 大 brief + 任何降檔 ❌ 空輸出當 clean ❌ brief 缺三 invariant ❌ ASK non-SSOT ❌ bypass 下允許 codex 改 source

**Mechanical**:`check_codex_collab_5step.sh` / `check_codex_brief_invariants.sh` / `check_audit_sample_escape.sh` / `stop_self_audit.sh`(Phase-A-first + codex trace)/ `codex-run-guarded.mjs`。
**Trigger**:「比稿 / 2nd opinion / dual-track / 不打折 / 不省工」→ codex-collab SKILL。
