#!/bin/bash
# DS-repo Codespaces onboarding banner(Scenario A — DS source repo).
# 與 template/ds-product-template/.devcontainer/onboard-banner.sh 共用 provider-neutral
# setup 契約；本 repo 另外標示它是 governance authority source。
# fail-open:純 echo,無外部呼叫,任何情況 exit 0。
set -u
cat <<'BANNER'

╔══════════════════════════════════════════════════════════════╗
║  design-system (DS source repo) — Codespaces ready            ║
╚══════════════════════════════════════════════════════════════╝

這是 DS 原始碼 repo(Scenario A)。Claude Code、Codex 與後續註冊的 provider 都讀取
同一份治理 SSOT；authority 與 consumer 都不需要 plugin 或 session-time install。
Post-create 已執行唯一入口 `npm run setup:all`：exact dependency、provider CLI、
Chromium、governance check 與 All-Harness 任一失敗都會讓 setup 失敗；需要重驗時
只重跑這一條命令。

下一步:
  1. claude 或 codex             # 兩者都由 repo-pinned toolchain 提供
  2. npm run storybook           # 本地 Storybook → http://localhost:6006
  3. npm run setup:netlify       # (選用)印 Dashboard 人工建站／Basic Auth 指引；exit 2 為預期

工作流(地端 / 雲端一致):
  edit → push working branch → Netlify per-branch preview(你驗證的 gate)
       → 你說 push → squash merge main → GitHub Pages 自動更新 Storybook

⚠️ 禁直接在 main 上改 production code(check_main_branch_workbench.sh 攔);1 chat = 1 working branch。

BANNER
exit 0
