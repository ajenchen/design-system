#!/usr/bin/env node
// scripts/setup-netlify-access.mjs — fork-and-go Netlify setup automation
//
// 2026-06-05 二修:免費 access control = Netlify Edge Function 自做 HTTP Basic Auth,不是 _headers / dashboard Password。
//
// Why Identity not used(注意:Identity 未 deprecated — 2025-02 曾公告,2026-02-19 官方撤回,仍 supported):
//   - Identity 是完整 signup/login 系統(要自己接 login UI widget),對「上個簡單密碼」是 overkill
//   - `netlify api provisionSiteIdentity` 在新 site 已不穩定 / 不可用
//
// Free-tier 真實可用 access control(2026-06-05 官方 docs + support forum 三重證實):
//   - Netlify Dashboard 的「Password protection」**與** `_headers` 的 Basic-Auth header **都是 Pro 方案專屬**
//     ($20/mo);free-tier 兩個都沒有(按下去會被要求升級付費 — 這就是 fork user 卡住的原因)。
//     (官方限制頁也載明 `_headers` 的 basic-auth header 不會套用到 edge function。)
//   - 免費要擋陌生人 → Netlify Edge Function 自己做 HTTP Basic Auth(讀 Authorization → 比對 → 回 401,
//     瀏覽器原生帳密彈窗)。Edge Functions 免費方案可用、`.netlify.app` 預設網址直接生效、無需自訂網域。
//   - 本 template 已內建:`netlify/edge-functions/basic-auth.ts` 從 Netlify env var `STORYBOOK_BASIC_AUTH`
//     (格式 "user:pass",多組空格分隔)讀帳密比對;netlify.toml 已 wire [[edge_functions]] path="/*"。
//     未設 env var = no-op 公開放行。密碼只存 Netlify 後台 env var(public repo 不能 commit 明文)。
//
// What's automated:
//   1. Install Netlify CLI(若未裝)
//   2. `gh auth status` pre-check
//   3. `netlify login`(瀏覽器 OAuth)
//   4. Auto `netlify sites:create` + `netlify link`(non-interactive)
//
// What's NOT automatable(Netlify CLI 不提供 edge-function Basic Auth 的 one-shot setup;走 dashboard 設 env var):
//   5. 設 STORYBOOK_BASIC_AUTH env var — script 印 dashboard URL + step-by-step,user 加一條 env var(30 秒)
//   6. 分享 帳密 給 stakeholder — team Slack / DM 私訊
//
// Usage:
//   npm run setup:netlify
//   npm run setup:netlify -- --skip-prompts   # CI / 老手:跳過 confirmation prompt

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const rl = readline.createInterface({ input: stdin, output: stdout })

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf8', ...opts })
}

function shOut(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() } catch { return '' }
}

const args = new Set(process.argv.slice(2))
const skipPrompts = args.has('--skip-prompts')

console.log('🔒 Netlify access control setup(免費方案 = Edge Function Basic Auth,讀 STORYBOOK_BASIC_AUTH env var)')
console.log('')
console.log('━━━ 流程概覽 ━━━')
console.log('  自動: CLI install + gh check + OAuth login + site 建 + 連 repo')
console.log('  手動: 開 dashboard URL → Environment variables 加 STORYBOOK_BASIC_AUTH = user:password(30 秒)')
console.log('  分享: 把 site URL + 帳密 私訊 stakeholder')
console.log('')
console.log('Netlify = 免費 deploy 平台(100GB bandwidth / per-branch preview / 0 maintenance)')
console.log('因為 fork 本 repo 必有 GitHub 帳號,Netlify 走 GitHub OAuth 自動建 account(<5 秒)')
console.log('')

// Step 0: gh CLI pre-check
const ghOut = shOut('gh auth status 2>&1')
if (ghOut.includes('Logged in')) {
  const userMatch = ghOut.match(/account\s+(\S+)/)
  const ghUser = userMatch ? userMatch[1] : '(unknown)'
  console.log(`✓ GitHub CLI 已 login(account: ${ghUser})`)
} else {
  console.log('⚠️ GitHub CLI 未 login(影響後續 Netlify 連 fork repo)')
  console.log('  建議先跑:gh auth login(瀏覽器 OAuth,1 分鐘)')
  if (!skipPrompts) {
    const proceed = await rl.question('  繼續 setup?(y/N)> ')
    if (!/^y/i.test(proceed)) { console.log('Aborted by user'); rl.close(); process.exit(1) }
  }
}
console.log('')

// Step 1: Netlify CLI(robust: global → npx fallback for locked-down env like Codespaces / sandbox / non-sudo Mac)
let netlifyCmd = 'netlify'
if (!shOut('which netlify')) {
  console.log('▶ Installing Netlify CLI globally...')
  try {
    sh('npm install -g netlify-cli')
  } catch (e) {
    console.log('  ⚠️ Global install failed(無 sudo / 鎖權限環境 — Codespaces 非 root user / 本地 macOS root-owned /usr/local 等)')
    console.log('  Fall back to `npx -y netlify-cli`(首次稍慢,後續 cache)')
    netlifyCmd = 'npx -y netlify-cli'
  }
}
console.log(`✓ Netlify CLI available(via "${netlifyCmd}")`)
console.log('')

// Step 2: Login
const whoami = shOut(`${netlifyCmd} status --json`)
if (!whoami.includes('"User"') && !whoami.includes('"name"')) {
  console.log('▶ Login to Netlify(browser 自動開啟,Codespaces 內走 VS Code port forward;點「Continue with GitHub」→ Authorize)...')
  sh(`${netlifyCmd} login`)
}
console.log('✓ Netlify logged in')
console.log('')

// Step 3: Link site(auto-create with predictable name)
if (!existsSync('.netlify/state.json')) {
  const repoName = JSON.parse(readFileSync('package.json', 'utf8')).name || 'ds-product-template'
  const ghUser = shOut('gh api user --jq .login') || 'user'
  const autoSiteName = `${ghUser}-${repoName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  console.log(`▶ Auto-create Netlify site "${autoSiteName}" + link this repo...`)
  try {
    sh(`${netlifyCmd} sites:create --name="${autoSiteName}" --account-slug=$(${netlifyCmd} api listAccountsForUser --json 2>/dev/null | jq -r '.[0].slug // "personal"' 2>/dev/null || echo personal)`)
    sh(`${netlifyCmd} link --name=${autoSiteName}`)
  } catch {
    console.log('⚠️ Auto-create failed(site name 可能已存在)。Fall back to interactive netlify init...')
    sh(`${netlifyCmd} init`)
  }
}
const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8'))
const siteId = state.siteId
const siteSlug = state.siteSlug || siteId
console.log(`✓ Linked site: ${siteId}`)
console.log('')

// Step 4: Print dashboard URL + env-var Basic Auth guidance(免費 — Edge Function netlify/edge-functions/basic-auth.ts)
const dashboardUrl = `https://app.netlify.com/projects/${siteSlug}/configuration/env`
const siteUrl = `https://${siteSlug}.netlify.app`

console.log('━━━ 🔒 免費密碼保護設定(30 秒,設一條 env var)━━━')
console.log('')
console.log('免費方案的擋人方法 = Netlify Edge Function 自做 HTTP Basic Auth(Edge Functions 所有方案含 free 都可用)。')
console.log('本 template 已內建(netlify/edge-functions/basic-auth.ts,netlify.toml 已 wire [[edge_functions]] path="/*"),')
console.log('你只需在 Netlify 後台加一條 env var,deploy 後站台自動跳帳密彈窗。')
console.log('(Netlify 內建密碼〔Dashboard「Password protection」與 _headers Basic-Auth〕都是 Pro 專屬 $20/mo,')
console.log(' 免費用不到 — 且 _headers basic-auth 也不套用到 edge function,故改用下面這招。)')
console.log('')
console.log(`  Step 1. 開啟 dashboard → Environment variables:`)
console.log(`          ${dashboardUrl}`)
console.log('')
console.log('  Step 2. Add a variable:')
console.log('          • Key:   STORYBOOK_BASIC_AUTH')
console.log('          • Value: user:password(自取帳密;多組空格分隔 "alice:pw1 bob:pw2")')
console.log('          • Save')
console.log('')
console.log('  Step 3. 觸發一次 deploy(push main 或 Netlify「Trigger deploy」)→ 站台自動上密碼。')
console.log('')
console.log('  Step 4. 把以下兩條私訊 stakeholder(Slack / team chat / DM):')
console.log(`          • Site URL: ${siteUrl}`)
console.log('          • 帳密:    <你剛才設的 user:password>')
console.log('')
console.log('進階(非必須,要更好體驗才升級):')
console.log('  • Pro Password Protection $20/mo — dashboard 開關,美化密碼頁、可只擋 deploy preview 放行 production')
console.log('  • Cloudflare Access(免費 50 user 真 SSO)— 需自架 Cloudflare proxy 在 Netlify 前面')
console.log('')

if (!skipPrompts) {
  const done = await rl.question('已在 Netlify 設好 STORYBOOK_BASIC_AUTH env var?(y/N)> ')
  if (!/^y/i.test(done)) {
    console.log('⚠️ 未設 env var = 站台公開(任何人有 URL 即可看)。回 dashboard 加 STORYBOOK_BASIC_AUTH 再 deploy。')
  } else {
    console.log('✅ env var 設好,下次 deploy 站台自動上密碼')
  }
}
console.log('')

console.log('━━━ 🚦 啟用草稿預覽(branch deploys — 給「預覽 → 確認 → 上線」流程)━━━')
console.log('  做產品時 AI 會推「草稿分支」,要 Netlify 給每個分支獨立預覽網址,需開 branch deploys:')
console.log(`     ${`https://app.netlify.com/projects/${siteSlug}/configuration/deploys#branches-and-deploy-contexts`}`)
console.log('     → Branch deploys → 選「Deploy all branches」(1 個開關)')
console.log('  開了之後:AI 推草稿分支 → 自動產生 https://<branch>--' + siteSlug + '.netlify.app 預覽網址(治理 hook 自動吐連結)。')
// best-effort:至少把 deploy previews(PR)打開(API 可靠的部分);branch deploys 全開靠上面 dashboard
try { execSync(`${netlifyCmd} api updateSite --data '{"site_id":"${siteId}","build_settings":{"skip_prs":false}}' 2>/dev/null`, { stdio: 'pipe' }); console.log('  ✓ deploy previews(PR-based 預覽)已試開') } catch { /* API 不保證,dashboard 為準 */ }
console.log('  (未開 branch deploys 也行 → 用 main 的密碼保護站當團隊預覽:push main,團隊在唯一網址看、外人被密碼擋。)')
console.log('')
console.log('━━━ 後續驗證 ━━━')
console.log(`  1. push main(或 Trigger deploy)後 2-3 min,Netlify Dashboard 看 ${siteUrl} 部署狀態`)
console.log('  2. 試開 site URL(無痕視窗)→ 應該見瀏覽器原生帳密彈窗')
console.log('  3. 輸入剛才設的 user:password → 看 storybook')
console.log('')
console.log('━━━ Defense-in-depth(已 ship in netlify.toml)━━━')
console.log('  • X-Robots-Tag: noindex — Google 不收錄 URL')
console.log('  • X-Frame-Options: SAMEORIGIN — 防 iframe 嵌入')
console.log('  • Referrer-Policy: strict-origin-when-cross-origin')
console.log('  ⚠️ Header 只防 SEO + iframe 嵌入,**真擋陌生人靠 Edge Function Basic Auth 那層(讀 env var)**')
console.log('')

console.log('✅ Setup complete!')

rl.close()
