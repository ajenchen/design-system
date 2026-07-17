#!/bin/bash
# inject_deploy_url_after_push.sh — UserPromptSubmit + PostToolUse: 偵測 git push 後自動 inject deploy URL
#
# Per user verbatim 2026-05-26:「完成部署之後都應該自動回吐部署的連結,每次必定自動回,不論是現在這個 session 還是其他的」
# Per user verbatim 2026-05-27:「不管在任何 repo,只要有部署東西到 netlify 上不管是否是 production 都應該要提供連結」
#
# Mechanism(2026-05-27 v2 expand scope per user complaint — DS GH Pages also auto-provide URL):
#   PostToolUse Bash:tool_input.command 含 `git push origin <branch>` → 偵測 → multi-target URL detection:
#     1. Netlify(scripts/deploy-url.mjs + .netlify/state.json)— PW + fork
#     2. Netlify dashboard-link(netlify.toml exists,no state.json)— PW with Netlify auto-build
#     3. GitHub Pages(.github/workflows/*.yml 含 pages action)— DS repo
#   → output URL list inject into AI context(下個 reply 必看到)
#
# 為何走 Hook(per CLAUDE.md governance 8-home L7 Hook 自動化):
#   - 不靠 AI 記得「每次推完都要 echo URL」(會忘記 — 本 session user 抓「你他媽到底做得怎樣」)
#   - 不靠 user 每次問「部署到哪?」(無聊重複)
#   - Hook 機械保證每 push 必觸發,跨 session / 跨 fork user 自動受惠
#
# Scope expanded(2026-05-27):
#   - Netlify CLI-linked (.netlify/state.json + scripts/deploy-url.mjs) → 直接 script 抓 URL
#   - Netlify dashboard-linked (netlify.toml + branch deploys) → 用 git remote 推導 site name
#   - GitHub Pages (.github/workflows/*.yml 含 pages.yml OR ci.yml deploy-pages) → 推導 GH Pages URL
#
# 對齊:.claude/skills/codex-collab/SKILL.md PostToolUse pattern + check_fork_user_plugin_install.sh detection pattern

source "$(dirname "$0")/_log-fire.sh" 2>/dev/null && log_hook_fire

set -uo pipefail
INPUT=$(cat 2>/dev/null || echo "{}")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""' 2>/dev/null)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Scope:PostToolUse Bash 且 cmd 含 git push to remote(main / branch)
[ "$EVENT" != "PostToolUse" ] && exit 0
[ "$TOOL" != "Bash" ] && exit 0

# Heuristic:detect `git push origin <branch>` patterns
# 2026-06-06 fix:要求 `git push` 在「命令邊界」(行首 / ; / && / || / $( )擋字串提及(`P='git push origin'`)。
# 2026-06-07 fix(對抗 sweep):容忍 env-prefix(`GIT_SSH_COMMAND=… git push`)/ `git -C <dir>` /
# push 前後任意 flag(`--force-with-lease` / `-f` / `--set-upstream` / `--no-verify` 等)。原本只認 `-u`
# → 漏 fire 在這些「真實 push」上 = 該吐 URL 卻沒吐,defeat hook purpose。
_ENVP='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*'
_GITPRE='git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+|-[A-Za-z][^[:space:]]*[[:space:]]+)*push'
_PUSHFLAGS='([[:space:]]+-{1,2}[A-Za-z][^[:space:]]*)*'
if ! echo "$CMD" | grep -qE "(^|[;&|(])[[:space:]]*${_ENVP}${_GITPRE}${_PUSHFLAGS}[[:space:]]+origin\b"; then
  exit 0
fi

# Skip if push --delete (branch cleanup, not deploy)
if echo "$CMD" | grep -qE 'push\s+origin\s+--delete'; then
  exit 0
fi

CWD=$(pwd)
# 2026-06-07 fix:偵測「真實 working dir」作 deploy-target 偵測根,跨 repo push 不吐「錯 repo」URL
# (anchor:syncing ds-product-template 時吐成 DS 站台 URL)。優先 `git -C <dir>`;否則命令鏈中
# 「最後一個 cd」(= push 時 effective cwd,**非第一個**;`echo x && cd /other && git push` 必用 /other)。
_GITC=$(echo "$CMD" | grep -oE 'git[[:space:]]+-C[[:space:]]+[^[:space:]]+' | head -1 | sed -E 's/.*-C[[:space:]]+//; s/^"//; s/"$//')
_LASTCD=$(echo "$CMD" | grep -oE '(^|[;&|(])[[:space:]]*cd[[:space:]]+[^;&|]+' | tail -1 | sed -E 's/.*cd[[:space:]]+//; s/[[:space:]]+$//; s/^"//; s/"$//')
for _d in "$_GITC" "$_LASTCD"; do
  if [ -n "$_d" ] && [ -d "$_d" ] && git -C "$_d" rev-parse --git-dir >/dev/null 2>&1; then CWD="$_d"; break; fi
done
URLS_FOUND=""
# 2026-06-07 ROOT fix:只從「git push ... origin <ref>」這一段擷取 branch,不是整條 compound command 的
# 第一個 `origin X`。否則 `git fetch origin --quiet && git push origin main` 會誤抓 fetch 段的 `--quiet`
# 當 branch → 推導 `--quiet--site` 404(此前 5 道 guard 都沒擋到,因 `--quiet` 全是合法 git ref 字元)。
# 隔出 push 段(到下個 command 分隔 ; & | 為止)後,取 origin 後第一個 token。
# PUSH_SEG 用同一 env/-C/flag-tolerant prefix 隔出 push 段(到下個分隔 ; & | 為止),再取 origin 後第一 token
PUSH_SEG=$(echo "$CMD" | grep -oE "(^|[;&|(])[[:space:]]*${_ENVP}${_GITPRE}[^;&|]*" | head -1)
BRANCH=$(echo "$PUSH_SEG" | grep -oE 'origin[[:space:]]+[^[:space:]]+' | head -1 | awk '{print $2}')
# origin 後第一個 token 是 flag(`git push origin --force` = 無顯式 branch)→ 清空走 current-branch fallback
case "$BRANCH" in -*) BRANCH="" ;; esac
# 2026-06-06 fix:refspec `src:dst` → 取 dst(`HEAD:main` → `main`),否則推導出 `HEAD:main--site` 404 URL
case "$BRANCH" in *:*) BRANCH="${BRANCH##*:}" ;; esac
# 2026-06-07 fix:full-ref dst — `HEAD:refs/heads/main` → `main`(否則 `refs/heads/main--site` 誤判 preview);
# `refs/tags/...` → tag push,skip
case "$BRANCH" in refs/tags/*) exit 0 ;; esac
BRANCH="${BRANCH#refs/heads/}"
# 2026-06-06 fix:`git push origin HEAD`(或 `@`)= symbolic ref 指向當前 branch → 解析成真 branch 名。
# 2026-06-07 fix:detached HEAD 時 show-current 回「空字串 + exit 0」→ BRANCH 留空,交給下方 value-based fallback
# (原 `|| echo ""` 沒用,因 git 不是失敗而是成功回空)。
if [ "$BRANCH" = "HEAD" ] || [ "$BRANCH" = "@" ]; then
  BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
fi
# 2026-06-06 fix:BRANCH 含非法 git ref 字元(" ' 空白 \ 等)→ 此命令只是「字串裡含 git push origin」
# (測試迴圈 / 文件 / echo),非真推送 → skip,避免把 `main"` 等垃圾推導成 404 URL 注入 context。
# git ref 合法字元集 ⊂ [A-Za-z0-9._/-];非此集 = 必為解析噪音(root guard,涵蓋 refspec/tag 之外的雜訊)。
if [ -n "$BRANCH" ] && ! echo "$BRANCH" | grep -qE '^[A-Za-z0-9._/-]+$'; then exit 0; fi
# 2026-06-06 fix:tag push(`v1.2.3` 等)不產 branch-preview / production deploy → skip,
# 否則把 tag 名當 branch 推導出 `v0.1.0-beta.56--site` 404 URL(release tag push 每次都誤吐)
if echo "$BRANCH" | grep -qE '^v[0-9]'; then exit 0; fi
if [ -n "$BRANCH" ] && git -C "$CWD" rev-parse --verify --quiet "refs/tags/$BRANCH" >/dev/null 2>&1; then exit 0; fi
# 2026-06-07 fix:仍空(bare `git push origin` / detached HEAD / 解析不出)→ 取 current branch(value-based);
# 仍空 → 無法產生合法 URL(會變 `https://--site` malformed)→ skip,不亂猜 main。
[ -z "$BRANCH" ] && BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

# v3 2026-05-27:curl HEAD verify URL before reporting(per user「你確定有做到」complaint)
# v4 2026-05-27:add content sniff(防 squat URLs 200 但 unrelated content)
verify_url() {
  local url="$1"
  local code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 5 -I "$url" 2>/dev/null)
  case "$code" in
    200|301|302) echo "OK" ;;
    *) echo "FAIL:$code" ;;
  esac
}

# v4 content sniff:check 200 URL 是 Storybook real deploy(not squat)
# 用 Storybook hallmark patterns(sb-manager / sb-addons / @storybook/core title)
is_storybook_deploy() {
  local url="$1"
  curl -s --max-time 5 -L "$url" 2>/dev/null | grep -qE "sb-manager|sb-addons|@storybook/core|storybook-static"
}

# Detection 1:Netlify CLI-linked(.netlify/state.json + scripts/deploy-url.mjs)
DEPLOY_SCRIPT="$CWD/scripts/deploy-url.mjs"
if [ -f "$DEPLOY_SCRIPT" ] && [ -f "$CWD/.netlify/state.json" ]; then
  URL_INFO=$(node "$DEPLOY_SCRIPT" --json 2>/dev/null)
  if [ -n "$URL_INFO" ]; then
    URL=$(echo "$URL_INFO" | jq -r '.url // ""' 2>/dev/null)
    IS_PROD=$(echo "$URL_INFO" | jq -r '.isProd // false' 2>/dev/null)
    if [ -n "$URL" ]; then
      if [ "$IS_PROD" = "true" ]; then
        URLS_FOUND="${URLS_FOUND}🚀 Netlify PRODUCTION(${BRANCH}): ${URL}\n"
      else
        URLS_FOUND="${URLS_FOUND}🔍 Netlify PREVIEW(${BRANCH}): ${URL}\n"
      fi
    fi
  fi
fi

# Detection 2:Netlify dashboard-linked(netlify.toml + no state.json)
# v4:try multiple naming conventions + content sniff to filter squat URLs
if [ -z "$URLS_FOUND" ] && [ -f "$CWD/netlify.toml" ]; then
  GH_REMOTE=$(git -C "$CWD" remote get-url origin 2>/dev/null)
  REPO_NAME=$(echo "$GH_REMOTE" | sed -E 's|.*/([^/.]+)(\.git)?$|\1|')
  OWNER_REPO=$(echo "$GH_REMOTE" | sed -E 's|.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$|\1|')
  OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)

  # v5 multi-candidate strategy(Netlify naming conventions in order of likelihood):
  # 1. ~/.claude/local/deploy-targets.json overrides(per-user known URLs)— win all
  # 2. <owner>-<package.json.name>.netlify.app(setup-netlify script convention,per scripts/setup-netlify-access.mjs `${ghUser}-${repoName}` formula)
  # 3. <owner>-<repo-from-remote>.netlify.app(Netlify Import default,fork users without setup script)
  # 4. <repo-from-remote>.netlify.app(simple,rare)
  USER_OVERRIDE=""
  if [ -f "$HOME/.claude/local/deploy-targets.json" ]; then
    USER_OVERRIDE=$(jq -r --arg key "$OWNER_REPO" '.[$key] // ""' "$HOME/.claude/local/deploy-targets.json" 2>/dev/null)
  fi
  # Read package.json.name for setup-script convention
  PKG_NAME=""
  if [ -f "$CWD/package.json" ]; then
    PKG_NAME=$(jq -r '.name // ""' "$CWD/package.json" 2>/dev/null | sed -E 's|^@[^/]+/||')  # strip npm scope
  fi
  CANDIDATES=""
  if [ -n "$USER_OVERRIDE" ]; then
    CANDIDATES="$USER_OVERRIDE"
  else
    # Setup-script convention candidate(highest match rate for fork users following docs)
    if [ -n "$OWNER" ] && [ -n "$PKG_NAME" ]; then CANDIDATES="$CANDIDATES https://${OWNER}-${PKG_NAME}.netlify.app"; fi
    # Netlify Import default(no setup script, manual dashboard import)
    if [ -n "$OWNER" ] && [ -n "$REPO_NAME" ] && [ "$REPO_NAME" != "$PKG_NAME" ]; then
      CANDIDATES="$CANDIDATES https://${OWNER}-${REPO_NAME}.netlify.app"
    fi
    # Simple fallback
    if [ -n "$REPO_NAME" ]; then CANDIDATES="$CANDIDATES https://${REPO_NAME}.netlify.app"; fi
  fi

  REAL_URL=""; REAL_NOTE=""
  if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
    # 2026-06-07 fix:優先「200 + Storybook content」;沒有則退「200(內容非 Storybook)」,
    # **不丟棄**已驗 200 的 candidate。anchor:apps/template 是真 product app(非 Storybook)→ 原
    # is_storybook_deploy 把活著的 200 deploy 誤當 squat 報「全 404」,違反 user「不管是否 production 都給連結」。
    FALLBACK_URL=""
    for candidate in $CANDIDATES; do
      if [ "$(verify_url "$candidate")" = "OK" ]; then
        if is_storybook_deploy "$candidate"; then
          REAL_URL="$candidate"; REAL_NOTE="✅ verified 200 + Storybook content"; break
        elif [ -z "$FALLBACK_URL" ]; then
          FALLBACK_URL="$candidate"
        fi
      fi
    done
    if [ -z "$REAL_URL" ] && [ -n "$FALLBACK_URL" ]; then
      REAL_URL="$FALLBACK_URL"; REAL_NOTE="✅ verified 200(內容非 Storybook — 可能 product app deploy)"
    fi
    if [ -n "$REAL_URL" ]; then
      URLS_FOUND="${URLS_FOUND}🚀 Netlify PRODUCTION(${BRANCH}): ${REAL_URL}  ${REAL_NOTE}\n"
    else
      URLS_FOUND="${URLS_FOUND}🚀 Netlify PRODUCTION URL 未驗 — tried: ${CANDIDATES// /, }\n   ⚠️ 全 404。需要 user 手動 share dashboard URL,OR 創 \$HOME/.claude/local/deploy-targets.json:\n   {\"${OWNER_REPO}\": \"https://<actual-site>.netlify.app\"}\n"
    fi
  else
    # Branch preview:always use `<branch>--<sitename>` pattern,but sitename unknown unless USER_OVERRIDE
    if [ -n "$USER_OVERRIDE" ]; then
      SITENAME=$(echo "$USER_OVERRIDE" | sed -E 's|https?://([^.]+)\.netlify\.app.*|\1|')
      # 2026-07-17 bug 修:DNS 單標籤硬上限 63 字元。`<branch>--<site>` 超過 → 該子網域**無法存在**
      # (curl 連 header 都收不到,非 404)。舊版直接拼不截斷 → 長 branch 名吐「物理上不可能」的網址,
      # verify 失敗後還印該 URL 誤導 user。修:超長時截 branch + 誠實標示「branch 名太長,預覽不可靠」。
      BRANCH_SLUG=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]/-/g; s/-+/-/g')
      BUDGET=$(( 63 - ${#SITENAME} - 2 ))
      TRUNCATED=0
      if [ ${#BRANCH_SLUG} -gt $BUDGET ]; then
        BRANCH_SLUG=$(echo "${BRANCH_SLUG:0:$BUDGET}" | sed -E 's/-+$//')
        TRUNCATED=1
      fi
      CANDIDATE="https://${BRANCH_SLUG}--${SITENAME}.netlify.app"
      if [ "$(verify_url "$CANDIDATE")" = "OK" ]; then
        URLS_FOUND="${URLS_FOUND}🔍 Netlify PREVIEW(${BRANCH}): ${CANDIDATE}  ✅ verified 200\n"
      elif [ $TRUNCATED -eq 1 ]; then
        URLS_FOUND="${URLS_FOUND}⚠️ branch 名太長(『${BRANCH}』+ --${SITENAME} 超過 DNS 63 字元)→ Netlify 建不出預覽子網域;截斷版 ${CANDIDATE} 也未命中。可靠做法:縮短 branch 名(≤${BUDGET} 字元)重推,或合 main 後看正式站 https://${SITENAME}.netlify.app\n"
      else
        URLS_FOUND="${URLS_FOUND}🔍 Netlify PREVIEW 推導: ${CANDIDATE}  ⚠️ 未命中(preview 未啟 / build pending / 此 branch 未啟 branch-deploy — 查 Netlify Dashboard Deploys)\n"
      fi
    else
      URLS_FOUND="${URLS_FOUND}🔍 Netlify PREVIEW(${BRANCH}) — sitename 未知;設 \$HOME/.claude/local/deploy-targets.json 後 hook 可推 preview URL\n"
    fi
  fi
fi

# Detection 3:GitHub Pages(.github/workflows/*.yml deploys to gh-pages OR uses actions/deploy-pages)
if ls "$CWD/.github/workflows/"*.yml >/dev/null 2>&1; then
  if grep -l "actions/deploy-pages\|gh-pages\|github.io" "$CWD/.github/workflows/"*.yml >/dev/null 2>&1; then
    GH_REMOTE=$(git -C "$CWD" remote get-url origin 2>/dev/null)
    OWNER_REPO=$(echo "$GH_REMOTE" | sed -E 's|.*github\.com[:/]([^/]+/[^/.]+)(\.git)?$|\1|')
    OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
    REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
    if [ -n "$OWNER" ] && [ -n "$REPO" ] && { [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; }; then
      CANDIDATE="https://${OWNER}.github.io/${REPO}/"
      VERIFY=$(verify_url "$CANDIDATE")
      if [ "$VERIFY" = "OK" ]; then
        URLS_FOUND="${URLS_FOUND}📄 GitHub Pages(${BRANCH}): ${CANDIDATE}  ✅ verified 200\n"
      else
        URLS_FOUND="${URLS_FOUND}📄 GitHub Pages 推導 URL: ${CANDIDATE}  ⚠️ ${VERIFY}(build ~3-5 min;若仍 404 check Actions tab build status)\n"
      fi
    fi
  fi
fi

# No deploy target detected → silent skip
[ -z "$URLS_FOUND" ] && exit 0

# Inject into AI context
# 2026-05-29 ROOT-CAUSE FIX:PostToolUse hook 的純 stdout **不會**注入 AI context(只進 transcript)→
# 原 `printf` 輸出讓 AI 看不到 URL → AI 每次 push 都沒 relay 給 user(user verbatim「部署完都沒給我 url」)。
# 必須輸出 JSON `hookSpecificOutput.additionalContext` 才會真注入 AI context。
MSG=$(printf '%b' "🚀 Deploy URLs auto-detected — RELAY 給 user(per user 2026-05-26「完成部署都自動回吐連結」+ 2026-05-27「不管 repo」):\n${URLS_FOUND}\n(AI:必須把上面 URL 貼給 user,不可省略)")
jq -n --arg ctx "$MSG" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'

exit 0
