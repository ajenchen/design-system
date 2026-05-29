#!/bin/bash
# DS-repo Codespaces onboarding banner(Scenario A — DS source repo).
# 與 template/ds-product-template/.devcontainer/onboard-banner.sh 的差異:
#   本 repo 是 governance SOURCE(.claude/ native 可讀)→ 不需 /plugin install 步驟。
# fail-open:純 echo,無外部呼叫,任何情況 exit 0。
set -u
cat <<'BANNER'

╔══════════════════════════════════════════════════════════════╗
║  design-system (DS source repo) — Codespaces ready            ║
╚══════════════════════════════════════════════════════════════╝

這是 DS 原始碼 repo(Scenario A)。Governance(.claude/ hooks + skills + rules)原生可讀,
不需 /plugin install(那是 Scenario B 消費端 fork 才需要)。

下一步:
  1. claude                      # 啟動 Claude Code(已隨 devcontainer 安裝)
  2. npm run storybook           # 本地 Storybook → http://localhost:6006
  3. npm run setup:netlify       # (選用)建 Netlify site + Basic Password,給人驗證 preview

工作流(地端 / 雲端一致):
  edit → push working branch → Netlify per-branch preview(你驗證的 gate)
       → 你說 push → squash merge main → GitHub Pages 自動更新 Storybook

⚠️ 禁直接在 main 上改 production code(check_main_branch_workbench.sh 攔);1 chat = 1 working branch。

BANNER
exit 0
