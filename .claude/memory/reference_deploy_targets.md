---
name: Deploy targets + URL auto-detection(2026-06-11 合併 feedback_deploy_url_auto_detect)
description: Storybook Pages + Netlify per-branch preview canonical + deploy URL 3-strategy 自動推導 + per-user override + transport self-awareness
type: reference
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Deploy targets + URL auto-detection

## ⚠️ 永久 transport self-awareness(2026-05-15 user codify;2026-06-11 修 stale 指令)

**Codex collab 前自動判斷地端 vs 雲端**:地端 = local CLI `node_modules/.bin/codex`(3-test 順序 + bypass 詳 `feedback_codex_exec_transport_canonical.md` SSOT);雲端 sandbox = GitHub `@codex` mention。
**判斷 signal**:`CLAUDE_PROJECT_DIR` 含 `/Users/`、路徑含 `Library/CloudStorage/GoogleDrive` = 地端。
**User 原話**(2026-05-15):「你應該每次在和 codex 協作前都會自己主動自動知道自己在地端還是雲端然後進而知道該以何種工作流程工作,對嗎」

## ⚠️ 永久 anti-pattern:檢查部署看 Netlify 不看 GitHub Pages

**User 訊息含「Netlify / deploy 沒更新 / 沒部署」**:❌ 絕禁 `gh api …/deployments`(GitHub Pages 只看 main)、❌ 絕禁結論「沒 merge main 所以沒 deploy」;✅ 必檢查 Netlify per-branch preview(任何 branch push 都自動 deploy)。
**User 原話 SSOT**(2026-05-15):「所有你做的編輯都會直接部署到 netlify,直到我驗證確認才會叫你 push 到 main(GitHub page)…你現在不應該去檢查 GitHub page 是否是最新,而是應該檢查 netlify 是否是最新才對吧?」
犯錯 anchor:2026-05-15 連 3 次查 Pages SHA 下錯結論。

## Deploy URL 自動推導(hook `inject_deploy_url_after_push.sh` v4,2026-05-27 user verbatim「不管 repo 都自動推導」)

**3-strategy(依序,first non-empty)**:
1. Netlify CLI-linked:`.netlify/state.json` siteSlug(`scripts/deploy-url.mjs`)
2. Netlify dashboard-link(`netlify.toml` 無 state.json):試 `<repo>.netlify.app` → `<owner>-<repo>.netlify.app`(Import 預設,~80% fork user)→ 讀 `~/.claude/local/deploy-targets.json` per-user override(override 永遠 win);**必 curl HEAD 200 + content sniff Storybook hallmark**(sb-manager / sb-addons)防 squat false-positive(anchor:design-system.netlify.app 200 但是別人的 squat)
3. GitHub Pages(workflow 含 deploy-pages / gh-pages):推 `<owner>.github.io/<repo>/`,只在 main push fire

**Per-user override 為何必要**:Netlify site name user 自選不可推導(user `qijenchen` ≠ GitHub owner `ajenchen`;repo rename 後 subdomain 不跟);無 token 不能 query API。override 檔 gitignored per-machine。

**Known verified URLs(this user)**:
| Repo | Netlify | GH Pages |
|---|---|---|
| ajenchen/design-system | https://ajenchen-design-system.netlify.app ✅ | https://ajenchen.github.io/design-system/ ✅ |
| ajenchen/ds-product-template | https://qijenchen.netlify.app ✅ | — |

## 部署管道

- **Netlify per-branch preview** = solo-work user gate(branch push 自動);**Netlify production** = main(storybook)
- **GitHub Pages production** = main push → ci.yml deploy-storybook job(2026-05-08 補;netlify.toml command = build-storybook,publish storybook-static)
- Solo-work 對齊:AI push branch → preview(user gate)→ user「push」→ squash main → Pages + Netlify production

## Anti-pattern(永久 ban,deploy URL)

- ❌ 提供 URL 不 curl verify(2026-05-27 v2 false-claim squat anchor)/ ❌ 只試 `<repo>.netlify.app` 不試 `<owner>-<repo>` / ❌ hardcode site name 進 committed file / ❌ 推導不出時 silent skip(必 explicit warn)/ ❌「應該是 X」不驗證(curl = mechanical ground-truth,per `feedback_ai_ground_truth_unreliable_mechanical_primary.md`)
