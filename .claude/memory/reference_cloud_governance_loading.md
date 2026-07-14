---
name: reference-cloud-governance-loading
description: "Claude Code 雲端 sandbox 治理載入實證 — committed .claude 全 4 hook event 會 fire,plugin 不可靠"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

# 雲端 sandbox 治理載入(2026-06-16 親身實證)

**Q**:fork 使用者(尤其在 web Claude Code / claude.ai/code 雲端 sandbox)怎麼可靠拿到 DS 治理(hooks/skills/commands),且官方控管不可客製?

## 實證結論(REMOTE=true 真雲端 session 驗過,非文件推測)

- **committed `.claude/settings.json` 的全 4 種 hook event 在雲端 sandbox 都自動 fire**:SessionStart / PreToolUse / PostToolUse / UserPromptSubmit。證據:雲端 session(REMOTE=true)的 `.claude/logs/hook-fires-per-hook.jsonl` 含 PreToolUse hooks(check_solo_workflow / check_codex_collab_5step / check_codex_brief_invariants)+ PostToolUse(auto_regen_ds_barrel)當次 timestamp 紀錄。本機 `claude -p` 也獨立證過 committed hook 在無 plugin fresh fork 會 fire。
- **plugin 路在雲端不可靠**:`/plugin install` 回報成功但 hooks 第一個 cloud session 不 fire(GitHub anthropics/claude-code#63028);專案級 `enabledPlugins` 被靜默忽略(#62174)。「回報成功 ≠ 真生效」= false-positive 陷阱。
- **`claude --cloud` 需互動 TTY**,本機 headless 無法驅動雲端 session(`--cloud -p` 報「Cloud sessions are interactive only」)→ 雲端最終確認只能在 claude.ai/code 互動跑。
- **skills/commands 只從官方位置自動載入**(`.claude/skills`/`.claude/commands`/plugin),**不認 node_modules**(codex cite Claude docs)。故 skills 要嘛 committed 進 `.claude/skills`,要嘛走 plugin。

## 對架構的意涵

跨環境治理散布的可行機制 = **committed `.claude` 配置**(非 plugin)。官方控管靠「本體放 npm 套件(npm install 覆蓋 = 改不動)+ committed 啟動器指向 node_modules 本體 + CI 抓竄改(detect-not-prevent;真鎖死需企業版 managed-settings)」。共識方案見 [[project_cprime_governance_delivery]](若已建 plan doc)。

## Mid-session reload 語意(2026-06-18 官方 docs 實證 — 修正「sync-all 中途都要重啟」誤解)

fork 中途 `npm run sync-all` / `npm install` 後**三軌生效不同**(別盲目叫 user 重啟整個 session):
- **Hook command scripts**:每次 fire 重 spawn + 重讀 disk → **即時**(dispatcher 讀 node_modules manifest 當下最新)。
- **settings.json(hooks/permissions)**:**file watcher 自動 hot-reload**,有 `ConfigChange` hook event;**非必重啟**(docs verbatim: "Direct edits to hooks in settings files are normally picked up automatically by the file watcher")。
- **preamble / CLAUDE.md / rules / skills**:SessionStart-only(`source` = startup/resume/**clear**/compact)→ `/clear` 或下個 session 才重讀;skills 在 session 開始前掃 → 同理需 `/clear`/新 session。
- **結論**:只有「事前指引 preamble + skills」需 `/clear` 或新 session;機械 hook 即時、settings 自動 reload。`UserPromptSubmit` 可每 prompt 注 `additionalContext`(理論可做 in-session preamble re-inject,但 preamble 大→token 成本高→**不採用**,/clear 是乾淨慣例)。
- 雲端:每 session fresh clone + SessionStart `npm install @beta` → 開新 session 本來就全套最新;中途 sync 主要是地端情境。

## C-prime committed-config fork 治理(shipped beta.70;2026-07-14 合併原 project_cprime_governance_shipped,campaign 已完結歸 reference)

**已發版 beta.70**(2026-06-17,commit `c8f198b5` tagged;main `81912f8d`)。

- **架構**:fork 治理本體(fork hooks + 設計紀律 preamble + manifest)隨 npm ship 在 `node_modules/@qijenchen/design-system/ds-canonical/fork/`;committed `.claude/settings.json` 掛 2 thin 啟動器 — `inject_fork_governance_preamble.sh`(SessionStart:install-if-missing 治理本體 + 注入 preamble,**單一 process sequential** 消除並行 race)+ `fork-governance-dispatcher.sh`(Pre/Post/UserPromptSubmit:讀 manifest 跑官方 fork hook)。`npm run sync-all` 同步本體 + `scripts/refresh-fork-launchers.mjs` idempotent 刷新接線骨架(strip 舊 launcher + 移除 obsolete plugin-era hook 防 brick + union permissions;`.github/no-governance-sync` opt-out)。**不需 plugin**(理由 = 上方 plugin 不可靠實證)。
- **機械層驗證全綠**:`build-fork-governance --check` / `test-fork-governance` harness / dogfood(published tarball 含全 corpus 無 leak)/ mirror 0 leaks / tsc / preflight;CI gate wired 進 ci.yml + release.yml + packaging-canary。4 輪獨立對抗稽核修 17 finding(4 BLOCKER 含「dispatcher 用 bash 跑 .py → exit 2 brick 所有 fork 編輯」+ 8 MAJOR 含 registry 漏 ship / 既有 fork 遷移 brick / 雲端 SessionStart 並行 race)。
- **雲端端到端 100% 蓋章(2026-06-17 user 真機 claude.ai/code)**:(a) **proactive 指引層** — user 連 `ajenchen/ds-product-template` cold-clone session,cloud AI context 已含 item-anatomy 設計紀律,對照 published beta.70 preamble 1:1(item-anatomy ×19 / slot 模型 / M1·M8·M16 / 31 正確 node_modules pointer·0 死 .claude pointer)= 非幻覺;(b) **機械強制層** — cloud AI 故意手刻 `<table>` → committed PostToolUse dispatcher 實際 fire **P0「CONSUMER-DS-PRIMITIVE-MISUSE BLOCKER」**,cite build-ui-canonicals.md:18 + 兩條 sanctioned remedy(DataTable / `@ds-misuse-allow`)。**兩半皆親證生效。**
- 副產:fork dispatcher 生 `.claude/logs/hook-fires-per-hook.jsonl` telemetry noise → 模板 .gitignore 已補 `.claude/logs/`。SSOT 分類 = `scripts/fork-governance-classification.json`。

**時效注意**:#63028/#62174 是 Claude Code bug,未來可能修復;committed-config-works 是標準行為較穩。引用前若關鍵請重驗。
