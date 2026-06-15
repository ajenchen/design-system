---
name: Deploy URL auto-detection — Netlify site name 推導三 strategy + per-user override
description: 2026-05-27 user verbatim「不管 repo 都自動推導 deploy URL + 部署到哪就給對應 URL」+ Netlify site naming 不一定 derive-from-repo,需 multi-pattern + per-user override fallback
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Rule

**Deploy URL auto-provide on git push:**3-strategy resolution per repo + per-user override fallback。Hook `inject_deploy_url_after_push.sh` v4 ship 2026-05-27。

## Detection paths(in order)

1. **Netlify CLI-linked**(`.netlify/state.json` + `scripts/deploy-url.mjs`):script 抓 real site slug,production / preview URL 都從 state.json siteSlug 推
2. **Netlify dashboard-link**(`netlify.toml` exists,no state.json):
   - 試 `<repo-name>.netlify.app`(simple)
   - 試 `<owner>-<repo-name>.netlify.app`(Netlify Import default)
   - 讀 `~/.claude/local/deploy-targets.json` per-user override(custom site name)
   - **必 curl HEAD verify 200** + **content sniff Storybook hallmark**(`sb-manager / sb-addons / @storybook/core`)→ 防 squat domain false-positive
3. **GitHub Pages**(`.github/workflows/*.yml` 含 `actions/deploy-pages` OR `gh-pages` OR `github.io`):推 `<owner>.github.io/<repo>/` + verify 200。Only fires on main / master push

## Per-user override file

**`~/.claude/local/deploy-targets.json`** (gitignored,per-machine):

```json
{
  "ajenchen/design-system": "https://ajenchen-design-system.netlify.app",
  "ajenchen/ds-product-template": "https://qijenchen.netlify.app"
}
```

Hook reads this when `netlify.toml` 存在 + key matches `<owner>/<repo>` from git remote。Override 永遠 win over derived patterns。

## Known verified URLs(this user `qijenchen`)

| Repo | Netlify URL | GH Pages URL |
|---|---|---|
| `ajenchen/design-system`(DS) | https://ajenchen-design-system.netlify.app ✅ | https://ajenchen.github.io/design-system/ ✅ |
| `ajenchen/ds-product-template`(PW,formerly product-workspace)| https://qijenchen.netlify.app ✅ | — |

**Note**:`design-system.netlify.app` 200 但是 squat 別人的 React App,**非** DS。Content sniff catches this — only Storybook content qualifies。

## Why per-user override(不能 fully auto)

- Netlify site name = user 自選(via Dashboard Settings → Site name),non-derivable from repo metadata
- User 名 `qijenchen` 跟 GitHub owner `ajenchen` 不同(different identity / handle)
- Repo rename(`product-workspace` → `ds-product-template`)Netlify subdomain 不會 auto-rename,需 user 手動改 dashboard OR keep old name
- 沒 Netlify auth token 不能 query Netlify API list sites by owner

**For fork users**:
- Default path = Netlify Import → `<github-user>-<repo>` pattern(`<owner>-<repo-name>.netlify.app`)
- Hook v4 第 2 候選 `<owner>-<repo>` 自動 match 約 80% fork user
- Custom-named sites → fork user 自設 `~/.claude/local/deploy-targets.json`

## Mechanical enforcement

- Hook fires on `PostToolUse Bash` 含 `git push origin <branch>`
- Skip `push --delete`(branch cleanup,not deploy)
- 3 detection paths sequential,first non-empty 結束
- curl HEAD verify(timeout 5s)+ content sniff
- Output via PostToolUse stdout(AI 下個 turn 看到)

## Anti-pattern(永久 ban)

- ❌ 提供 URL 不 verify 真實 reachability(2026-05-27 my v2 false-claim「design-system.netlify.app verified」實際 squat)
- ❌ 推導 only `<repo>.netlify.app` 不試 `<owner>-<repo>`(漏 Netlify Import 80% case)
- ❌ Hardcode site name in committed file(per-user,not per-repo)
- ❌ silent skip when can't derive — explicit warn + ask user
- ❌ AI 自報「應該是 X」without curl verify(per AI-self-audit-unreliable canonical)

## 對齊原則

- AI-self-audit-unreliable canonical(`feedback_ai_self_audit_unreliable_mechanical_primary_2026_05_27.md`):curl HEAD = mechanical ground-truth,優於 AI 推導
- Content sniff = expand layer(不取代 HTTP 200 check)
- mindset #1 不取巧:真 reachable 才報 URL,模糊地說「應該是」= 取巧
